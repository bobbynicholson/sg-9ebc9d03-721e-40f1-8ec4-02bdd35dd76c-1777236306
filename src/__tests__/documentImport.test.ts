import { documentLineSchema, extractionSchema, fieldsForTarget, matchDocumentItems, reviewDraftSchema, reviewFromExtraction, reviewSchema, validateDocumentReview } from "@/lib/documentImport";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const line = () => documentLineSchema.parse({ kind: "menu", name: "Roast chicken", quantity: 10, unit_price: 50, line_total: 500 });
const review = () => reviewSchema.parse({ fields: { client_name: "Jane", client_company_name: "Company Ltd", client_email: "jane@example.com", event_name: "Lunch", event_date: "2099-11-05", event_time: "12:00", guest_count: "10", venue_address: "Test venue", subtotal: "500", tax_amount: "75", total_amount: "575", currency: "ZAR" }, region_id: id(1), items: [line()], reviewed: true });

test("a complete financial review can create a draft while recipe setup remains required", () => {
  const result = validateDocumentReview(review(), "quotes", "ZAR", []);
  expect(result.errors).toEqual([]);
  expect(result.followUps.join(" ")).toMatch(/recipe/);
});
test("missing event and customer fields are listed without inventing defaults", () => {
  const r = review(); r.fields = {};
  const result = validateDocumentReview(r, "orders", "ZAR", []);
  expect(result.errors).toEqual(expect.arrayContaining(["Contact name is missing.", "Event date is missing.", "Service time is missing.", "Guests is missing."]));
});
test.each(["invalid", "2099-02-30", "2099-99-99"])("invalid dates are a review error, not a server crash: %s", (date) => {
  const r = review(); r.fields.event_date = date;
  expect(validateDocumentReview(r, "quotes", "ZAR", []).errors).toContain("Event date must be a valid date.");
});
test("money and quantities must reconcile; prices are never replaced with catalogue defaults", () => {
  const r = review(); r.items[0].unit_price = 51;
  expect(validateDocumentReview(r, "quotes", "ZAR", []).errors.join(" ")).toMatch(/unit price/);
  r.items[0].unit_price = 50; r.fields.total_amount = "700";
  expect(validateDocumentReview(r, "quotes", "ZAR", []).errors.join(" ")).toMatch(/document total/);
});
test("exact unique names match within type; ambiguous and fuzzy names require a person", () => {
  const catalogue = [{ id: id(2), name: "ROAST   CHICKEN", kind: "menu" as const, price: 99 }];
  expect(matchDocumentItems([line()], catalogue)[0]).toMatchObject({ catalogue_id: id(2), unit_price: 50 });
  expect(matchDocumentItems([line()], [...catalogue, { ...catalogue[0], id: id(3) }])[0].catalogue_id).toBeNull();
  expect(matchDocumentItems([line()], [{ ...catalogue[0], kind: "equipment" }])[0].catalogue_id).toBeNull();
  expect(matchDocumentItems([line()], [{ ...catalogue[0], name: "Chicken roast dinner" }])[0].catalogue_id).toBeNull();
});
test("the order quantity cannot silently become owned equipment stock", () => {
  const r = review(); r.items = [documentLineSchema.parse({ kind: "equipment", name: "Plate", quantity: 10, unit_price: 50, line_total: 500 })];
  expect(validateDocumentReview(r, "orders", "ZAR", []).errors.join(" ")).toMatch(/how many you own/);
  r.items[0].owned_quantity = 20; r.items[0].cleaning_minutes = 2; r.fields.equipment_return_method = "driver_next_day";
  expect(validateDocumentReview(r, "orders", "ZAR", []).errors).toEqual([]);
});
test("forged cross-company catalogue IDs are rejected", () => {
  const r = review(); r.items[0].catalogue_id = id(7);
  expect(validateDocumentReview(r, "quotes", "ZAR", []).errors.join(" ")).toMatch(/this company's catalogue/);
});
test("customer contact and company remain separate, unknown details survive as notes", () => {
  const extracted = extractionSchema.parse({ document_type: "quote", fields: { client_name: { value: "Jane" }, client_company_name: { value: "Company Ltd" } }, items: [line()], unmatched: [{ label: "Second sitting", value: "18:00" }] });
  const r = reviewFromExtraction(extracted, []);
  expect(r.fields).toEqual({ client_name: "Jane", client_company_name: "Company Ltd" });
  expect(r.unmatched).toEqual([expect.objectContaining({ label: "Second sitting", value: "18:00", destination: "notes" })]);
});
test("corrections can be saved before required fields and review sign-off are complete", () => {
  const draft = { ...review(), region_id: "", reviewed: false };
  expect(reviewDraftSchema.safeParse(draft).success).toBe(true);
  expect(reviewSchema.safeParse(draft).success).toBe(false);
});
test("database mapping is explicit and excludes lifecycle, tenant and payment state columns", () => {
  for (const target of ["quotes", "orders"] as const) {
    const keys = fieldsForTarget(target).map((v) => v.key);
    expect(keys).not.toEqual(expect.arrayContaining(["company_id", "amount_paid", "deposit_paid", "status", "assigned_driver_id"]));
    expect(keys).toContain("client_company_name");
  }
});
