def patch(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8').write(s)


# ------------------------------------------------------------ catalogueSelection.ts
patch('src/lib/embed/catalogueSelection.ts', [
    ('''export const EMBED_REQUEST_TYPE_FIELD_ID = "request_type";''',
     '''export const EMBED_REQUEST_TYPE_FIELD_ID = "request_type";
export const EMBED_EQUIPMENT_PACKAGE_FIELD_ID = "equipment_package";

/** A cutlery/crockery set the visitor picks once; one set per guest. */
export interface EquipmentPackageOption {
  value: string;
  label: string;
  /** equipment.id values included in the set (one of each per guest). */
  items: string[];
}

// Pick the catalogue row whose name matches, skipping service pieces
// (salad bowls, serving spoons) that aren't per-guest place settings.
function findPiece(
  equipment: EmbedEquipmentCatalogueRow[],
  word: RegExp,
  prefer?: RegExp,
): EmbedEquipmentCatalogueRow | undefined {
  const pieces = equipment.filter((e) => {
    const name = String(e.name || "").toLowerCase();
    return word.test(name) && !/salad|serving|container|crate|ladle|tongs/.test(name);
  });
  return (prefer && pieces.find((e) => prefer.test(String(e.name || "").toLowerCase()))) || pieces[0];
}

/**
 * The two place-setting packages from the tenant's catalogue:
 * "Plate, knife & fork" and "Plate, knife, fork, bowl & spoon". Built
 * from whatever plate / knife / fork / bowl / spoon rows exist, so any
 * tenant with those pieces gets them without setup.
 */
export function defaultEquipmentPackages(equipment: EmbedEquipmentCatalogueRow[]): EquipmentPackageOption[] {
  const plate = findPiece(equipment, /plate/, /25/);
  const knife = findPiece(equipment, /knife/);
  const fork = findPiece(equipment, /fork/);
  const bowl = findPiece(equipment, /bowl/, /porcelain/);
  const spoon = findPiece(equipment, /spoon/);
  const out: EquipmentPackageOption[] = [];
  if (plate && knife && fork) {
    out.push({ value: "plate_knife_fork", label: "Plate, knife & fork", items: [plate.id, knife.id, fork.id] });
    if (bowl && spoon) {
      out.push({
        value: "plate_knife_fork_bowl_spoon",
        label: "Plate, knife, fork, bowl & spoon",
        items: [plate.id, knife.id, fork.id, bowl.id, spoon.id],
      });
    }
  }
  return out;
}

/**
 * Packages for a form: the ones saved on the form (edited in the admin
 * customiser) when present, otherwise the defaults. Item ids that no
 * longer exist in the catalogue are dropped; empty packages disappear.
 */
export function resolveEquipmentPackages(
  savedFields: EmbedField[],
  equipment: EmbedEquipmentCatalogueRow[],
): EquipmentPackageOption[] {
  const saved = savedFields.find((f) => f.id === EMBED_EQUIPMENT_PACKAGE_FIELD_ID);
  const known = new Set(equipment.map((e) => e.id));
  const savedOptions = ((saved?.options || []) as unknown as EquipmentPackageOption[])
    .filter((o) => o && typeof o.value === "string" && Array.isArray(o.items))
    .map((o) => ({ value: o.value, label: o.label || o.value, items: o.items.filter((id) => known.has(id)) }))
    .filter((o) => o.items.length > 0);
  return savedOptions.length > 0 ? savedOptions : defaultEquipmentPackages(equipment);
}'''),

    # addCatalogueFields: per-category menu (groups already on options) +
    # the package dropdown instead of the piece-by-piece equipment picker.
    ('''  if (equipment.length > 0 && !plain.some((f) => f.id === EMBED_EQUIPMENT_FIELD_ID)) {
    extras.push(equipmentField(equipment, nextOrder++, undefined));
  }''', '''  const packages = resolveEquipmentPackages(fields, equipment);
  const savedPackageField = fields.find((f) => f.id === EMBED_EQUIPMENT_PACKAGE_FIELD_ID);
  if (packages.length > 0) {
    // Place settings are picked as a set (one per guest), like the
    // tenant's "Equipment" dropdown on their quote sheet.
    const packageField: EmbedField = {
      id: EMBED_EQUIPMENT_PACKAGE_FIELD_ID,
      type: "select",
      label: savedPackageField?.label || "Equipment",
      placeholder: "Choose your place settings",
      helpText: savedPackageField?.helpText
        || "One set per guest. The team confirms quantities and pricing in your quote.",
      required: savedPackageField?.required === true,
      visible: savedPackageField?.visible !== false,
      order: nextOrder++,
      options: packages.map((p) => ({ value: p.value, label: p.label, items: p.items })) as EmbedField["options"],
    };
    const idx = plain.findIndex((f) => f.id === EMBED_EQUIPMENT_PACKAGE_FIELD_ID);
    if (idx !== -1) plain.splice(idx, 1);
    if (packageField.visible !== false) extras.push(packageField);
  } else if (equipment.length > 0 && !plain.some((f) => f.id === EMBED_EQUIPMENT_FIELD_ID)) {
    extras.push(equipmentField(equipment, nextOrder++, undefined));
  }'''),

    # Menu field: grouped by category, "Add line" per category.
    ('''    label: "Menu items",
    helpText:
      "Optional. Type to search and add the dishes you would like. The team confirms portions, availability and pricing in your quote.",''',
     '''    label: "Menu",
    helpText:
      "Choose dishes from each course. Use Add line for more than one. The team confirms portions, availability and pricing in your quote.",'''),

    ('''export function buildRequestedCatalogueItems(
  menu: EmbedMenuCatalogueRow[],
  equipment: EmbedEquipmentCatalogueRow[],
  guestCount: number,
): RequestedCatalogueItem[] {''', '''export function buildRequestedCatalogueItems(
  menu: EmbedMenuCatalogueRow[],
  equipment: EmbedEquipmentCatalogueRow[],
  guestCount: number,
  /** Equipment from a place-setting package: one per guest. */
  perGuestEquipmentIds: Set<string> = new Set(),
): RequestedCatalogueItem[] {'''),
    ('''  const equipmentItems: RequestedCatalogueItem[] = equipment.map((item) => {
    const unitPrice = Number(item.rental_price) || 0;
    return {''', '''  const equipmentItems: RequestedCatalogueItem[] = equipment.map((item) => {
    const unitPrice = Number(item.rental_price) || 0;
    const quantity = perGuestEquipmentIds.has(item.id) ? guests : 1;
    return {'''),
    ('''      // Equipment must not silently scale to guest count. The operator can
      // change this editable starting quantity in the quote builder.
      quantity: 1,
      unit_price: unitPrice,
      line_total: unitPrice,''', '''      // Individually picked equipment does not silently scale to guest
      // count; place-setting packages are one per guest by definition.
      // Both stay editable in the quote builder.
      quantity,
      unit_price: unitPrice,
      line_total: Number((unitPrice * quantity).toFixed(2)),'''),
])

# ------------------------------------------------------------ submit.ts
patch('src/pages/api/public/embed/[token]/submit.ts', [
    ('''  EMBED_REQUEST_TYPE_FIELD_ID,
  fieldsForRequestType,''', '''  EMBED_REQUEST_TYPE_FIELD_ID,
  EMBED_EQUIPMENT_PACKAGE_FIELD_ID,
  resolveEquipmentPackages,
  fieldsForRequestType,'''),
    ('''    const menuIds = selectedIds(payload[EMBED_MENU_FIELD_ID]);
    const equipmentIds = selectedIds(payload[EMBED_EQUIPMENT_FIELD_ID]);''', '''    const menuIds = selectedIds(payload[EMBED_MENU_FIELD_ID]);
    const pickedEquipmentIds = selectedIds(payload[EMBED_EQUIPMENT_FIELD_ID]);
    // A place-setting package expands into its pieces, one per guest.
    // Resolved from the live catalogue, never from client-sent ids.
    let packageEquipmentIds: string[] = [];
    const packageValue = typeof payload[EMBED_EQUIPMENT_PACKAGE_FIELD_ID] === "string"
      ? String(payload[EMBED_EQUIPMENT_PACKAGE_FIELD_ID])
      : "";
    if (packageValue) {
      const { data: catalogueEquipment } = await (supabase as any)
        .from("equipment")
        .select("id, name, rental_price, category, description, available_quantity")
        .eq("company_id", company.id)
        .is("deleted_at", null)
        .or("is_available.is.null,is_available.eq.true");
      const pkg = resolveEquipmentPackages(fields, (catalogueEquipment || []) as any)
        .find((p) => p.value === packageValue);
      if (!pkg) {
        return res.status(400).json({
          ok: false,
          message: "That equipment option is no longer available. Refresh the form and choose again.",
        });
      }
      packageEquipmentIds = pkg.items;
    }
    const equipmentIds = Array.from(new Set([...pickedEquipmentIds, ...packageEquipmentIds]));'''),
    ('''    requestedCatalogueItems = buildRequestedCatalogueItems(
      (selectedMenu || []) as any,
      (selectedEquipment || []) as any,
      mapped.guest_count || 1,
    );''', '''    requestedCatalogueItems = buildRequestedCatalogueItems(
      (selectedMenu || []) as any,
      (selectedEquipment || []) as any,
      mapped.guest_count || 1,
      new Set(packageEquipmentIds),
    );'''),
])

# Package values are routing, not a note line (the items land on the quote).
patch('src/lib/embedFormApi.ts', [
    ('''  "equipment_item_ids",
  "website",
]);''', '''  "equipment_item_ids",
  "equipment_package",
  "website",
]);'''),
])
print('ok')
