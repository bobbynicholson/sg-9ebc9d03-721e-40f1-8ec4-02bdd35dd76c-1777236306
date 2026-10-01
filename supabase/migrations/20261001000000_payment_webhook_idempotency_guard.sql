-- Prevent concurrent provider webhook retries from inserting the same
-- gateway transaction twice. The application checks for an existing row
-- before calling the payment RPC, but two requests can pass that check at
-- the same time. New provider-backed rows are guarded by unique indexes;
-- historical rows stay outside the indexes so this migration does not
-- depend on cleaning old ledger data during deployment.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_dedupe_guard boolean;

CREATE OR REPLACE FUNCTION public.set_payment_dedupe_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.gateway_provider IS NOT NULL
     AND (NEW.gateway_transaction_id IS NOT NULL OR NEW.transaction_id IS NOT NULL) THEN
    NEW.payment_dedupe_guard := true;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS payments_set_dedupe_guard ON public.payments;
CREATE TRIGGER payments_set_dedupe_guard
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_payment_dedupe_guard();

CREATE UNIQUE INDEX IF NOT EXISTS payments_gateway_tx_guard_unique
  ON public.payments (gateway_provider, gateway_transaction_id)
  WHERE payment_dedupe_guard IS TRUE
    AND gateway_provider IS NOT NULL
    AND gateway_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_tx_guard_unique
  ON public.payments (gateway_provider, transaction_id)
  WHERE payment_dedupe_guard IS TRUE
    AND gateway_provider IS NOT NULL
    AND transaction_id IS NOT NULL;

COMMENT ON COLUMN public.payments.payment_dedupe_guard IS
  'True for provider-backed rows inserted after webhook idempotency enforcement was added.';
