DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM (
            'admin', 'kitchen', 'driver', 'client', 'cleaning', 'shopping', 'owner', 'super_admin', 'shopping_staff', 'cleaning_staff', 'kitchen_staff'
        );
    END IF;
END$$;