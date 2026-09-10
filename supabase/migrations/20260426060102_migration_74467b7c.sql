-- 4. Check if we need to add accuracy, heading, speed to gps_tracking
ALTER TABLE gps_tracking
  ADD COLUMN IF NOT EXISTS accuracy NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS heading NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS speed NUMERIC(10,2);