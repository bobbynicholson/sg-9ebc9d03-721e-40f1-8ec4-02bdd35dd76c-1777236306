-- Who brought each booked item back, and when.
--
-- equipment_bookings only recorded status='returned' + returned_quantity,
-- so once equipment was back nobody could see who returned it (driver on a
-- collection trip, or the waiter on a waiter-return job) or when. The shared
-- return step (equipmentReturnService.returnOrderEquipment) now stamps both;
-- the order page shows "Back at base <time> by <name>".
--
-- Idempotent - safe to run repeatedly.

ALTER TABLE public.equipment_bookings
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.equipment_bookings.returned_at IS 'When the item was counted back at base.';
COMMENT ON COLUMN public.equipment_bookings.returned_by_user_id IS 'Driver or waiter who brought it back (equipmentReturnService).';
