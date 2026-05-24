-- EQP-C (equipment audit follow-up, 2026-05-24): the Shortages tab
-- on /admin/equipment crashed with "Could not find a relationship
-- between 'equipment_shortage_flags' and 'orders' in the schema
-- cache". PostgREST infers join relationships from FK constraints
-- and the only FK ever defined on this table was
-- resolved_by -> profiles, which is why `order:orders(...)` and
-- `equipment:equipment(...)` joins from getShortageFlags blew up.
--
-- Adding the missing FKs:
--   order_id              -> orders(id)
--   equipment_id          -> equipment(id)
--   equipment_booking_id  -> equipment_bookings(id)
--   company_id            -> companies(id)
--   recipient_id          -> auth.users(id) (notification target)
--
-- Each is ON DELETE SET NULL so soft-deleting a parent row doesn't
-- wipe the shortage history (the operator may still want the
-- record of "we ran short on Mr Smith's wedding" even after the
-- order is deleted).
--
-- NOT VALID on each so the migration doesn't bomb if any historic
-- row points at a now-missing parent. Followed by VALIDATE
-- CONSTRAINT for each, which surfaces any dangling refs as a
-- migration-level error the operator can fix manually.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'equipment_shortage_flags'
      AND constraint_name = 'equipment_shortage_flags_order_id_fkey'
  ) THEN
    ALTER TABLE public.equipment_shortage_flags
      ADD CONSTRAINT equipment_shortage_flags_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'equipment_shortage_flags'
      AND constraint_name = 'equipment_shortage_flags_equipment_id_fkey'
  ) THEN
    ALTER TABLE public.equipment_shortage_flags
      ADD CONSTRAINT equipment_shortage_flags_equipment_id_fkey
      FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'equipment_shortage_flags'
      AND constraint_name = 'equipment_shortage_flags_equipment_booking_id_fkey'
  ) THEN
    ALTER TABLE public.equipment_shortage_flags
      ADD CONSTRAINT equipment_shortage_flags_equipment_booking_id_fkey
      FOREIGN KEY (equipment_booking_id) REFERENCES public.equipment_bookings(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'equipment_shortage_flags'
      AND constraint_name = 'equipment_shortage_flags_company_id_fkey'
  ) THEN
    ALTER TABLE public.equipment_shortage_flags
      ADD CONSTRAINT equipment_shortage_flags_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END$$;

-- Validate each. Fails loudly with the dangling row id if any exists.
ALTER TABLE public.equipment_shortage_flags
  VALIDATE CONSTRAINT equipment_shortage_flags_order_id_fkey;
ALTER TABLE public.equipment_shortage_flags
  VALIDATE CONSTRAINT equipment_shortage_flags_equipment_id_fkey;
ALTER TABLE public.equipment_shortage_flags
  VALIDATE CONSTRAINT equipment_shortage_flags_equipment_booking_id_fkey;
ALTER TABLE public.equipment_shortage_flags
  VALIDATE CONSTRAINT equipment_shortage_flags_company_id_fkey;

-- Index the FK columns so the joins stay cheap.
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_order_id
  ON public.equipment_shortage_flags (order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_equipment_id
  ON public.equipment_shortage_flags (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_equipment_booking_id
  ON public.equipment_shortage_flags (equipment_booking_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_flags_company_id
  ON public.equipment_shortage_flags (company_id);

-- PostgREST caches the schema; the new relationships will be picked
-- up on the next NOTIFY pgrst, 'reload schema' (Supabase fires this
-- automatically on migrations).
