-- ===== 20260703120000_fix_invoices_client_rls_leak.sql =====
-- SECURITY (P0): a logged-in CLIENT could read EVERY invoice in the
-- caterer's tenant, not just their own.
--
-- Root cause: policy `company_access_invoices` is
--   FOR ALL TO authenticated
--   USING (company_id = get_user_company_id(auth.uid()) OR super_admin)
-- Client accounts are provisioned with profiles.company_id = the
-- caterer's company_id (role='client'), so get_user_company_id() returns
-- the caterer's company and the company-wide predicate is TRUE for every
-- invoice row. Verified live on prod 2026-07-03: a client JWT read all
-- 121 of the tenant's invoices via PostgREST (scripts/probe-rls-client-leak.mjs).
--
-- orders + clients were already narrowed by earlier Wave-45 policies on
-- prod (the client saw 0 of each), so only invoices is actually leaking.
--
-- Fix:
--   1. Rescope company_access_invoices to EXCLUDE clients from the
--      company-wide branch (staff/owner + super_admin only).
--   2. Add a client-scoped SELECT policy so a client still sees exactly
--      their own invoices. invoices has no client_email column, so we
--      resolve ownership through clients: a clients row is "theirs" when
--      clients.user_id = auth.uid() (signup-linked) OR clients.email
--      matches their profile email (orphan rows booked pre-signup) --
--      the same two linkage paths useTenantClientIds.ts uses in the app.
--
-- RLS_OPT_OUT: no CREATE TABLE here; policy-only migration.

