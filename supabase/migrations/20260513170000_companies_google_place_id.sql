-- Phase 5 #3: Google Business Profile place_id so the after-sales
-- review email can drop a proper 'leave a review' link instead of a
-- generic Google search.
--
-- Operators paste the place_id from their Google Business Profile
-- listing into /admin/company-profile. The review email switches to
-- search.google.com/local/writereview?placeid=... when set; falls
-- back to a maps.google.com search by company name otherwise.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS google_place_id TEXT NULL;

COMMENT ON COLUMN public.companies.google_place_id IS
  'Phase 5 #3: Google Business Profile place_id. When set, the post-delivery review email links to the proper write-review URL.';
