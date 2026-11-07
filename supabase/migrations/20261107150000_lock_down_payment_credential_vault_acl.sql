-- Keep payment gateway ciphertext readable only by trusted server-side code.
-- The company-boundary migration adds RESTRICTIVE policies to these tables;
-- those policies are preserved. They constrain rows but do not grant access.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.payment_gateway_credentials') IS NULL
     OR to_regclass('public.payment_gateway_credential_versions') IS NULL THEN
    RAISE EXCEPTION 'Payment credential vault tables are missing; apply their schema migrations first';
  END IF;

  -- Stop if someone has added a permissive policy that could expose rows once
  -- client privileges exist. Restrictive company-boundary policies are kept.
  IF EXISTS (
    SELECT 1
    FROM pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.tablename IN ('payment_gateway_credentials', 'payment_gateway_credential_versions')
      AND p.permissive = 'PERMISSIVE'
      AND EXISTS (
        SELECT 1
        FROM unnest(p.roles) AS policy_role(role_name)
        WHERE lower(policy_role.role_name) IN ('public', 'anon', 'authenticated')
      )
  ) THEN
    RAISE EXCEPTION 'A permissive client policy exists on a payment credential vault table; inspect it before applying the ACL lockdown';
  END IF;
END $$;

ALTER TABLE public.payment_gateway_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_credential_versions ENABLE ROW LEVEL SECURITY;

-- Remove any client/public column-level grants before the table-level revoke.
DO $$
DECLARE
  g record;
BEGIN
  FOR g IN
    SELECT DISTINCT
      c.relname AS table_name,
      a.attname AS column_name,
      acl.privilege_type,
      CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE quote_ident(r.rolname)
      END AS grantee_sql
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_attribute AS a ON a.attrelid = c.oid
    CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
    LEFT JOIN pg_roles AS r ON r.oid = acl.grantee
    WHERE n.nspname = 'public'
      AND c.relname IN ('payment_gateway_credentials', 'payment_gateway_credential_versions')
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND (acl.grantee = 0 OR r.rolname IN ('anon', 'authenticated'))
  LOOP
    EXECUTE format(
      'REVOKE %s (%I) ON TABLE public.%I FROM %s',
      g.privilege_type, g.column_name, g.table_name, g.grantee_sql
    );
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON TABLE
  public.payment_gateway_credentials,
  public.payment_gateway_credential_versions
FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.payment_gateway_credentials,
  public.payment_gateway_credential_versions
TO service_role;

COMMIT;
