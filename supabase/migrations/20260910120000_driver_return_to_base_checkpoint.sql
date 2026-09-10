-- Keep the driver shift open after leaving the venue. The shift closes only
-- when the driver confirms they are back at the kitchen or warehouse.

ALTER TABLE public.driver_confirmations
  DROP CONSTRAINT IF EXISTS driver_confirmations_confirmation_type_check;

ALTER TABLE public.driver_confirmations
  ADD CONSTRAINT driver_confirmations_confirmation_type_check
  CHECK (confirmation_type IN (
    'en_route_to_kitchen',
    'at_kitchen',
    'departed_kitchen',
    'at_venue',
    'setup_started',
    'service_started',
    'departed_venue',
    'returned_to_base',
    'completed'
  ));

COMMENT ON COLUMN public.driver_confirmations.confirmation_type IS
  'Driver event checkpoint. returned_to_base is the final delivery-leg checkpoint and closes the driver shift timer.';
