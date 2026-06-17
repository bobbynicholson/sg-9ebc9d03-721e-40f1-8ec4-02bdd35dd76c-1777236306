-- Re-brand spit-braai-delivery from green to the warm CateringMS amber set.
-- Run in the Supabase SQL editor (prod). Branding is read live from the
-- companies row by TenantBrandingApplier -> applyBrandingToDOM, so this takes
-- effect on next page load (no deploy needed).
--
-- These three values are the CateringMS DEFAULT_PALETTE
-- (see src/lib/branding/applyBranding.ts): amber-600 / orange-600 / amber-500.

UPDATE companies
SET primary_color   = '#d97706',  -- amber-600
    secondary_color = '#ea580c',  -- orange-600
    accent_color    = '#f59e0b'   -- amber-500
WHERE slug = 'spit-braai-delivery';

-- Verify:
SELECT slug, company_name, primary_color, secondary_color, accent_color
FROM companies
WHERE slug = 'spit-braai-delivery';
