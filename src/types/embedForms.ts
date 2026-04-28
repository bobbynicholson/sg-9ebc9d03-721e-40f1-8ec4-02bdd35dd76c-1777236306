// Type definitions for the embeddable quote-request form system.
//
// These types describe the JSONB shapes stored in `embed_form_configs.fields`,
// `embed_form_configs.theme`, and `companies.embed_pricing_tiers`. Keep them in
// sync with the SQL migration at:
//   supabase/migrations/20260428120000_embed_forms.sql
//
// Note: South African English is used in any user-visible defaults
// (see src/lib/embedTemplateDefaults.ts) -- this file contains only type
// definitions.

export type EmbedFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'date'
  | 'time'
  | 'number'
  | 'select'
  | 'textarea'
  | 'checkbox'
  | 'radio';

/**
 * Canonical lead column hint. When present, leadService.createLead will map
 * the submitted value into the matching column on `leads`. Anything without a
 * hint lands in the submission `payload` only.
 */
export type EmbedFieldMapping =
  | 'name'
  | 'email'
  | 'phone'
  | 'event_date'
  | 'guest_count'
  | 'venue'
  | 'event_name'
  | 'notes'
  | 'budget'
  | 'dietary'
  | 'cuisine_type'
  | 'event_type';

export interface EmbedFieldOption {
  value: string;
  label: string;
}

export interface EmbedFieldValidation {
  min?: number;
  max?: number;
  /** Regex source string. Compiled client-side via new RegExp(pattern). */
  pattern?: string;
  minLength?: number;
  maxLength?: number;
}

export interface EmbedFieldConditional {
  /** id of another field in the same form. */
  showIfFieldId: string;
  /** Show this field only if the referenced field equals one of these values. */
  showIfValue: string | string[];
}

export interface EmbedField {
  /** Stable id, unique within a single form (e.g. 'guest_count'). */
  id: string;
  type: EmbedFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  visible: boolean;
  /** Render order, ascending. Ties broken by array index. */
  order: number;
  helpText?: string;
  /** Required when type is 'select' or 'radio'. */
  options?: EmbedFieldOption[];
  validation?: EmbedFieldValidation;
  conditional?: EmbedFieldConditional;
  /** Hint for lead creation. Lets leadService build a proper lead from arbitrary form fields. */
  mapsTo?: EmbedFieldMapping;
}

export type EmbedButtonRadius = 'none' | 'small' | 'medium' | 'full';
export type EmbedLayout = 'single-column' | 'two-column' | 'card';

export interface EmbedTheme {
  primary_color?: string;
  secondary_color?: string;
  font_family?: string;
  button_radius?: EmbedButtonRadius;
  layout?: EmbedLayout;
}

export interface EmbedPricingTier {
  id: string;
  name: string;
  price_per_person_min: number;
  price_per_person_max: number;
  /** ISO 4217 currency code, e.g. 'ZAR', 'USD', 'GBP'. */
  currency: string;
}

/** Full row shape of `embed_form_configs`. */
export interface EmbedFormConfig {
  id: string;
  company_id: string;
  template_id: EmbedTemplateId | string;
  name: string;
  slug: string;
  fields: EmbedField[];
  theme: EmbedTheme;
  redirect_url: string | null;
  success_message: string | null;
  is_active: boolean;
  views_count: number;
  submissions_count: number;
  last_submission_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Full row shape of `embed_form_submissions`. */
export interface EmbedFormSubmission {
  id: string;
  embed_form_id: string;
  company_id: string;
  lead_id: string | null;
  payload: Record<string, unknown>;
  ip_hash: string | null;
  user_agent: string | null;
  referrer: string | null;
  turnstile_score: number | null;
  is_spam: boolean;
  created_at: string;
}

/** The 10 supported template ids. */
export type EmbedTemplateId =
  | 'quick-card'
  | 'modern-inline'
  | 'luxe-vertical'
  | 'floating-widget'
  | 'detailed-multi-step'
  | 'pricing-calculator'
  | 'wedding-specialist'
  | 'corporate-catering'
  | 'event-estimator'
  | 'spit-braai-quick';

export const EMBED_TEMPLATE_IDS: readonly EmbedTemplateId[] = [
  'quick-card',
  'modern-inline',
  'luxe-vertical',
  'floating-widget',
  'detailed-multi-step',
  'pricing-calculator',
  'wedding-specialist',
  'corporate-catering',
  'event-estimator',
  'spit-braai-quick',
] as const;
