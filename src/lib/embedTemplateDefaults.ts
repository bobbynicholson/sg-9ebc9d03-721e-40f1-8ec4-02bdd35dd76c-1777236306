// Default starter field set for each of the 10 embed-form templates.
//
// Returned fields are immediately editable in the admin UI -- tenants can
// reorder, hide, mark required, or add validation. Labels use South African
// English. `mapsTo` is set wherever a field has an obvious lead-column home so
// that leadService.createLead can build a real lead from the submission
// without manual mapping.
//
// Keep field ids snake_case and stable -- they become payload keys.

import type { EmbedField, EmbedTemplateId } from '@/types/embedForms';

const NAME_FIELD: EmbedField = {
  id: 'name',
  type: 'text',
  label: 'Full name',
  placeholder: 'Jane Smith',
  required: true,
  visible: true,
  order: 10,
  mapsTo: 'name',
  validation: { minLength: 2, maxLength: 120 },
};

const EMAIL_FIELD: EmbedField = {
  id: 'email',
  type: 'email',
  label: 'Email address',
  placeholder: 'you@example.co.za',
  required: true,
  visible: true,
  order: 20,
  mapsTo: 'email',
};

const PHONE_FIELD: EmbedField = {
  id: 'phone',
  type: 'phone',
  label: 'Mobile number',
  placeholder: '+27 82 123 4567',
  required: true,
  visible: true,
  order: 30,
  mapsTo: 'phone',
};

const EVENT_DATE_FIELD: EmbedField = {
  id: 'event_date',
  type: 'date',
  label: 'Event date',
  required: true,
  visible: true,
  order: 40,
  mapsTo: 'event_date',
};

const GUEST_COUNT_FIELD: EmbedField = {
  id: 'guest_count',
  type: 'number',
  label: 'Number of guests',
  placeholder: '50',
  required: true,
  visible: true,
  order: 50,
  mapsTo: 'guest_count',
  validation: { min: 1, max: 5000 },
};

const VENUE_FIELD: EmbedField = {
  id: 'venue',
  type: 'text',
  label: 'Venue or address',
  placeholder: 'Suburb, city',
  required: false,
  visible: true,
  order: 60,
  mapsTo: 'venue',
};

const NOTES_FIELD: EmbedField = {
  id: 'notes',
  type: 'textarea',
  label: 'Tell us about your event',
  placeholder: 'Theme, dietary preferences, anything else we should know',
  required: false,
  visible: true,
  order: 200,
  mapsTo: 'notes',
  validation: { maxLength: 2000 },
};

function clone(field: EmbedField, overrides: Partial<EmbedField> = {}): EmbedField {
  return { ...field, ...overrides };
}

