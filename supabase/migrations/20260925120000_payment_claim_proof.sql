-- Optional proof attached to an EFT claim. The object stays in a private
-- storage bucket and is only exposed through an authenticated signed URL.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_proof_path TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_uploaded_at TIMESTAMPTZ;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;
