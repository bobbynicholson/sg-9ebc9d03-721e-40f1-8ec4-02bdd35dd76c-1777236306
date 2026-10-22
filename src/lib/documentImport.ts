import { z } from "zod";

export type DocumentTarget = "quotes" | "orders";
export const DOCUMENT_IMPORT_LIMITS = { files: 50, bytes: 20 * 1024 * 1024, pages: 20, text: 100_000, items: 100 };
export const DOCUMENT_IMPORT_ROLES = ["owner", "super_admin", "company_admin", "admin"];

// Explicit business allowlist. The model never chooses SQL columns or writes SQL.
export const DOCUMENT_FIELDS = [
  { key: "reference", label: "Original reference", group: "Customer", type: "text" },
  { key: "client_name", label: "Contact name", group: "Customer", type: "text", required: true },
  { key: "client_company_name", label: "Billing company", group: "Customer", type: "text" },
  { key: "client_email", label: "Customer email", group: "Customer", type: "email", required: true },
  { key: "client_phone", label: "Customer phone", group: "Customer", type: "tel" },
  { key: "event_name", label: "Event / quote name", group: "Event", type: "text", required: true },
  { key: "event_date", label: "Event date", group: "Event", type: "date", required: true },
  { key: "event_time", label: "Service time", group: "Event", type: "time", required: true },
  { key: "setup_time", label: "Arrival / setup time", group: "Event", type: "time" },
  { key: "guest_count", label: "Guests", group: "Event", type: "number", required: true },
  { key: "venue_address", label: "Venue address", group: "Event", type: "text", required: true },
  { key: "subtotal", label: "Subtotal before VAT (including fees and discounts)", group: "Amounts", type: "number", required: true },
  { key: "tax_amount", label: "VAT / tax amount", group: "Amounts", type: "number", required: true },
  { key: "delivery_fee", label: "Delivery fee", group: "Amounts", type: "number" },
  { key: "collection_fee", label: "Collection fee", group: "Amounts", type: "number" },
  { key: "discount_amount", label: "Discount amount", group: "Amounts", type: "number" },
  { key: "total_amount", label: "Document total", group: "Amounts", type: "number", required: true },
  { key: "currency", label: "Currency code", group: "Amounts", type: "text" },
  { key: "deposit_percentage", label: "Deposit percentage", group: "Amounts", type: "number" },
  { key: "balance_due_date", label: "Balance due date", group: "Operations", type: "date", ordersOnly: true },
  { key: "equipment_return_method", label: "Equipment return method", group: "Operations", type: "text", ordersOnly: true },
  { key: "dietary_requirements", label: "Dietary requirements", group: "Operations", type: "text" },
  { key: "kitchen_instructions", label: "Kitchen instructions", group: "Operations", type: "text", ordersOnly: true },
  { key: "special_instructions", label: "Delivery / service instructions", group: "Operations", type: "text", ordersOnly: true },
  { key: "valid_until", label: "Quote valid until", group: "Notes", type: "date", quotesOnly: true },
  { key: "terms_and_conditions", label: "Payment / booking terms", group: "Notes", type: "text", quotesOnly: true },
  { key: "notes", label: "Other notes", group: "Notes", type: "text" },
] as const;
export const fieldsForTarget = (target: DocumentTarget) => DOCUMENT_FIELDS.filter((f) =>
  !("ordersOnly" in f && target !== "orders") && !("quotesOnly" in f && target !== "quotes"));
export const fieldDestination = (target: DocumentTarget, key: string) => {
  if (key === "reference") return "Import source reference";
  if (key === "event_name" && target === "quotes") return "quotes.quote_name";
  if (key === "dietary_requirements" && target === "quotes") return "quotes.notes";
  return `${target}.${key}`;
};

