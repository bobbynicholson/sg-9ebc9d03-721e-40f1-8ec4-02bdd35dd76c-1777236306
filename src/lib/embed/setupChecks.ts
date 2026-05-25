/**
 * Per-template setup intelligence for embeddable lead-capture forms.
 *
 * The customiser at /admin/integrations/embed/[id] uses this to surface
 * a checklist of what each template needs to work end-to-end. Pre-LCF-B
 * a tenant could:
 *   - Save a Pricing Calculator form with zero tiers configured and the
 *     visitor would see an empty dropdown.
 *   - Strip every lead-mapped field off and ship a form that captures
 *     submissions but lands them on the leads page as anonymous blobs.
 *   - Save a multi-step form with all fields pinned to step 1 and
 *     wonder why the second screen renders empty.
 *
 * Each check carries a severity (required | recommended | info) so the
 * UI can render the right tone, and an optional anchor so clicking a
 * gap scrolls the operator to the right section.
 *
 * LCF-B (task #223, 2026-05-25).
 */

import type {
  EmbedFieldMapping, EmbedFormConfig, EmbedTemplateId,
} from "@/types/embedForms";
import type { EmbedTemplateMeta } from "@/lib/embed/templateCatalog";

export type SetupCheckSeverity = "required" | "recommended" | "info";

export interface SetupCheck {
  /** Stable key for React lists + analytics. */
  id: string;
  severity: SetupCheckSeverity;
  /** One-line description. */
  label: string;
  /** Longer prose shown in the tooltip / drawer. */
  detail?: string;
  /** True when the form already satisfies this check. */
  passed: boolean;
  /** Optional anchor id on the customiser page to scroll to. */
  anchor?: string;
}

export interface SetupChecksOptions {
  form: EmbedFormConfig;
  templateMeta: EmbedTemplateMeta | undefined;
  /** Count of tenant-wide pricing tiers configured. Drives the
   *  Pricing Calculator + Event Estimator checks. */
  pricingTiersCount: number;
}

/**
 * Build the ordered checklist for a form. Required items first, then
 * recommended, then info. Pure - no IO.
 */
