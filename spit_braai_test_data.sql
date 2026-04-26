-- ============================================
-- SPIT BRAAI DELIVERY - COMPLETE TEST DATA SETUP
-- ============================================
-- Run this SQL script in your Supabase SQL Editor
-- This will create all test users with profiles
-- ============================================

-- IMPORTANT: You must create the auth users manually in Supabase Dashboard first!
-- This script only creates the profiles and links them to existing auth users

DO $$
DECLARE
  v_company_id UUID;
  v_super_admin_id UUID;
  v_owner_id UUID;
  v_admin_id UUID;
  v_kitchen_id UUID;
  v_driver_id UUID;
  v_shopping_id UUID;
  v_cleaning_id UUID;
  v_client_id UUID;
BEGIN
  -- Get company ID
  SELECT id INTO v_company_id FROM companies WHERE slug = 'spit-braai-delivery';
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Company not found! Please create company first.';
  END IF;

  -- Get auth user IDs (these must exist in auth.users first!)
  SELECT id INTO v_super_admin_id FROM auth.users WHERE email = 'superadmin@cateringms.com';
  SELECT id INTO v_owner_id FROM auth.users WHERE email = 'hello@spitbraaidelivery.co.za';
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@spitbraaidelivery.co.za';
  SELECT id INTO v_kitchen_id FROM auth.users WHERE email = 'kitchen@spitbraaidelivery.co.za';
  SELECT id INTO v_driver_id FROM auth.users WHERE email = 'driver@spitbraaidelivery.co.za';
  SELECT id INTO v_shopping_id FROM auth.users WHERE email = 'shopping@spitbraaidelivery.co.za';
  SELECT id INTO v_cleaning_id FROM auth.users WHERE email = 'cleaning@spitbraaidelivery.co.za';
  SELECT id INTO v_client_id FROM auth.users WHERE email = 'client@test.com';

  -- Create/Update Profiles
  
  -- Super Admin
  IF v_super_admin_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, full_name, role, active_role, phone)
    VALUES (v_super_admin_id, 'superadmin@cateringms.com', 'Super Admin', 'super_admin', 'super_admin', '+27 11 111 1111')
    ON CONFLICT (id) DO UPDATE SET
      email = 'superadmin@cateringms.com',
      full_name = 'Super Admin',
      role = 'super_admin',
      active_role = 'super_admin',
      phone = '+27 11 111 1111';
  END IF;

  -- Company Owner
  IF v_owner_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, full_name, role, active_role, phone, company_id)
    VALUES (v_owner_id, 'hello@spitbraaidelivery.co.za', 'Callum Rogers', 'company_admin', 'company_admin', '+27 82 222 2222', v_company_id)
    ON CONFLICT (id) DO UPDATE SET
      email = 'hello@spitbraaidelivery.co.za',
      full_name = 'Callum Rogers',
      role = 'company_admin',
      active_role = 'company_admin',
      phone = '+27 82 222 2222',
      company_id = v_company_id;
  END IF;

  -- Admin Staff
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, full_name, role, active_role, phone, company_id)
    VALUES (v_admin_id, 'admin@spitbraaidelivery.co.za', 'Admin Staff', 'admin', 'admin', '+27 82 333 3333', v_company_id)
    ON CONFLICT (id) DO UPDATE SET
      email = 'admin@spitbraaidelivery.co.za',
      full_name = 'Admin Staff',
      role = 'admin',
      active_role = 'admin',
      phone = '+27 82 333 3333',
      company_id = v_company_id;
  END IF;

  -- Kitchen Staff
  IF v_kitchen_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, full_name, role, active_role, phone, company_id)
    VALUES (v_kitchen_id, 'kitchen@spitbraaidelivery.co.za', 'Chef John', 'kitchen_staff', 'kitchen_staff', '+27 82 444 4444', v_company_id)
    ON CONFLICT (id) DO UPDATE SET
      email = 'kitchen@spitbraaidelivery.co.za',
      full_name = 'Chef John',
      role = 'kitchen_staff',
      active_role = 'kitchen_staff',
      phone = '+27 82 444 4444',
      company_id = v_company_id;
  END IF;

  -- Driver
  IF v_driver_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, full_name, role, active_role, phone, company_id)
    VALUES (v_driver_id, 'driver@spitbraaidelivery.co.za', 'Driver Mike', 'driver', 'driver', '+27 82 555 5555', v_company_id)
    ON CONFLICT (id) DO UPDATE SET
      email = 'driver@spitbraaidelivery.co.za',
      full_name = 'Driver Mike',
      role = 'driver',
      active_role = 'driver',
      phone = '+27 82 555 5555',
      company_id = v_company_id;
  END IF;

  -- Shopping Staff
  IF v_shopping_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, full_name, role, active_role, phone, company_id)
    VALUES (v_shopping_id, 'shopping@spitbraaidelivery.co.za', 'Shopping Sarah', 'shopping_staff', 'shopping_staff', '+27 82 666 6666', v_company_id)
    ON CONFLICT (id) DO UPDATE SET
      email = 'shopping@spitbraaidelivery.co.za',
      full_name = 'Shopping Sarah',
      role = 'shopping_staff',
      active_role = 'shopping_staff',
      phone = '+27 82 666 6666',
      company_id = v_company_id;
  END IF;

  -- Cleaning Staff
  IF v_cleaning_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, full_name, role, active_role, phone, company_id)
    VALUES (v_cleaning_id, 'cleaning@spitbraaidelivery.co.za', 'Cleaning Lisa', 'cleaning_staff', 'cleaning_staff', '+27 82 777 7777', v_company_id)
    ON CONFLICT (id) DO UPDATE SET
      email = 'cleaning@spitbraaidelivery.co.za',
      full_name = 'Cleaning Lisa',
      role = 'cleaning_staff',
      active_role = 'cleaning_staff',
      phone = '+27 82 777 7777',
      company_id = v_company_id;
  END IF;

  -- Client
  IF v_client_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, full_name, role, active_role, phone, company_id)
    VALUES (v_client_id, 'client@test.com', 'Test Client', 'client', 'client', '+27 82 888 8888', v_company_id)
    ON CONFLICT (id) DO UPDATE SET
      email = 'client@test.com',
      full_name = 'Test Client',
      role = 'client',
      active_role = 'client',
      phone = '+27 82 888 8888',
      company_id = v_company_id;
  END IF;

  RAISE NOTICE 'Profile setup complete!';
  RAISE NOTICE 'Super Admin: %', CASE WHEN v_super_admin_id IS NOT NULL THEN 'Created' ELSE 'Auth user not found' END;
  RAISE NOTICE 'Owner: %', CASE WHEN v_owner_id IS NOT NULL THEN 'Created' ELSE 'Auth user not found' END;
  RAISE NOTICE 'Admin: %', CASE WHEN v_admin_id IS NOT NULL THEN 'Created' ELSE 'Auth user not found' END;
  RAISE NOTICE 'Kitchen: %', CASE WHEN v_kitchen_id IS NOT NULL THEN 'Created' ELSE 'Auth user not found' END;
  RAISE NOTICE 'Driver: %', CASE WHEN v_driver_id IS NOT NULL THEN 'Created' ELSE 'Auth user not found' END;
  RAISE NOTICE 'Shopping: %', CASE WHEN v_shopping_id IS NOT NULL THEN 'Created' ELSE 'Auth user not found' END;
  RAISE NOTICE 'Cleaning: %', CASE WHEN v_cleaning_id IS NOT NULL THEN 'Created' ELSE 'Auth user not found' END;
  RAISE NOTICE 'Client: %', CASE WHEN v_client_id IS NOT NULL THEN 'Created' ELSE 'Auth user not found' END;
END $$;