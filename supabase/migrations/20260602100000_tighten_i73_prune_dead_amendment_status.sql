-- TIGHTEN I.73 (2026-06-02): order_amendment_requests.status had two
-- dead values (auto_rejected_late, cancelled_by_client) plus one
-- phantom (superseded) the UI rendered but no code path ever wrote.
-- Confirmed via grep across the repo + a live count(*) over the table.
-- Tightening the CHECK constraint to the live set so the schema
-- documents the real lifecycle and a future bug can't write garbage.
ALTER TABLE order_amendment_requests
  DROP CONSTRAINT IF EXISTS order_amendment_requests_status_check;

ALTER TABLE order_amendment_requests
  ADD CONSTRAINT order_amendment_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));