export function getSetupChecklist(opts: SetupChecksOptions): SetupCheck[] {
  const { form, templateMeta, pricingTiersCount } = opts;
  const checks: SetupCheck[] = [];

  const visibleFields = (form.fields || []).filter((f) => f.visible !== false);
  const mappedTo = new Set<EmbedFieldMapping>();
  for (const f of visibleFields) {
    if (f.mapsTo) mappedTo.add(f.mapsTo);
  }
  const hasContactMapping = mappedTo.has("name") || mappedTo.has("email") || mappedTo.has("phone");
  const hasEventDate = mappedTo.has("event_date");
  const hasGuestCount = mappedTo.has("guest_count");

  // ── Universal required: a lead-capture form needs a way to
  //    identify the lead, otherwise rows land in /admin/leads as
  //    anonymous blobs that take ten minutes to chase down.
  checks.push({
    id: "contact-mapped",
    severity: "required",
    label: "At least one contact field maps to the lead",
    detail: "Map a Name, Email or Phone field to its lead column under the field's Advanced -> Maps to lead column. Otherwise submissions arrive on /admin/leads with no way to follow up.",
    passed: hasContactMapping,
    anchor: "section-fields",
  });

  // Required-but-invisible is a footgun. A required field that
  // the visitor can't see can never be filled, so the form will
  // reject every submission.
  const requiredButInvisible = (form.fields || []).find((f) => f.required && f.visible === false);
  checks.push({
    id: "required-visible",
    severity: "required",
    label: "Every required field is visible",
    detail: requiredButInvisible
      ? `"${requiredButInvisible.label || requiredButInvisible.id}" is required but hidden - the form will reject every submission. Either show it, or untick Required.`
      : "Required fields with Visible turned off can never be filled, which means the form will block every submission.",
    passed: !requiredButInvisible,
    anchor: "section-fields",
  });

  // ── Template-specific checks ─────────────────────────────────────

  if (templateMeta?.usesPricingTiers) {
    checks.push({
      id: "pricing-tiers-configured",
      severity: "required",
      label: `${templateMeta.name} needs pricing tiers`,
      detail: "This template shows a live per-person estimate to the visitor. Without at least one pricing tier in the right sidebar, the tier dropdown renders empty and the calculator stays at R0.",
      passed: pricingTiersCount > 0,
      anchor: "section-pricing-tiers",
    });

    const hasTierField = visibleFields.some((f) => f.type === "tier" || (f.type === "select" && f.id === "tier"));
    checks.push({
      id: "tier-field-present",
      severity: "required",
      label: "Form has a tier picker field",
      detail: "The Pricing Calculator / Event Estimator templates expect a visible tier field. If you deleted it, add one back via Add field -> Pricing tier (or Dropdown named \"tier\").",
      passed: hasTierField,
      anchor: "section-fields",
    });
  }

  if (templateMeta?.id === "detailed-multi-step") {
    const steps = new Set<number>();
    for (const f of visibleFields) {
      const s = (f as unknown as { step?: number }).step;
      if (typeof s === "number") steps.add(s);
    }
    // Auto-grouping kicks in when no fields have a step pinned.
    const usingAutoGroups = steps.size === 0;
    checks.push({
      id: "multistep-pages",
      severity: "recommended",
      label: usingAutoGroups
        ? "Multi-step form uses auto page grouping"
        : `Multi-step pages used: ${steps.size}`,
      detail: usingAutoGroups
        ? "Fields are being grouped onto pages by their id (contact / event / preferences). For finer control, set each field's Advanced -> Step explicitly."
        : "Some fields are pinned to specific steps. Make sure no page ends up empty - an empty step renders a blank screen mid-flow.",
      passed: true,
      anchor: "section-fields",
    });
  }

  if (templateMeta?.id === "spit-braai-quick") {
    // The whole point of this template is "two questions only". A
    // tenant who's bolted on five extra fields has missed the
    // template's intent.
    checks.push({
      id: "quick-form-stays-quick",
      severity: "recommended",
      label: "Spit Braai Quick should stay quick",
      detail: "This template's conversion lift comes from being ≤ 4 fields. Visible fields right now: " + visibleFields.length + ". Either trim back, or switch to the Modern Inline / Quick Card templates.",
      passed: visibleFields.length <= 4,
      anchor: "section-fields",
    });
  }

  if (templateMeta?.id === "floating-widget") {
    // Floating widgets are bottom-right bubbles; long forms inside
    // them feel cramped on mobile.
    checks.push({
      id: "widget-stays-small",
      severity: "recommended",
      label: "Floating widget should stay compact",
      detail: "Bottom-right widgets work best with ≤ 5 fields - more than that and the bubble feels overwhelming on mobile. Visible fields right now: " + visibleFields.length + ".",
      passed: visibleFields.length <= 5,
      anchor: "section-fields",
    });
  }

  if (templateMeta?.id === "wedding-specialist" || templateMeta?.id === "corporate-catering" || templateMeta?.id === "event-estimator") {
    checks.push({
      id: "event-date-mapped",
      severity: "recommended",
      label: "Event date field maps to the lead",
      detail: "Caterer-facing templates work better when the lead lands with an event date already populated - it powers the calendar view + capacity alerts.",
      passed: hasEventDate,
      anchor: "section-fields",
    });
    checks.push({
      id: "guest-count-mapped",
      severity: "recommended",
      label: "Guest count maps to the lead",
      detail: "Lets the leads page show headcount on every row and unlocks the menu portion math when the lead converts to a quote.",
      passed: hasGuestCount,
      anchor: "section-fields",
    });
  }

  // ── After-submit recommendations ─────────────────────────────────

  if (!form.success_message?.trim() && !form.redirect_url?.trim()) {
    checks.push({
      id: "after-submit-set",
      severity: "recommended",
      label: "Pick a post-submit experience",
      detail: "Either a success message or a redirect URL is recommended. The platform default works, but a branded message converts better.",
      passed: false,
      anchor: "section-after-submit",
    });
  }

  if (form.redirect_url && form.redirect_url.trim() && !form.redirect_url.startsWith("https://")) {
    checks.push({
      id: "redirect-https",
      severity: "required",
      label: "Redirect URL must be https",
      detail: `"${form.redirect_url}" isn't https. Browsers will block the redirect from a mixed-content embed.`,
      passed: false,
      anchor: "section-after-submit",
    });
  }

  // ── Activation ───────────────────────────────────────────────────
  checks.push({
    id: "form-is-active",
    severity: "info",
    label: form.is_active ? "Form is active" : "Form is paused",
    detail: form.is_active
      ? "Live on any site that has your snippet pasted."
      : "Snippet still loads but the form refuses submissions. Toggle Active in Form settings to go live.",
    passed: !!form.is_active,
    anchor: "section-form-settings",
  });

  return checks;
}

/**
 * Roll the checklist into a single readiness verdict. Used by the
 * snippet dialog to soft-block "Copy" with a warning when required
 * checks aren't satisfied.
 */
export function summariseReadiness(checks: SetupCheck[]): {
  ready: boolean;
  failingRequired: number;
  failingRecommended: number;
} {
  let failingRequired = 0;
  let failingRecommended = 0;
  for (const c of checks) {
    if (c.passed) continue;
    if (c.severity === "required") failingRequired += 1;
    else if (c.severity === "recommended") failingRecommended += 1;
  }
  return {
    ready: failingRequired === 0,
    failingRequired,
    failingRecommended,
  };
}

/** Cheap nicety so we don't import the constant twice. */
export const TEMPLATE_INTENT: Record<EmbedTemplateId, string> = {
  "quick-card":           "Smallest possible footprint, drop into a sidebar or hero CTA. Aim: a 60-second lead capture.",
  "modern-inline":         "Wide horizontal form for landing-page hero sections. Two columns at desktop.",
  "luxe-vertical":         "Editorial single-column form for premium brands. Generous whitespace, big type.",
  "floating-widget":       "Always-on bottom-right bubble. Best on every page of a site as a passive lead funnel.",
  "detailed-multi-step":   "Three-step wizard for bigger enquiries. Splits the form so it doesn't intimidate, gets you higher-quality leads.",
  "pricing-calculator":    "Live per-person estimate from your tier setup. Needs at least one pricing tier configured.",
  "wedding-specialist":    "Wedding-specific enquiry shape. Surface venue, style, dietary up front.",
  "corporate-catering":    "B2B form with company + recurring booking ask. Tailored for corporate buyers.",
  "event-estimator":       "Bigger version of the pricing calculator. Same tier engine, more space for the visitor's event details.",
  "spit-braai-quick":      "Two-question express form for spit braai operators. Date + headcount, that's it.",
};
