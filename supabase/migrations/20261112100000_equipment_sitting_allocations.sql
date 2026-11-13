BEGIN;

ALTER TABLE public.service_sittings
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  ADD COLUMN IF NOT EXISTS collection_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (collection_fee >= 0),
  ADD COLUMN IF NOT EXISTS delivery_fee_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS collection_fee_manual boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.apply_quote_sitting_fees(
  p_quote_id uuid, p_company_id uuid, p_plan jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_sitting jsonb;
  v_sequence integer := 0;
  v_delivery numeric;
  v_collection numeric;
BEGIN
  IF jsonb_typeof(p_plan) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid sitting fee plan.';
  END IF;
  FOR v_sitting IN SELECT value FROM jsonb_array_elements(p_plan) LOOP
    v_sequence := v_sequence + 1;
    v_delivery := CASE WHEN v_sitting ? 'deliveryFee' THEN (v_sitting->>'deliveryFee')::numeric ELSE NULL END;
    v_collection := CASE WHEN v_sitting ? 'collectionFee' THEN (v_sitting->>'collectionFee')::numeric ELSE NULL END;
    IF v_delivery < 0 OR v_collection < 0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Sitting delivery and collection fees must be zero or more.';
    END IF;
    UPDATE public.service_sittings
      SET delivery_fee=coalesce(v_delivery,delivery_fee),
          collection_fee=coalesce(v_collection,collection_fee),
          delivery_fee_manual=CASE WHEN v_sitting ? 'deliveryFeeManual' THEN coalesce((v_sitting->>'deliveryFeeManual')::boolean,false) ELSE delivery_fee_manual END,
          collection_fee_manual=CASE WHEN v_sitting ? 'collectionFeeManual' THEN coalesce((v_sitting->>'collectionFeeManual')::boolean,false) ELSE collection_fee_manual END
      WHERE quote_id=p_quote_id AND company_id=p_company_id AND sequence_number=v_sequence AND order_id IS NULL;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.apply_quote_sitting_fees(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_quote_sitting_fees(uuid,uuid,jsonb) TO service_role;

-- Keep the sitting route fees in the same transaction as the quote plan and
-- quote price patch, so the invoice total and dispatch breakdown cannot drift.
CREATE OR REPLACE FUNCTION public.save_admin_quote_service_plan_with_venues(
  p_quote_id uuid, p_company_id uuid, p_plan jsonb, p_patch jsonb DEFAULT '{}', p_request_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.save_admin_quote_service_plan(p_quote_id,p_company_id,p_plan,p_patch,p_request_id);
  PERFORM public.apply_quote_sitting_venues(p_quote_id,p_company_id,p_plan);
  PERFORM public.apply_quote_sitting_fees(p_quote_id,p_company_id,p_plan);
END; $$;
REVOKE ALL ON FUNCTION public.save_admin_quote_service_plan_with_venues(uuid,uuid,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_quote_service_plan_with_venues(uuid,uuid,jsonb,jsonb,uuid) TO service_role;

-- Equipment remains on one order, but catalog reservations can be packed
-- for a specific sitting so drivers and the venue plan know where it goes.
ALTER TABLE public.equipment_bookings
  ADD COLUMN IF NOT EXISTS service_sitting_sequence integer;

ALTER TABLE public.equipment_bookings
  DROP CONSTRAINT IF EXISTS equipment_bookings_sitting_sequence_range,
  ADD CONSTRAINT equipment_bookings_sitting_sequence_range
    CHECK (service_sitting_sequence IS NULL OR service_sitting_sequence BETWEEN 1 AND 12);

CREATE INDEX IF NOT EXISTS idx_equipment_bookings_order_sitting
  ON public.equipment_bookings(order_id, service_sitting_sequence)
  WHERE status IS DISTINCT FROM 'cancelled';

CREATE OR REPLACE FUNCTION public.validate_equipment_booking_sitting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.service_sitting_sequence IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_sittings s
    WHERE s.order_id=NEW.order_id
      AND s.company_id=NEW.company_id
      AND s.sequence_number=NEW.service_sitting_sequence
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Equipment must be assigned to a sitting on this booking.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS validate_equipment_booking_sitting ON public.equipment_bookings;
CREATE TRIGGER validate_equipment_booking_sitting
  BEFORE INSERT OR UPDATE
  ON public.equipment_bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_equipment_booking_sitting();

NOTIFY pgrst, 'reload schema';
COMMIT;
