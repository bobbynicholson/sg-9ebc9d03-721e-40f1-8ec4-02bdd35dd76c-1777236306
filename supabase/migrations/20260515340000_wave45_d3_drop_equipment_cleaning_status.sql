-- Wave 45 D3 -- drop the legacy equipment_cleaning_status table.
--
-- Wave 41 P2 introduced cleaning_jobs as the canonical
-- equipment-availability ledger. Wave 42 T2 + Wave 45 D3
-- migrated every reader/writer to it. Final state confirmed
-- before drop:
--   - row count = 0 in production at time of drop
--   - all 5 application readers (orderWorkflow auto-insert,
--     equipmentTrackingService.{create,update,getOrder,getPending}
--     CleaningStatus, /admin/orders batch fetch) point at
--     cleaning_jobs
--   - CleaningWorkflowTracker.tsx (the only UI consumer of the
--     legacy 5-state model) deleted
--   - zero pg_proc / pg_trigger references the table
--
-- CASCADE drops the dependent RLS policies + indexes. No FK
-- chains pointed at this table so nothing else is affected.

DROP TABLE IF EXISTS public.equipment_cleaning_status CASCADE;
