-- P1-11: enforce companies.slug NOT NULL
--
-- Slug is the entire tenant routing layer (cateringms.com/{slug}/admin/...).
-- A NULL slug breaks every withSlug helper and middleware path
-- silently. Application-side, every signup flow always populates it,
-- but the schema doesn't enforce, leaving the door open to a partial
-- migration / direct-DB insert leaving an unrouteable tenant.
--
-- Verified zero NULL slugs in production (vsuyzovzqtrngorpqnhy)
-- before locking the column.

ALTER TABLE public.companies
  ALTER COLUMN slug SET NOT NULL;
