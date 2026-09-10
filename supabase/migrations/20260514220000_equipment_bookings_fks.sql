-- Wave 30.2: equipment_bookings was missing every foreign key.
--
-- Symptom Callum reported: opening an order on /admin/orders, the
-- Equipment tab said "No equipment booked for this order" even though
-- the booking row existed (Bowl x10 for ORD-003827).
--
-- Cause: the drawer query embeds the equipment row inline:
--   .from("equipment_bookings")
--   .select("..., equipment:equipment(name, daily_rate)")
-- PostgREST resolves embeds via the FK metadata it pulls from the
-- catalog. equipment_bookings had no FK at all, so the embed could
-- not resolve, the request 400-ed, and the front-end fell through to
-- setEquipmentBookings([]) -- empty state. Worked on the per-row
-- timeline path because that query doesn't embed.
--
-- Fix: add the equipment_id FK so the embed resolves. Restricted ON
-- DELETE so deleting an equipment row that's still booked errors
-- loudly -- safer than cascading away historical bookings finance
-- might still need to reconcile against. Index colocated for the
-- usual lookup pattern.

ALTER TABLE public.equipment_bookings
  ADD CONSTRAINT equipment_bookings_equipment_id_fkey
  FOREIGN KEY (equipment_id)
  REFERENCES public.equipment(id)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_equipment_bookings_equipment_id
  ON public.equipment_bookings (equipment_id);

-- Tell PostgREST to refresh its schema cache immediately so the
-- embed becomes available without a server restart / pause.
NOTIFY pgrst, 'reload schema';
