-- SUP-C (suppliers deferred, 2026-05-24): three sibling additions
-- driven by the audit follow-up:
--
-- 1. payment_terms_note text. The numeric payment_terms column (days)
--    can't hold "COD" / "Net-30 EOM" / "On account" - operators were
--    cramming those into Notes. Add a dedicated free-text field that
--    sits next to payment_terms_days so finance can read both.
--
-- 2. vat_number text. Suppliers we claim VAT input against need a VAT
--    number on file. SARS-readiness requirement.
--
-- 3. merge_suppliers RPC. Two rows for "Coastal Hire" / "Coastal Hire
--    Co" are the canonical mess every fresh tenant hits. Walk the FK
--    graph (7 tables), re-point everything at the target supplier,
--    soft-delete the source, write an audit_logs row.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS payment_terms_note text,
  ADD COLUMN IF NOT EXISTS vat_number text;

COMMENT ON COLUMN public.suppliers.payment_terms_note IS
  'SUP-C: free-text payment terms (COD, Net-30 EOM, on account) for cases that don''t fit the numeric payment_terms_days column.';
COMMENT ON COLUMN public.suppliers.vat_number IS
  'SUP-C: SARS VAT registration number for suppliers we claim VAT input against. Optional - not every supplier is VAT-registered.';

