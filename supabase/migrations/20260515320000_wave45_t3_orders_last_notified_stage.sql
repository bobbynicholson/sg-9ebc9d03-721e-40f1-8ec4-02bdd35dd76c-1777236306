-- Wave 45 T3 -- per-stage notification engine snapshot column.
--
-- Tracks the most recent timeline stage we broadcast for each
-- order so the cron can fire only on transitions, not every 15
-- minutes for the same stage.
--
-- Schema-only -- no functional change until the cron lands. NULL
-- means we haven't broadcast for this order yet (first run will
-- fire one notification with the current stage).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS last_notified_stage_key TEXT,
  ADD COLUMN IF NOT EXISTS last_notified_stage_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.last_notified_stage_key IS
  'Wave 45 T3. Most recent OrderTimeline.currentStageKey we broadcast a stage_advance notification for. NULL = never notified.';

COMMENT ON COLUMN public.orders.last_notified_stage_at IS
  'Wave 45 T3. When the last stage_advance notification fired. Used for >24h staleness escalation in future waves.';
