-- Brand fonts for white-label tenants.
--
-- Colours (primary/secondary/accent) already live on `companies` and
-- drive the --brand-* CSS vars. This adds the typography half of the
-- white-label theme: a body font and a display/heading font, stored as
-- the plain Google Font family name (e.g. 'Poppins', 'Playfair Display').
--
-- NULL = use the CateringMS default fonts (Inter body / Fraunces display),
-- so existing tenants are unchanged. The runtime maps these names to the
-- curated list in src/lib/branding/fonts.ts; an unrecognised value simply
-- falls back to the default (no font is loaded for an unknown family).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS brand_font_body text,
  ADD COLUMN IF NOT EXISTS brand_font_display text;

COMMENT ON COLUMN public.companies.brand_font_body IS
  'White-label body font family name (Google Fonts), e.g. "Poppins". NULL = default (Inter).';
COMMENT ON COLUMN public.companies.brand_font_display IS
  'White-label display/heading font family name (Google Fonts), e.g. "Playfair Display". NULL = default (Fraunces).';