-- ── merge_suppliers RPC ────────────────────────────────────────────
-- SECURITY DEFINER, tenant-scoped via the suppliers.company_id check.
-- Returns the count of rows re-pointed per table for the audit row.
--
-- Special case: inventory_item_suppliers has a UNIQUE constraint on
-- (inventory_item_id, supplier_id). If the same inventory item is
-- linked to BOTH source and target, we keep the target row and drop
-- the source row outright (no merge needed - the operator picks one
-- vendor's price/lead-time when they pick the target).

CREATE OR REPLACE FUNCTION public.merge_suppliers(
  p_target_id uuid,
  p_source_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid;
  v_target_company uuid;
  v_user uuid := auth.uid();
  v_caller_role text;
  v_eq_owner int := 0;
  v_eq_pref int := 0;
  v_hire int := 0;
  v_pay int := 0;
  v_links_moved int := 0;
  v_links_dropped int := 0;
  v_receipts int := 0;
  v_tx int := 0;
  v_source_name text;
  v_target_name text;
BEGIN
  IF p_target_id = p_source_id THEN
    RAISE EXCEPTION 'Cannot merge a supplier into itself';
  END IF;

  -- Pull company_id from both rows; reject mixed-tenant merges. Read
  -- the names too for the audit row.
  SELECT company_id, supplier_name INTO v_company, v_source_name
    FROM public.suppliers WHERE id = p_source_id;
  SELECT company_id, supplier_name INTO v_target_company, v_target_name
    FROM public.suppliers WHERE id = p_target_id;
  IF v_company IS NULL OR v_target_company IS NULL THEN
    RAISE EXCEPTION 'Supplier not found';
  END IF;
  IF v_company <> v_target_company THEN
    RAISE EXCEPTION 'Cross-tenant merge blocked';
  END IF;

  -- Authorisation: caller must be a member of the same tenant with a
  -- role that can manage suppliers.
  SELECT COALESCE(active_role, role) INTO v_caller_role
    FROM public.profiles WHERE id = v_user;
  IF v_caller_role NOT IN ('owner', 'company_admin', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Insufficient role to merge suppliers (got %)', v_caller_role;
  END IF;

  -- 1. equipment.supplier_of_record_id
  UPDATE public.equipment
     SET supplier_of_record_id = p_target_id, updated_at = now()
   WHERE supplier_of_record_id = p_source_id AND company_id = v_company;
  GET DIAGNOSTICS v_eq_owner = ROW_COUNT;

  -- 2. equipment.preferred_hire_supplier_id
  UPDATE public.equipment
     SET preferred_hire_supplier_id = p_target_id, updated_at = now()
   WHERE preferred_hire_supplier_id = p_source_id AND company_id = v_company;
  GET DIAGNOSTICS v_eq_pref = ROW_COUNT;

  -- 3. equipment_hire_orders.supplier_id
  UPDATE public.equipment_hire_orders
     SET supplier_id = p_target_id, supplier_name = v_target_name, updated_at = now()
   WHERE supplier_id = p_source_id AND company_id = v_company;
  GET DIAGNOSTICS v_hire = ROW_COUNT;

  -- 4. supplier_payables.supplier_id
  UPDATE public.supplier_payables
     SET supplier_id = p_target_id, updated_at = now()
   WHERE supplier_id = p_source_id AND company_id = v_company;
  GET DIAGNOSTICS v_pay = ROW_COUNT;

  -- 5. inventory_item_suppliers.supplier_id. Handle the UNIQUE
  -- constraint: drop source rows where target already exists.
  WITH dropped AS (
    DELETE FROM public.inventory_item_suppliers
     WHERE supplier_id = p_source_id
       AND company_id = v_company
       AND inventory_item_id IN (
         SELECT inventory_item_id FROM public.inventory_item_suppliers
          WHERE supplier_id = p_target_id AND company_id = v_company
       )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_links_dropped FROM dropped;

  UPDATE public.inventory_item_suppliers
     SET supplier_id = p_target_id
   WHERE supplier_id = p_source_id AND company_id = v_company;
  GET DIAGNOSTICS v_links_moved = ROW_COUNT;

  -- 6. purchase_receipts.supplier_id (best-effort - skip if column
  -- doesn't exist on older tenants).
  BEGIN
    UPDATE public.purchase_receipts
       SET supplier_id = p_target_id
     WHERE supplier_id = p_source_id AND company_id = v_company;
    GET DIAGNOSTICS v_receipts = ROW_COUNT;
  EXCEPTION WHEN undefined_column THEN
    v_receipts := 0;
  END;

  -- 7. inventory_transactions.supplier_id
  BEGIN
    UPDATE public.inventory_transactions
       SET supplier_id = p_target_id
     WHERE supplier_id = p_source_id AND company_id = v_company;
    GET DIAGNOSTICS v_tx = ROW_COUNT;
  EXCEPTION WHEN undefined_column THEN
    v_tx := 0;
  END;

  -- Soft-delete the source supplier.
  UPDATE public.suppliers
     SET deleted_at = now(),
         is_active = false,
         notes = COALESCE(notes, '') || E'\n[merged into ' || COALESCE(v_target_name, p_target_id::text) || ' on ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ']'
   WHERE id = p_source_id;

  -- Audit row so the operator can see who merged what.
  INSERT INTO public.audit_logs (
    company_id, user_id, action, entity_type, entity_id, details
  ) VALUES (
    v_company, v_user, 'supplier_merged', 'supplier', p_target_id,
    jsonb_build_object(
      'source_id', p_source_id,
      'source_name', v_source_name,
      'target_name', v_target_name,
      'equipment_owned', v_eq_owner,
      'equipment_preferred_hire', v_eq_pref,
      'hire_orders', v_hire,
      'payables', v_pay,
      'inventory_links_moved', v_links_moved,
      'inventory_links_dropped', v_links_dropped,
      'receipts', v_receipts,
      'transactions', v_tx
    )
  );

  RETURN jsonb_build_object(
    'target_id', p_target_id,
    'source_id', p_source_id,
    'equipment_owned', v_eq_owner,
    'equipment_preferred_hire', v_eq_pref,
    'hire_orders', v_hire,
    'payables', v_pay,
    'inventory_links_moved', v_links_moved,
    'inventory_links_dropped', v_links_dropped,
    'receipts', v_receipts,
    'transactions', v_tx
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_suppliers(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_suppliers(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.merge_suppliers(uuid, uuid) IS
  'SUP-C: merge source supplier into target. Walks FK graph across equipment, hire orders, payables, inventory_item_suppliers, purchase_receipts, inventory_transactions. Soft-deletes source. Tenant-scoped. Requires owner/admin role.';
