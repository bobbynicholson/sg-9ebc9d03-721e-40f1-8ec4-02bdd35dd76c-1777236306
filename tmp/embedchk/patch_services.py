def patch(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='') .write(s)


# ------------------------------------------------------------ catalogueSelection.ts
patch('src/lib/embed/catalogueSelection.ts', [
    ('''export const EMBED_EQUIPMENT_PACKAGE_FIELD_ID = "equipment_package";''',
     '''export const EMBED_EQUIPMENT_PACKAGE_FIELD_ID = "equipment_package";
export const EMBED_WAITER_FIELD_ID = "waiter_service";
export const EMBED_CHEF_FIELD_ID = "onsite_chef";

/** True for a ticked service box (checkbox values arrive as true / "true"). */
export function isTicked(value: unknown): boolean {
  return value === true || value === "true";
}'''),
    ('''  if (extras.length === 0) return plain;
  if (notesIdx !== -1) {''', '''  // Service tick boxes: waiters and an on-site chef. Shown on every form
  // unless the form saved its own version and switched it off.
  const services: { id: string; label: string; text: string }[] = [
    { id: EMBED_WAITER_FIELD_ID, label: "Waiter service", text: "Yes, we'd like waiters to serve our guests" },
    { id: EMBED_CHEF_FIELD_ID, label: "On-site chef", text: "Yes, we'd like a chef cooking on site" },
  ];
  for (const svc of services) {
    const saved = fields.find((f) => f.id === svc.id);
    const idx = plain.findIndex((f) => f.id === svc.id);
    if (idx !== -1) plain.splice(idx, 1);
    if (saved?.visible === false) continue;
    extras.push({
      id: svc.id,
      type: "checkbox",
      label: saved?.label || svc.label,
      placeholder: saved?.placeholder || svc.text,
      helpText: saved?.helpText,
      required: false,
      visible: true,
      order: nextOrder++,
    });
  }
  if (extras.length === 0) return plain;
  if (notesIdx !== -1) {'''),
])

# ------------------------------------------------------------ submit.ts
patch('src/pages/api/public/embed/[token]/submit.ts', [
    ('''  EMBED_EQUIPMENT_PACKAGE_FIELD_ID,
  resolveEquipmentPackages,''', '''  EMBED_EQUIPMENT_PACKAGE_FIELD_ID,
  EMBED_WAITER_FIELD_ID,
  EMBED_CHEF_FIELD_ID,
  isTicked,
  resolveEquipmentPackages,'''),
    # quote insert: waiter section switched on
    ('''  requestedItems: RequestedCatalogueItem[],
  eventTime: string | null = null,
): Promise<string | null> {
  if (requestedItems.length === 0) return null;''', '''  requestedItems: RequestedCatalogueItem[],
  eventTime: string | null = null,
  waiterRequested = false,
): Promise<string | null> {
  if (requestedItems.length === 0 && !waiterRequested) return null;'''),
    ('''      menu_items: menuItems,
      equipment_items: equipmentItems,''', '''      menu_items: menuItems,
      equipment_items: equipmentItems,
      // Ticked "Waiter service" opens the quote's waiter section; staff set
      // the number of waiters, hours and rate before sending.
      waiter_service_required: waiterRequested,'''),
    ('''        mapped.event_time || null,
      );''', '''        mapped.event_time || null,
        waiterRequested,
      );'''),
    ('''  let draftQuoteId: string | null = null;
  if (requestedCatalogueItems.length > 0) {''', '''  let draftQuoteId: string | null = null;
  if (requestedCatalogueItems.length > 0 || waiterRequested) {'''),
    # resolve services before the lead insert
    ('''  const leadInsert: Record<string, any> = {''', '''  // Service tick boxes. A chef becomes a Service line on the draft quote
  // (the tenant's own chef item when the menu has one, else an R0 line
  // for staff to price); waiters switch on the quote's waiter section.
  const waiterRequested = isTicked(payload[EMBED_WAITER_FIELD_ID]);
  const chefRequested = isTicked(payload[EMBED_CHEF_FIELD_ID]);
  if (chefRequested) {
    const { data: chefRows } = await (supabase as any)
      .from("menu_items")
      .select("id, item_name, base_price, category")
      .eq("company_id", company.id)
      .is("deleted_at", null)
      .or("is_available.is.null,is_available.eq.true")
      .ilike("item_name", "%chef%")
      .limit(1);
    const chef = (chefRows || [])[0];
    const unitPrice = Number(chef?.base_price) || 0;
    requestedCatalogueItems.push({
      item_type: "menu",
      menu_item_id: chef?.id,
      item_name: chef?.item_name || "On-site chef",
      name: chef?.item_name || "On-site chef",
      category: chef?.category || "Service",
      pricing_mode: "flat",
      quantity: 1,
      unit_price: unitPrice,
      line_total: unitPrice,
    });
  }
  const servicesRequested = [waiterRequested ? "Waiter service" : null, chefRequested ? "On-site chef" : null].filter(Boolean);
  if (servicesRequested.length > 0) {
    mapped.notes = [mapped.notes, `Services requested: ${servicesRequested.join(", ")}`].filter(Boolean).join("\\n\\n");
  }

  const leadInsert: Record<string, any> = {'''),
])

# Service boxes are reported via the "Services requested" note line.
patch('src/lib/embedFormApi.ts', [
    ('''  "equipment_package",
  "website",''', '''  "equipment_package",
  "waiter_service",
  "onsite_chef",
  "website",'''),
])

# ------------------------------------------------------------ helpers.js: service boxes side by side
patch('public/embed/helpers.js', [
    ('''  var WIDE_TYPES = { textarea: 1, radio: 1, checkboxes: 1, checkbox: 1, multiselect: 1 };
  function isWideField(f) {''', '''  var WIDE_TYPES = { textarea: 1, radio: 1, checkboxes: 1, checkbox: 1, multiselect: 1 };
  function isWideField(f) {
    // Service tick boxes sit side by side.
    if (f.id === 'waiter_service' || f.id === 'onsite_chef') return false;'''),
])
print('ok')
