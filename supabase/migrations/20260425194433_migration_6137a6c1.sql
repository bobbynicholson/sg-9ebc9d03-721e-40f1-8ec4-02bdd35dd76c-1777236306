-- Remove the default value from role and active_role columns
ALTER TABLE profiles 
  ALTER COLUMN role DROP DEFAULT,
  ALTER COLUMN active_role DROP DEFAULT;