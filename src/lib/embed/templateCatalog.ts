/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Catalog of the 10 embeddable form templates plus their default field sets.
 *
 * The templates agent ships the actual HTML at /embed/templates/{id}.html and
 * the live preview loader at /embed/demo.html. This file is the admin-side
 * source of truth for "what does the gallery show, and what does a fresh
 * config look like for each template".
 *
 * Field defaults are intentionally short. Tenants tweak in the customiser.
 */

import type {
  EmbedField,
  EmbedTemplateId,
  EmbedTheme,
} from "@/types/embedForms";

export interface EmbedTemplateMeta {
  id: EmbedTemplateId;
  name: string;
  description: string;
  /** Short pitch shown in the gallery card. */
  blurb: string;
  /** Whether this template uses the live pricing tier feature. */
  usesPricingTiers: boolean;
  /** Sensible defaults so a fresh config is usable right away. */
  defaultFields: EmbedField[];
  defaultTheme: EmbedTheme;
  defaultSuccessMessage: string;
}

// Quote-ready question set. Every template ships with the fields the team
// actually needs to put a quote together (not just name + email), so a
// fresh form captures a usable enquiry out of the box. Tenants can still
// trim or extend any of these in the customiser.
const baseContact: EmbedField[] = [
  { id: "name",   type: "text",  label: "Your name",       required: true,  visible: true, order: 1, mapsTo: "name" },
  { id: "email",  type: "email", label: "Email address",   required: true,  visible: true, order: 2, mapsTo: "email" },
  { id: "phone",  type: "phone", label: "Phone / WhatsApp", required: true,  visible: true, order: 3, mapsTo: "phone" },
];

const eventBasics: EmbedField[] = [
  { id: "event_date",  type: "date",   label: "Event date",       required: true,  visible: true, order: 5, mapsTo: "event_date" },
  { id: "guest_count", type: "number", label: "Number of guests", required: true,  visible: true, order: 6, mapsTo: "guest_count", validation: { min: 1, max: 10000 } },
  { id: "venue",       type: "text",   label: "Venue / area",     required: false, visible: true, order: 7, mapsTo: "venue" },
];

const budget: EmbedField = {
  id: "budget", type: "number", label: "Approximate budget (R)", required: false, visible: true, order: 8, mapsTo: "budget",
};

const dietary: EmbedField = {
  id: "dietary", type: "textarea", label: "Dietary requirements / allergies", required: false, visible: true, order: 9, mapsTo: "dietary",
};

const notes: EmbedField = {
  id: "notes", type: "textarea", label: "Anything else we should know?", required: false, visible: true, order: 99, mapsTo: "notes",
};

const eventTypeSelect: EmbedField = {
  id: "event_type", type: "select", label: "Type of event", required: true, visible: true, order: 4, mapsTo: "event_name",
  options: [
    { value: "wedding",   label: "Wedding"                  },
    { value: "corporate", label: "Corporate / work function" },
    { value: "birthday",  label: "Birthday / private party" },
    { value: "year_end",  label: "Year-end function"        },
    { value: "funeral",   label: "Funeral / memorial"       },
    { value: "other",     label: "Other"                    },
  ],
};

// The full quote-ready set used as the default for general-purpose
// templates: contact + event type + date + guests + venue + budget +
// dietary + notes.
const fullLeadSet: EmbedField[] = [
  ...baseContact,
  eventTypeSelect,
  ...eventBasics,
  budget,
  dietary,
  notes,
];

