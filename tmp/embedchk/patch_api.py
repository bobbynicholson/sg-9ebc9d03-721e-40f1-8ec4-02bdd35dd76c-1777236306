p = 'src/lib/embedFormApi.ts'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)


rep('''  | "checkboxes"
  | "tier";

export interface EmbedField {
  id: string;
  type: EmbedFieldType;
  label?: string;
  required?: boolean;''', '''  | "checkboxes"
  | "tier"
  | "time";

export interface EmbedField {
  id: string;
  type: EmbedFieldType;
  label?: string;
  required?: boolean;
  /** false = switched off in the customiser; never rendered or validated. */
  visible?: boolean;''')

rep('''  options?: Array<{ value: string; label?: string }>;''',
    '''  options?: Array<{ value: string; label?: string } | string>;''')

rep('''function isVisible(field: any, payload: Record<string, any>): boolean {
  // Two conditional shapes''', '''/**
 * Options may be saved as {value,label} objects or as plain strings by
 * older configs. Same normalisation as normalizeOptions in
 * public/embed/helpers.js so the browser and server agree on values.
 */
function normalizeOptions(options: unknown): Array<{ value: string; label: string }> {
  if (!Array.isArray(options)) return [];
  const out: Array<{ value: string; label: string }> = [];
  for (const o of options) {
    if (o === null || o === undefined) continue;
    if (typeof o === "string" || typeof o === "number") {
      const v = String(o).trim();
      if (v) out.push({ value: v, label: v });
      continue;
    }
    const value = (o as any).value != null ? String((o as any).value) : "";
    const label = (o as any).label != null ? String((o as any).label) : value;
    if (!value && !label) continue;
    out.push({ value: value || label, label: label || value });
  }
  return out;
}

/** Human-readable text for a submitted value (option labels, not codes). */
function displayValue(field: EmbedField, value: any): string {
  const opts = normalizeOptions(field.options);
  const labelFor = (v: any) => {
    const hit = opts.find((o) => o.value === String(v));
    return hit ? hit.label : String(v);
  };
  if (Array.isArray(value)) return value.map(labelFor).join(", ");
  if (field.type === "checkbox" || typeof value === "boolean") {
    return value === true || value === "true" ? "Yes" : "No";
  }
  return labelFor(value);
}

// Payload keys that are handled elsewhere (catalogue selections become
// requested_items, request_type is routing) and must not be echoed into
// the lead notes.
const INTERNAL_PAYLOAD_KEYS = new Set([
  "request_type",
  "menu_item_ids",
  "equipment_item_ids",
  "website",
]);

function humaniseKey(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isVisible(field: any, payload: Record<string, any>): boolean {
  // A field switched off in the customiser is never shown to visitors,
  // so it must never be required server-side either.
  if (field?.visible === false) return false;
  // Two conditional shapes''')

# required single checkbox must be ticked
rep('''  const present = !isEmpty(value);
  // Saved form configs''', '''  const present =
    !isEmpty(value) && !(field.type === "checkbox" && (value === false || value === "false"));
  // Saved form configs''')

rep('''    case "select":
    case "radio": {
      if (field.options && field.options.length > 0) {
        const allowed = field.options.map((o) => o.value);
        if (!allowed.includes(String(value))) {''', '''    case "select":
    case "radio": {
      const opts = normalizeOptions(field.options);
      if (opts.length > 0) {
        const allowed = opts.map((o) => o.value);
        if (!allowed.includes(String(value))) {''')

rep('''      if (field.options && field.options.length > 0) {
        const allowed = new Set(field.options.map((o) => o.value));''', '''      const multiOpts = normalizeOptions(field.options);
      if (multiOpts.length > 0) {
        const allowed = new Set(multiOpts.map((o) => o.value));''')

# mapping: labels for event type, extra details into notes
rep('''  const lead: MappedLead = {};
  const notesParts: string[] = [];

  for (const field of fields || []) {
    if (!isVisible(field, payload)) continue;
    const value = payload[field.id];
    if (isEmpty(value)) continue;
''', '''  const lead: MappedLead = {};
  const notesParts: string[] = [];
  // Answers with no lead column (custom fields such as "Eating time",
  // template extras such as a frequency picker). They used to live only
  // in the raw submission row, invisible on the lead the team works from.
  const extraDetails: string[] = [];
  const seen = new Set<string>();

  for (const field of fields || []) {
    seen.add(field.id);
    if (!isVisible(field, payload)) continue;
    const value = payload[field.id];
    if (isEmpty(value)) continue;
    if (!field.mapsTo || !MAPPED_COLUMNS.has(field.mapsTo)) {
      if (!INTERNAL_PAYLOAD_KEYS.has(field.id)) {
        extraDetails.push(`${field.label || humaniseKey(field.id)}: ${displayValue(field, value)}`);
      }
      continue;
    }
''')

rep('''      case "event_name":
      case "event_type": {
        lead.event_type = String(value).slice(0, 100);
        break;
      }''', '''      case "event_name":
      case "event_type": {
        // Store the option label ("Corporate / work function"), not the
        // internal code ("corporate"), so the lead reads naturally.
        lead.event_type = displayValue(field, value).slice(0, 100);
        break;
      }''')

rep('''        const formatted = Array.isArray(value) ? value.join(", ") : String(value);
        lead.special_requests = formatted.slice(0, 2000);''', '''        const formatted = displayValue(field, value);
        lead.special_requests = formatted.slice(0, 2000);''')

rep('''  if (notesParts.length > 0) {
    lead.notes = notesParts.join("\\n\\n").slice(0, 5000);
  }

  return lead;
}''', '''  // Template-supplied values that are not configured fields.
  for (const [key, value] of Object.entries(payload || {})) {
    if (seen.has(key) || INTERNAL_PAYLOAD_KEYS.has(key)) continue;
    if (key === "guests" || key === "guest_count") continue;
    if (isEmpty(value) || typeof value === "object" && !Array.isArray(value)) continue;
    const text = Array.isArray(value)
      ? value.map(String).join(", ")
      : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
    extraDetails.push(`${humaniseKey(key)}: ${text.slice(0, 500)}`);
  }
  if (extraDetails.length > 0) {
    notesParts.push(`Other details from the form:\\n${extraDetails.join("\\n")}`);
  }

  if (notesParts.length > 0) {
    lead.notes = notesParts.join("\\n\\n").slice(0, 5000);
  }

  return lead;
}

const MAPPED_COLUMNS = new Set([
  "name", "email", "phone", "event_date", "guest_count", "venue",
  "event_name", "event_type", "notes", "budget", "company", "dietary",
]);''')

open(p, 'w', encoding='utf-8').write(s)

p = 'src/pages/api/public/embed/[token]/submit.ts'
s = open(p, encoding='utf-8').read()
rep('''  if (!validation.ok) {
    return res.status(400).json({ ok: false, errors: validation.errors });
  }''', '''  if (!validation.ok) {
    // The message shows in the form's banner; errors land under each field.
    const labelOf = (id: string) =>
      (validationFields.find((f: any) => f.id === id)?.label as string) || id;
    const firstId = Object.keys(validation.errors || {})[0];
    return res.status(400).json({
      ok: false,
      message: firstId
        ? `Please check "${labelOf(firstId)}": ${validation.errors![firstId]}`
        : "Please check the form and try again.",
      errors: validation.errors,
    });
  }''')
open(p, 'w', encoding='utf-8').write(s)
print('ok')
