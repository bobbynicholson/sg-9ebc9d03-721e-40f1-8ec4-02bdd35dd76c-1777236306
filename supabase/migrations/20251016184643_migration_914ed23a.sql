-- Drop existing policies that conflict
DROP POLICY IF EXISTS "Company staff can view their company" ON companies;
DROP POLICY IF EXISTS "Company owners can view their own companies" ON companies;
DROP POLICY IF EXISTS "Company owners can update their companies" ON companies;
DROP POLICY IF EXISTS "Users can insert companies during signup" ON companies;

-- Drop any existing policies on other tables
DROP POLICY IF EXISTS "Company staff can view company orders" ON orders;
DROP POLICY IF EXISTS "Company staff can create company orders" ON orders;
DROP POLICY IF EXISTS "Company staff can update company orders" ON orders;
DROP POLICY IF EXISTS "Company staff can delete company orders" ON orders;

DROP POLICY IF EXISTS "Company staff can view company inventory" ON inventory;
DROP POLICY IF EXISTS "Company staff can create company inventory" ON inventory;
DROP POLICY IF EXISTS "Company staff can update company inventory" ON inventory;
DROP POLICY IF EXISTS "Company staff can delete company inventory" ON inventory;

DROP POLICY IF EXISTS "Company staff can view company equipment" ON equipment;
DROP POLICY IF EXISTS "Company staff can create company equipment" ON equipment;
DROP POLICY IF EXISTS "Company staff can update company equipment" ON equipment;
DROP POLICY IF EXISTS "Company staff can delete company equipment" ON equipment;