const optionalText = (max: number) => z.string().max(max).nullish().transform((value) => value ?? "");
const nullableNumber = z.number().finite().min(0).max(1_000_000_000).nullable().default(null);
export const documentLineSchema = z.object({
  kind: z.enum(["menu", "equipment", "service"]),
  name: z.string().trim().max(250),
  description: optionalText(2000),
  category: optionalText(80),
  quantity: nullableNumber, unit_price: nullableNumber, line_total: nullableNumber,
  page: z.number().int().min(1).max(20).nullable().default(null),
  evidence: optionalText(1000),
  catalogue_id: z.string().uuid().nullable().default(null),
  // These values describe the reusable item, never the quantity ordered.
  owned_quantity: nullableNumber,
  prep_time_minutes: nullableNumber, cook_time_minutes: nullableNumber,
  requires_cleaning: z.boolean().default(true),
  cleaning_minutes: nullableNumber,
});
export type DocumentLine = z.infer<typeof documentLineSchema>;
export const extractionSchema = z.object({
  document_type: z.enum(["quote", "order", "invoice", "other"]),
  fields: z.record(z.object({
    value: z.union([z.string().max(8000), z.number().finite(), z.null()]),
    evidence: optionalText(1000),
    page: z.number().int().min(1).max(20).nullable().default(null),
    confidence: z.number().min(0).max(1).default(0),
  })),
  items: z.array(documentLineSchema).max(DOCUMENT_IMPORT_LIMITS.items),
  unmatched: z.array(z.object({ label: z.string().max(200), value: z.string().max(4000), page: z.number().int().min(1).max(20).nullable().default(null) })).max(100).default([]),
  warnings: z.array(z.string().max(600)).max(50).default([]),
});
export type DocumentExtraction = z.infer<typeof extractionSchema>;
export const reviewSchema = z.object({
  fields: z.record(z.string().max(8000)),
  items: z.array(documentLineSchema).min(1).max(DOCUMENT_IMPORT_LIMITS.items),
  region_id: z.string().uuid(),
  mode: z.enum(["draft", "historical"]).default("draft"),
  unmatched: z.array(z.object({ label: z.string().max(200), value: z.string().max(4000), destination: z.enum(["notes", "kitchen_instructions", "special_instructions", "dietary_requirements"]) })).max(100).default([]),
  reviewed: z.boolean().refine(Boolean, "Confirm that you reviewed this document."),
});
export type DocumentReview = z.infer<typeof reviewSchema>;
export const reviewDraftSchema = reviewSchema.extend({ region_id: z.string().uuid().or(z.literal("")), reviewed: z.boolean() });
export type CatalogueChoice = { id: string; name: string; kind: "menu" | "equipment"; category?: string; price: number; has_recipe?: boolean };
export const normaliseCatalogueName = (s: string) => s.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function matchDocumentItems(items: DocumentLine[], catalogue: CatalogueChoice[]): DocumentLine[] {
  return items.map((line) => {
    const kind = line.kind === "equipment" ? "equipment" : "menu";
    const matches = catalogue.filter((c) => c.kind === kind && normaliseCatalogueName(c.name) === normaliseCatalogueName(line.name));
    return { ...line, catalogue_id: matches.length === 1 ? matches[0].id : null };
  });
}
export function reviewFromExtraction(extraction: DocumentExtraction, catalogue: CatalogueChoice[], regionId = ""): DocumentReview {
  return {
    fields: Object.fromEntries(Object.entries(extraction.fields).map(([k, v]) => [k, v.value == null ? "" : String(v.value)])),
    items: matchDocumentItems(extraction.items, catalogue), region_id: regionId, mode: "draft", reviewed: false,
    unmatched: extraction.unmatched.map((v) => ({ ...v, destination: "notes" })),
  };
}
export function validateDocumentReview(review: DocumentReview, target: DocumentTarget, currency: string, catalogue: CatalogueChoice[], pricingIncludesVat = false) {
  const errors: string[] = [];
  const followUps: string[] = [];
  const f = review.fields;
  for (const field of fieldsForTarget(target)) {
    const value = (f[field.key] || "").trim();
    if ("required" in field && field.required && !value) errors.push(`${field.label} is missing.`);
    if (!value) continue;
    if (field.type === "number" && (!Number.isFinite(Number(value)) || Number(value) < 0)) errors.push(`${field.label} must be a non-negative number.`);
    if (field.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || (!Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value))) errors.push(`${field.label} must be a valid date.`);
    if (field.type === "time" && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) errors.push(`${field.label} must be a valid time.`);
  }
  if (f.client_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.client_email)) errors.push("Customer email is invalid.");
  if (f.guest_count && (!Number.isInteger(Number(f.guest_count)) || Number(f.guest_count) < 1)) errors.push("Guests must be a positive whole number.");
  if (f.deposit_percentage && Number(f.deposit_percentage) > 100) errors.push("Deposit percentage cannot exceed 100.");
  if (f.currency && f.currency.toUpperCase() !== currency.toUpperCase()) errors.push(`This company uses ${currency}. Review the currency and amounts before importing.`);
  if (f.equipment_return_method && !["driver_same_day", "driver_next_day", "waiter", "none"].includes(f.equipment_return_method)) errors.push("Choose a valid equipment return method.");
  const amount = (key: string) => Number(f[key] || 0);
  if (f.total_amount && Math.abs(amount("subtotal") + amount("tax_amount") - amount("total_amount")) > 0.02) errors.push("Subtotal + VAT must equal the document total. The subtotal already includes fees and discounts.");
  let itemTotal = 0;
  review.items.forEach((line, i) => {
    const label = `Item ${i + 1} (${line.name || "unnamed"})`;
    if (!line.name.trim()) errors.push(`${label}: add a name.`);
    if (!(line.quantity > 0)) errors.push(`${label}: add the quantity.`);
    if (line.unit_price == null || line.line_total == null) errors.push(`${label}: add unit price and line total, including zero-priced items.`);
    if (line.quantity != null && line.unit_price != null && line.line_total != null && Math.abs(line.quantity * line.unit_price - line.line_total) > 0.02) errors.push(`${label}: quantity × unit price does not match its total.`);
    itemTotal += line.line_total || 0;
    const match = catalogue.find((c) => c.id === line.catalogue_id && c.kind === (line.kind === "equipment" ? "equipment" : "menu"));
    const sameNames = catalogue.filter((c) => c.kind === (line.kind === "equipment" ? "equipment" : "menu") && normaliseCatalogueName(c.name) === normaliseCatalogueName(line.name));
    if (!line.catalogue_id && sameNames.length) errors.push(`${label}: select the existing catalogue match, or rename this new item.`);
    if (line.catalogue_id && !match) errors.push(`${label}: select an item from this company's catalogue.`);
    if (line.kind === "equipment" && !line.catalogue_id && (!Number.isInteger(line.owned_quantity) || line.owned_quantity < 0 || line.owned_quantity == null)) errors.push(`${label}: enter how many you own. The quantity on the PDF is the order quantity.`);
    if (line.kind === "equipment" && !line.catalogue_id && line.requires_cleaning && line.cleaning_minutes == null) errors.push(`${label}: enter cleaning minutes or mark that cleaning is not required.`);
    if (line.kind === "menu" && !match?.has_recipe) followUps.push(`${line.name}: complete the recipe, ingredients and inventory links in Menu before kitchen / shopping planning.`);
    if (line.kind === "menu" && !line.catalogue_id && (line.prep_time_minutes == null || line.cook_time_minutes == null)) followUps.push(`${line.name}: add preparation and cooking times in Menu.`);
  });
  if (f.subtotal && Math.abs(itemTotal + amount("delivery_fee") + amount("collection_fee") - amount("discount_amount") - amount(pricingIncludesVat ? "total_amount" : "subtotal")) > 0.02) errors.push(`Item totals + delivery + collection - discount must equal the ${pricingIncludesVat ? "total including VAT" : "subtotal before VAT"}. Your company uses prices ${pricingIncludesVat ? "including" : "excluding"} VAT; review the PDF's price basis.`);
  for (const line of review.items) {
    for (const key of ["prep_time_minutes", "cook_time_minutes", "cleaning_minutes"] as const) if (line[key] != null && !Number.isInteger(line[key])) errors.push(`${line.name}: ${key.replaceAll("_", " ")} must be whole minutes.`);
    if (line.kind === "equipment" && line.quantity != null && !Number.isInteger(line.quantity)) errors.push(`${line.name}: equipment quantity must be a whole number.`);
  }
  if (target === "orders") {
    followUps.push("Review drivers, kitchen readiness, equipment availability and collection arrangements before confirming this imported order.");
    if (review.items.some((v) => v.kind === "equipment") && !f.equipment_return_method) errors.push("Choose who returns the equipment.");
  }
  return { errors: [...new Set(errors)], followUps: [...new Set(followUps)] };
}