-- 1. Company staff/owner + super_admin: full access, clients excluded.
DROP POLICY IF EXISTS company_access_invoices ON public.invoices;
CREATE POLICY company_access_invoices
  ON public.invoices
  FOR ALL
  TO authenticated
  USING (
    (
      company_id = get_user_company_id((SELECT auth.uid()))
      AND (SELECT p.role FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
            <> 'client'::user_role
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'super_admin'::user_role
    )
  )
  WITH CHECK (
    (
      company_id = get_user_company_id((SELECT auth.uid()))
      AND (SELECT p.role FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
            <> 'client'::user_role
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'super_admin'::user_role
    )
  );

-- 2. Clients: read-only, only invoices tied to their own client record(s).
DROP POLICY IF EXISTS client_read_own_invoices ON public.invoices;
CREATE POLICY client_read_own_invoices
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT c.id
      FROM public.clients c
      WHERE c.company_id = public.invoices.company_id
        AND (
          c.user_id = (SELECT auth.uid())
          OR lower(c.email) = lower(
               (SELECT p.email FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
             )
        )
    )
  );


-- ===== 20260703130000_atomic_inventory_decrement.sql =====
-- Atomic inventory stock decrement (fixes a lost-update race).
--
-- inventoryDeductionService deducts per-ingredient with a read-modify-
-- write: newStock = current_stock (from an earlier SELECT) - amount, then
-- an absolute UPDATE. The order-level claim only stops the SAME order
-- double-deducting; two DIFFERENT orders delivered in the same instant
-- both read stock=10 and one write is lost. Shared ingredients (used by
-- most recipes) silently over-report -> wrong COGS + reorder thresholds.
--
-- This SECURITY DEFINER function does the decrement under a row lock
-- (SELECT ... FOR UPDATE), so concurrent callers serialise and no update
-- is lost. Returns old/new/deducted so the caller can still write the
-- usage transaction (deducted) and low-stock alert (new_stock).
--
-- RLS_OPT_OUT: function only; no CREATE TABLE.

CREATE OR REPLACE FUNCTION public.deduct_inventory_stock(
  p_item_id uuid,
  p_amount numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_stock numeric;
  new_stock numeric;
BEGIN
  SELECT current_stock INTO old_stock
  FROM public.inventory_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF old_stock IS NULL THEN
    RETURN NULL; -- item not found; caller keeps its "not found" warning path
  END IF;

  -- Deduct up to the requested amount, never below zero (mirrors the
  -- old min(current_stock, needed) clamp, now atomic).
  new_stock := GREATEST(0, old_stock - GREATEST(0, p_amount));

  UPDATE public.inventory_items
  SET current_stock = new_stock
  WHERE id = p_item_id;

  RETURN json_build_object(
    'old_stock', old_stock,
    'new_stock', new_stock,
    'deducted', old_stock - new_stock
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_inventory_stock(uuid, numeric) TO authenticated, service_role;


-- ===== 20260703140000_notification_insert_recipient_scope.sql =====
-- SECURITY: block cross-tenant notification injection.
--
-- tenant_or_self_create_notifications (Wave 45) lets an authenticated
-- user INSERT any row where company_id = their own company_id, WITHOUT
-- checking recipient_id. An attacker in tenant A can insert
--   { company_id: A, recipient_id: <victim uid in tenant B>, title/message: ... }
-- The victim reads it via the recipient_id = auth.uid() SELECT policy and
-- their unread badge (notificationService.getUnreadCount, no company
-- filter) increments -- an authenticated cross-tenant spam/phishing vector.
--
-- Fix: in the company branch, require the recipient to belong to the
-- row's company. Self-insert branches (recipient_id/user_id = auth.uid())
-- and the service_role bypass are unchanged, so all legitimate inserts
-- (including server-side fan-out via service role) keep working.
--
-- RLS_OPT_OUT: policy only; no CREATE TABLE.

DROP POLICY IF EXISTS tenant_or_self_create_notifications ON public.notifications;
CREATE POLICY tenant_or_self_create_notifications
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    ((SELECT auth.role()) = 'service_role')
    OR (
      ((SELECT auth.role()) = 'authenticated')
      AND (
        recipient_id = (SELECT auth.uid())
        OR user_id = (SELECT auth.uid())
        OR (
          company_id IS NOT NULL
          AND company_id = (
            SELECT p.company_id FROM public.profiles p
            WHERE p.id = (SELECT auth.uid())
            LIMIT 1
          )
          AND (
            recipient_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.profiles rp
              WHERE rp.id = notifications.recipient_id
                AND rp.company_id = notifications.company_id
            )
          )
        )
      )
    )
  );


-- ===== 20260704090000_whitelist_driver_event_day_stamps.sql =====
-- Bug fix (driver feedback 2026-07-04, Pic 84): capturing a POD failed with
-- "orders.update denied: driver writes restricted to status / *_at / POD /
-- driver_ack / assignment columns".
--
-- Root cause: the driver's on-site taps insert a driver_confirmations row,
-- and the AFTER INSERT trigger tg_stamp_order_event_day
-- (stamp_order_event_day_from_confirmation, SECURITY DEFINER) mirrors the
-- moment onto orders (arrived_at_venue_at / setup_started_at /
-- service_started_at / departed_venue_at / service_ended_at /
-- event_complete_at). SECURITY DEFINER changes the ROLE but not auth.uid(),
-- so enforce_orders_column_whitelist still sees the driver and rejects the
-- mirrored columns - they were never added to v_driver_whitelist. The
-- exception aborts the driver_confirmations INSERT itself, so:
--   * POD capture at venue errors out entirely (Pic 84), and
--   * setup/service/departed taps silently never stamp the timeline
--     (Pic 80's stale stage strip).
--
-- Fix: add the event-day stamp columns to the driver whitelist. They are
-- exactly the "*_at" progress stamps the error message claims to allow.
-- Everything else (self-claim rules, assignment_score guard, kitchen /
-- cleaning branch) is unchanged from 20260519190000.

CREATE OR REPLACE FUNCTION public.enforce_orders_column_whitelist()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller       UUID := auth.uid();
  v_caller_role  TEXT;
  v_caller_company UUID;
  v_admin_roles  CONSTANT TEXT[] := ARRAY['admin', 'company_admin', 'super_admin', 'owner'];
  v_driver_whitelist CONSTANT TEXT[] := ARRAY[
    'status', 'updated_at',
    'confirmed_at', 'ready_at', 'picked_up_at', 'delivered_at', 'completed_at',
    'arrived_at_venue_at', 'setup_started_at', 'service_started_at',
    'departed_venue_at', 'service_ended_at', 'event_complete_at',
    'pod_photo_url', 'pod_signature_url', 'pod_recipient_name', 'pod_captured_at',
    'driver_acknowledged_at', 'driver_acknowledged_via',
    'assigned_driver_id', 'driver_id', 'assigned_at', 'assignment_score'
  ];
  v_kitchen_whitelist CONSTANT TEXT[] := ARRAY[
    'status', 'updated_at', 'confirmed_at', 'ready_at', 'completed_at'
  ];
BEGIN
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role::text, company_id INTO v_caller_role, v_caller_company
  FROM public.profiles WHERE id = v_caller;
  IF v_caller_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_caller_role = ANY (v_admin_roles)
     OR v_caller_role IN ('admin', 'company_admin', 'super_admin') THEN
    RETURN NEW;
  END IF;

  IF v_caller_role = 'driver' THEN
    -- Allow the self-claim case (NULL -> self) up front so the
    -- "must already be assigned" guard below doesn't reject it.
    IF NOT (
      OLD.assigned_driver_id = v_caller
      OR OLD.driver_id = v_caller
      OR (OLD.assigned_driver_id IS NULL AND NEW.assigned_driver_id = v_caller)
    ) THEN
      RAISE EXCEPTION 'orders.update denied: driver % is not assigned to order %', v_caller, OLD.id;
    END IF;

    -- assigned_driver_id transitions:
    --   self -> NULL  (release)
    --   NULL -> self  (claim)
    -- anything else is rejected.
    IF OLD.assigned_driver_id IS DISTINCT FROM NEW.assigned_driver_id THEN
      IF NOT (
        (OLD.assigned_driver_id = v_caller AND NEW.assigned_driver_id IS NULL)
        OR (OLD.assigned_driver_id IS NULL AND NEW.assigned_driver_id = v_caller)
      ) THEN
        RAISE EXCEPTION 'orders.update denied: driver may only claim (NULL to self) or release (self to NULL) their own assigned_driver_id';
      END IF;
    END IF;

    IF OLD.assignment_score IS DISTINCT FROM NEW.assignment_score
       AND NEW.assignment_score IS NOT NULL THEN
      RAISE EXCEPTION 'orders.update denied: driver may only NULL assignment_score';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_each(to_jsonb(OLD)) AS o(key, value)
      JOIN jsonb_each(to_jsonb(NEW)) AS n USING (key)
      WHERE o.value IS DISTINCT FROM n.value
        AND NOT (o.key = ANY (v_driver_whitelist))
    ) THEN
      RAISE EXCEPTION 'orders.update denied: driver writes restricted to status / *_at / POD / driver_ack / assignment columns';
    END IF;

    RETURN NEW;
  END IF;

  IF v_caller_role = 'kitchen_staff' OR v_caller_role = 'cleaning_staff' THEN
    IF v_caller_company IS NULL OR OLD.company_id IS DISTINCT FROM v_caller_company THEN
      RAISE EXCEPTION 'orders.update denied: % cannot write outside own company', v_caller_role;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_each(to_jsonb(OLD)) AS o(key, value)
      JOIN jsonb_each(to_jsonb(NEW)) AS n USING (key)
      WHERE o.value IS DISTINCT FROM n.value
        AND NOT (o.key = ANY (v_kitchen_whitelist))
    ) THEN
      RAISE EXCEPTION 'orders.update denied: % writes restricted to status + status timestamps', v_caller_role;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'orders.update denied: role % has no permitted UPDATE path on orders', v_caller_role;
END;
$function$;