export const EMBED_TEMPLATE_CATALOG: EmbedTemplateMeta[] = [
  {
    id: "quick-card",
    name: "Quick Card",
    description: "Compact single-column enquiry form",
    blurb: "Small footprint, still asks everything you need to quote. Sidebar or hero CTA.",
    usesPricingTiers: false,
    defaultFields: [...baseContact, eventTypeSelect, ...eventBasics, notes],
    defaultTheme: { primary_color: "#9333ea", layout: "single-column", button_radius: "medium" },
    defaultSuccessMessage: "Thanks, we'll be in touch within an hour.",
  },
  {
    id: "modern-inline",
    name: "Modern Inline",
    description: "Wide horizontal form for landing-page hero sections",
    blurb: "Inline layout, two columns at desktop. Great for hero strips.",
    usesPricingTiers: false,
    defaultFields: [...fullLeadSet],
    defaultTheme: { primary_color: "#0ea5e9", layout: "two-column", button_radius: "medium" },
    defaultSuccessMessage: "Got it. We'll send a quote in the next 24 hours.",
  },
  {
    id: "luxe-vertical",
    name: "Luxe Vertical",
    description: "Editorial single-column form for premium brands",
    blurb: "Large type, generous whitespace. Built for high-end caterers.",
    usesPricingTiers: false,
    defaultFields: [...baseContact, eventTypeSelect, ...eventBasics, dietary, notes],
    defaultTheme: { primary_color: "#1f2937", secondary_color: "#d4af37", layout: "single-column", button_radius: "none" },
    defaultSuccessMessage: "Thank you. Your enquiry is with our events team and we'll respond personally.",
  },
  {
    id: "floating-widget",
    name: "Floating Widget",
    description: "Bottom-right chat-style bubble that expands on click",
    blurb: "Always-on. Sits in the corner of every page on the site.",
    usesPricingTiers: false,
    defaultFields: [...baseContact, eventTypeSelect, ...eventBasics, notes],
    defaultTheme: { primary_color: "#ec4899", layout: "card", button_radius: "full" },
    defaultSuccessMessage: "We'll be in touch shortly.",
  },
  {
    id: "detailed-multi-step",
    name: "Detailed Multi-Step",
    description: "Three-step wizard for bigger enquiries",
    blurb: "Highest-quality leads. Splits the form so it doesn't intimidate.",
    usesPricingTiers: false,
    defaultFields: [
      eventTypeSelect,
      ...eventBasics,
      ...baseContact,
      { id: "budget", type: "number", label: "Approximate budget (R)", required: false, visible: true, order: 7, mapsTo: "budget" },
      { id: "dietary", type: "textarea", label: "Dietary requirements", required: false, visible: true, order: 8, mapsTo: "dietary" },
      notes,
    ],
    defaultTheme: { primary_color: "#7c3aed", layout: "single-column", button_radius: "medium" },
    defaultSuccessMessage: "Brilliant, we have everything we need to put a tailored proposal together.",
  },
  {
    id: "pricing-calculator",
    name: "Pricing Calculator",
    description: "Live per-person estimate from your tier setup",
    blurb: "Shows a live R-per-person estimate as the visitor picks a tier.",
    usesPricingTiers: true,
    defaultFields: [
      ...baseContact,
      eventTypeSelect,
      ...eventBasics,
      { id: "tier", type: "select", label: "Menu tier", required: true, visible: true, order: 8, options: [], helpText: "Tiers populated from your pricing setup." },
      notes,
    ],
    defaultTheme: { primary_color: "#10b981", layout: "single-column", button_radius: "medium" },
    defaultSuccessMessage: "Quote estimate sent to your inbox. We'll follow up to firm it up.",
  },
  {
    id: "wedding-specialist",
    name: "Wedding Specialist",
    description: "Tailored wedding enquiry form with venue and theme",
    blurb: "Fields wedding caterers actually need. Themes, venues, dietary.",
    usesPricingTiers: false,
    defaultFields: [
      ...baseContact,
      { id: "wedding_date", type: "date", label: "Wedding date", required: true, visible: true, order: 4, mapsTo: "event_date" },
      { id: "guest_count", type: "number", label: "Guest count", required: true, visible: true, order: 5, mapsTo: "guest_count" },
      { id: "venue", type: "text", label: "Venue", required: false, visible: true, order: 6, mapsTo: "venue" },
      { id: "style", type: "select", label: "Service style",  required: false, visible: true, order: 7,
        options: [
          { value: "plated",   label: "Plated"   },
          { value: "buffet",   label: "Buffet"   },
          { value: "canapes",  label: "Canapes"  },
          { value: "spit",     label: "Spit braai" },
        ],
      },
      { id: "dietary", type: "textarea", label: "Dietary requirements / allergies", required: false, visible: true, order: 8, mapsTo: "dietary" },
      notes,
    ],
    defaultTheme: { primary_color: "#be185d", layout: "single-column", button_radius: "medium" },
    defaultSuccessMessage: "Congratulations on the engagement. We'll send a wedding proposal soon.",
  },
  {
    id: "corporate-catering",
    name: "Corporate Catering",
    description: "B2B form: company, attendees, recurring schedule",
    blurb: "Built for corporate buyers. Asks for company name + invoice info.",
    usesPricingTiers: false,
    defaultFields: [
      ...baseContact,
      { id: "company", type: "text", label: "Company", required: true, visible: true, order: 4 },
      { id: "event_date", type: "date", label: "Date needed", required: true, visible: true, order: 5, mapsTo: "event_date" },
      { id: "guest_count", type: "number", label: "Headcount", required: true, visible: true, order: 6, mapsTo: "guest_count", validation: { min: 1, max: 10000 } },
      { id: "venue", type: "text", label: "Venue / delivery address", required: false, visible: true, order: 7, mapsTo: "venue" },
      { id: "dietary", type: "textarea", label: "Dietary requirements / allergies", required: false, visible: true, order: 8, mapsTo: "dietary" },
      { id: "recurring", type: "checkbox", label: "This is a recurring booking", required: false, visible: true, order: 9 },
      notes,
    ],
    defaultTheme: { primary_color: "#1e40af", layout: "two-column", button_radius: "small" },
    defaultSuccessMessage: "Thanks. Our corporate desk will be in touch within one business day.",
  },
  {
    id: "event-estimator",
    name: "Event Estimator",
    description: "Live total estimate as guest count + tier change",
    blurb: "Like the calculator, but bigger, great for landing pages.",
    usesPricingTiers: true,
    defaultFields: [
      ...baseContact,
      eventTypeSelect,
      ...eventBasics,
      { id: "tier", type: "select", label: "Menu tier", required: true, visible: true, order: 8, options: [] },
      notes,
    ],
    defaultTheme: { primary_color: "#f59e0b", layout: "single-column", button_radius: "medium" },
    defaultSuccessMessage: "Estimate sent. We'll firm it up and be in touch.",
  },
  {
    id: "spit-braai-quick",
    name: "Spit Braai Quick",
    description: "Short express form for spit-braai operators",
    blurb: "Just the essentials, date, headcount and contact. Convert visitors faster.",
    usesPricingTiers: false,
    defaultFields: [
      { id: "name",  type: "text",   label: "Name",        required: true, visible: true, order: 1, mapsTo: "name" },
      // Email is required: the submit endpoint rejects any enquiry without a
      // valid email (the team needs a way to reply). A spit-braai form with
      // no email field could never submit, so it ships with one.
      { id: "email", type: "email",  label: "Email",       required: true, visible: true, order: 2, mapsTo: "email" },
      { id: "phone", type: "phone",  label: "Phone / WhatsApp", required: true, visible: true, order: 3, mapsTo: "phone" },
      { id: "event_date", type: "date", label: "Date", required: true, visible: true, order: 4, mapsTo: "event_date" },
      { id: "guest_count", type: "number", label: "How many people?", required: true, visible: true, order: 5, mapsTo: "guest_count", validation: { min: 1, max: 10000 } },
      { id: "venue", type: "text", label: "Venue / area", required: false, visible: true, order: 6, mapsTo: "venue" },
      { id: "notes", type: "textarea", label: "Anything else we should know?", required: false, visible: true, order: 99, mapsTo: "notes" },
    ],
    defaultTheme: { primary_color: "#dc2626", layout: "single-column", button_radius: "medium" },
    defaultSuccessMessage: "We'll WhatsApp you a quote shortly.",
  },
];

export function getTemplateMeta(id: string): EmbedTemplateMeta | undefined {
  return EMBED_TEMPLATE_CATALOG.find((t) => t.id === id);
}

/** Slug from a template + a bit of randomness. */
export function defaultSlugForTemplate(id: EmbedTemplateId | string): string {
  const random = Math.random().toString(36).slice(2, 6);
  return `${id}-${random}`;
}