const TEMPLATE_FIELDS: Record<EmbedTemplateId, EmbedField[]> = {
  // 1. Quick card -- the lowest-friction form. Name, email, phone, date, pax.
  'quick-card': [
    clone(NAME_FIELD),
    clone(EMAIL_FIELD),
    clone(PHONE_FIELD),
    clone(EVENT_DATE_FIELD),
    clone(GUEST_COUNT_FIELD),
  ],

  // 2. Modern inline -- single-row layout, slightly richer.
  'modern-inline': [
    clone(NAME_FIELD),
    clone(EMAIL_FIELD),
    clone(PHONE_FIELD),
    clone(EVENT_DATE_FIELD),
    clone(GUEST_COUNT_FIELD),
    {
      id: 'event_type',
      type: 'select',
      label: 'Event type',
      required: false,
      visible: true,
      order: 55,
      mapsTo: 'event_type',
      options: [
        { value: 'wedding', label: 'Wedding' },
        { value: 'corporate', label: 'Corporate' },
        { value: 'birthday', label: 'Birthday' },
        { value: 'private', label: 'Private function' },
        { value: 'other', label: 'Other' },
      ],
    },
    clone(NOTES_FIELD),
  ],

  // 3. Luxe vertical -- premium positioning. More descriptive fields.
  'luxe-vertical': [
    clone(NAME_FIELD, { label: 'Your name' }),
    clone(EMAIL_FIELD),
    clone(PHONE_FIELD),
    clone(EVENT_DATE_FIELD),
    clone(GUEST_COUNT_FIELD, { label: 'Expected guest count' }),
    clone(VENUE_FIELD, { label: 'Venue' }),
    {
      id: 'cuisine_type',
      type: 'select',
      label: 'Preferred cuisine style',
      required: false,
      visible: true,
      order: 70,
      mapsTo: 'cuisine_type',
      options: [
        { value: 'plated', label: 'Plated fine dining' },
        { value: 'buffet', label: 'Buffet' },
        { value: 'canapes', label: 'Canapés and cocktail' },
        { value: 'family-style', label: 'Family style' },
        { value: 'bespoke', label: 'Bespoke menu' },
      ],
    },
    {
      id: 'budget',
      type: 'select',
      label: 'Budget per head',
      required: false,
      visible: true,
      order: 80,
      mapsTo: 'budget',
      options: [
        { value: 'under-500', label: 'Under R500' },
        { value: '500-1000', label: 'R500 -- R1 000' },
        { value: '1000-2000', label: 'R1 000 -- R2 000' },
        { value: 'over-2000', label: 'Over R2 000' },
      ],
    },
    clone(NOTES_FIELD, { label: 'Vision for the event' }),
  ],

  // 4. Floating widget -- minimum-viable, sits in a launcher bubble.
  'floating-widget': [
    clone(NAME_FIELD),
    clone(EMAIL_FIELD),
    clone(PHONE_FIELD, { required: false }),
    clone(NOTES_FIELD, { label: 'How can we help?', order: 100 }),
  ],

  // 5. Detailed multi-step -- big form, broken across steps in the UI.
  'detailed-multi-step': [
    clone(NAME_FIELD),
    clone(EMAIL_FIELD),
    clone(PHONE_FIELD),
    {
      id: 'event_type',
      type: 'select',
      label: 'Type of event',
      required: true,
      visible: true,
      order: 35,
      mapsTo: 'event_type',
      options: [
        { value: 'wedding', label: 'Wedding' },
        { value: 'corporate', label: 'Corporate' },
        { value: 'birthday', label: 'Birthday' },
        { value: 'anniversary', label: 'Anniversary' },
        { value: 'funeral', label: 'Memorial' },
        { value: 'other', label: 'Other' },
      ],
    },
    clone(EVENT_DATE_FIELD),
    {
      id: 'event_time',
      type: 'time',
      label: 'Start time',
      required: false,
      visible: true,
      order: 45,
    },
    clone(GUEST_COUNT_FIELD),
    clone(VENUE_FIELD),
    {
      id: 'cuisine_type',
      type: 'select',
      label: 'Cuisine preference',
      required: false,
      visible: true,
      order: 70,
      mapsTo: 'cuisine_type',
      options: [
        { value: 'south-african', label: 'South African' },
        { value: 'mediterranean', label: 'Mediterranean' },
        { value: 'asian', label: 'Asian' },
        { value: 'continental', label: 'Continental' },
        { value: 'mixed', label: 'Mixed / no preference' },
      ],
    },
    {
      id: 'service_style',
      type: 'radio',
      label: 'Service style',
      required: false,
      visible: true,
      order: 75,
      options: [
        { value: 'plated', label: 'Plated' },
        { value: 'buffet', label: 'Buffet' },
        { value: 'family-style', label: 'Family style' },
        { value: 'canapes', label: 'Canapés' },
      ],
    },
    {
      id: 'dietary',
      type: 'textarea',
      label: 'Dietary requirements',
      placeholder: 'Vegetarian, halaal, kosher, allergies, etc.',
      required: false,
      visible: true,
      order: 90,
      mapsTo: 'dietary',
    },
    {
      id: 'budget',
      type: 'select',
      label: 'Approximate budget',
      required: false,
      visible: true,
      order: 100,
      mapsTo: 'budget',
      options: [
        { value: 'under-10k', label: 'Under R10 000' },
        { value: '10k-25k', label: 'R10 000 -- R25 000' },
        { value: '25k-50k', label: 'R25 000 -- R50 000' },
        { value: '50k-100k', label: 'R50 000 -- R100 000' },
        { value: 'over-100k', label: 'Over R100 000' },
      ],
    },
    clone(NOTES_FIELD),
  ],

  // 6. Pricing calculator -- minimal personal info, focus on guest count + tier.
  'pricing-calculator': [
    clone(GUEST_COUNT_FIELD, { order: 10 }),
    {
      id: 'pricing_tier',
      type: 'radio',
      label: 'Menu tier',
      required: true,
      visible: true,
      order: 20,
      helpText: 'Pick the menu standard you have in mind. The estimate updates live.',
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'premium', label: 'Premium' },
        { value: 'luxe', label: 'Luxe' },
      ],
    },
    clone(EVENT_DATE_FIELD, { order: 30, required: false }),
    clone(NAME_FIELD, { order: 40 }),
    clone(EMAIL_FIELD, { order: 50 }),
    clone(PHONE_FIELD, { order: 60, required: false }),
  ],

  // 7. Wedding specialist -- ceremony + reception detail, wedding-specific fields.
  'wedding-specialist': [
    {
      id: 'bride_groom_names',
      type: 'text',
      label: 'Couple’s names',
      placeholder: 'Jane & John',
      required: true,
      visible: true,
      order: 10,
      mapsTo: 'name',
    },
    clone(EMAIL_FIELD, { order: 20 }),
    clone(PHONE_FIELD, { order: 30 }),
    {
      id: 'wedding_date',
      type: 'date',
      label: 'Wedding date',
      required: true,
      visible: true,
      order: 40,
      mapsTo: 'event_date',
    },
    {
      id: 'ceremony_time',
      type: 'time',
      label: 'Ceremony time',
      required: false,
      visible: true,
      order: 50,
    },
    {
      id: 'reception_time',
      type: 'time',
      label: 'Reception start time',
      required: false,
      visible: true,
      order: 60,
    },
    clone(GUEST_COUNT_FIELD, { label: 'Guest count', order: 70 }),
    clone(VENUE_FIELD, { label: 'Wedding venue', order: 80 }),
    {
      id: 'service_style',
      type: 'select',
      label: 'Reception style',
      required: false,
      visible: true,
      order: 90,
      options: [
        { value: 'plated', label: 'Plated three-course' },
        { value: 'buffet', label: 'Buffet' },
        { value: 'family-style', label: 'Family style' },
        { value: 'canapes-bowls', label: 'Canapés & bowls' },
      ],
    },
    {
      id: 'bar_required',
      type: 'checkbox',
      label: 'Bar service required',
      required: false,
      visible: true,
      order: 100,
    },
    {
      id: 'cake_required',
      type: 'checkbox',
      label: 'Wedding cake required',
      required: false,
      visible: true,
      order: 110,
    },
    {
      id: 'dietary',
      type: 'textarea',
      label: 'Dietary requirements',
      required: false,
      visible: true,
      order: 120,
      mapsTo: 'dietary',
    },
    clone(NOTES_FIELD, { label: 'Vision and special requests' }),
  ],

  // 8. Corporate catering -- billing detail, recurring options.
  'corporate-catering': [
    {
      id: 'company_name',
      type: 'text',
      label: 'Company name',
      required: true,
      visible: true,
      order: 5,
      mapsTo: 'event_name',
    },
    clone(NAME_FIELD, { label: 'Contact name', order: 10 }),
    clone(EMAIL_FIELD, { label: 'Work email', order: 20 }),
    clone(PHONE_FIELD, { order: 30 }),
    {
      id: 'event_type',
      type: 'select',
      label: 'Event type',
      required: true,
      visible: true,
      order: 35,
      mapsTo: 'event_type',
      options: [
        { value: 'meeting', label: 'Meeting / boardroom lunch' },
        { value: 'conference', label: 'Conference' },
        { value: 'launch', label: 'Product launch' },
        { value: 'team-building', label: 'Team-building day' },
        { value: 'year-end', label: 'Year-end function' },
        { value: 'other', label: 'Other' },
      ],
    },
    clone(EVENT_DATE_FIELD, { order: 40 }),
    {
      id: 'delivery_time',
      type: 'time',
      label: 'Delivery time required',
      required: false,
      visible: true,
      order: 45,
    },
    clone(GUEST_COUNT_FIELD, { label: 'Number of attendees', order: 50 }),
    clone(VENUE_FIELD, { label: 'Delivery address', order: 60 }),
    {
      id: 'recurring',
      type: 'select',
      label: 'Frequency',
      required: false,
      visible: true,
      order: 70,
      options: [
        { value: 'once-off', label: 'Once-off' },
        { value: 'weekly', label: 'Weekly' },
        { value: 'monthly', label: 'Monthly' },
      ],
    },
    {
      id: 'po_required',
      type: 'checkbox',
      label: 'Purchase order required',
      required: false,
      visible: true,
      order: 80,
    },
    {
      id: 'dietary',
      type: 'textarea',
      label: 'Dietary requirements / allergies',
      required: false,
      visible: true,
      order: 90,
      mapsTo: 'dietary',
    },
    clone(NOTES_FIELD, { label: 'Brief / additional info' }),
  ],

  // 9. Event estimator -- driven by event type, returns a ballpark figure.
  'event-estimator': [
    {
      id: 'event_type',
      type: 'select',
      label: 'What are you planning?',
      required: true,
      visible: true,
      order: 10,
      mapsTo: 'event_type',
      options: [
        { value: 'wedding', label: 'Wedding' },
        { value: 'corporate', label: 'Corporate event' },
        { value: 'birthday', label: 'Birthday' },
        { value: 'private', label: 'Private function' },
        { value: 'other', label: 'Other' },
      ],
    },
    clone(GUEST_COUNT_FIELD, { order: 20 }),
    clone(EVENT_DATE_FIELD, { order: 30, required: false }),
    {
      id: 'service_style',
      type: 'radio',
      label: 'Service style',
      required: true,
      visible: true,
      order: 40,
      options: [
        { value: 'plated', label: 'Plated' },
        { value: 'buffet', label: 'Buffet' },
        { value: 'family-style', label: 'Family style' },
        { value: 'canapes', label: 'Canapés' },
      ],
    },
    {
      id: 'pricing_tier',
      type: 'radio',
      label: 'Quality tier',
      required: true,
      visible: true,
      order: 50,
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'premium', label: 'Premium' },
        { value: 'luxe', label: 'Luxe' },
      ],
    },
    clone(NAME_FIELD, { order: 60 }),
    clone(EMAIL_FIELD, { order: 70 }),
    clone(PHONE_FIELD, { order: 80, required: false }),
  ],

  // 10. Spit braai quick -- date, pax, postcode, contact. Nothing else.
  'spit-braai-quick': [
    clone(EVENT_DATE_FIELD, { label: 'Braai date', order: 10 }),
    clone(GUEST_COUNT_FIELD, { label: 'Number of people', order: 20 }),
    {
      id: 'postcode',
      type: 'text',
      label: 'Postcode / suburb',
      placeholder: '8001',
      required: true,
      visible: true,
      order: 30,
      mapsTo: 'venue',
      validation: { minLength: 2, maxLength: 60 },
    },
    clone(NAME_FIELD, { order: 40 }),
    clone(PHONE_FIELD, { order: 50 }),
    clone(EMAIL_FIELD, { order: 60, required: false }),
  ],
};

/**
 * Returns a fresh, deep-copied default field set for the given template id.
 * Returns an empty array for unknown template ids -- callers should treat that
 * as a soft failure rather than throwing, so the admin UI can recover.
 */
export function getDefaultFieldsForTemplate(templateId: string): EmbedField[] {
  const fields = TEMPLATE_FIELDS[templateId as EmbedTemplateId];
  if (!fields) return [];
  // Deep clone so callers can mutate without affecting the canonical defaults.
  return fields.map((field) => ({
    ...field,
    options: field.options ? field.options.map((opt) => ({ ...opt })) : undefined,
    validation: field.validation ? { ...field.validation } : undefined,
    conditional: field.conditional ? { ...field.conditional } : undefined,
  }));
}
