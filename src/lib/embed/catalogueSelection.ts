import type { EmbedField } from "@/types/embedForms";

export const EMBED_MENU_FIELD_ID = "menu_item_ids";
export const EMBED_EQUIPMENT_FIELD_ID = "equipment_item_ids";
export const EMBED_REQUEST_TYPE_FIELD_ID = "request_type";
export const EMBED_EQUIPMENT_PACKAGE_FIELD_ID = "equipment_package";
export const EMBED_WAITER_FIELD_ID = "waiter_service";
export const EMBED_CHEF_FIELD_ID = "onsite_chef";

/** True for a ticked service box (checkbox values arrive as true / "true"). */
export function isTicked(value: unknown): boolean {
  return value === true || value === "true";
}

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
}

export interface EmbedMenuCatalogueRow {
  id: string;
  item_name: string;
  base_price: number | null;
  base_servings?: number | null;
  category?: string | null;
  description?: string | null;
  dietary_tags?: string[] | null;
  sold_as_package?: boolean | null;
}

export interface EmbedEquipmentCatalogueRow {
  id: string;
  name: string | null;
  rental_price: number | null;
  category?: string | null;
  description?: string | null;
  available_quantity?: number | null;
}

export interface RequestedCatalogueItem {
  item_type: "menu" | "equipment";
  menu_item_id?: string;
  equipment_id?: string;
  item_name: string;
  name: string;
  category: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  pricing_mode: "per_person" | "per_portion" | "flat";
  base_servings?: number | null;
  sold_as_package?: boolean;
  dietary_tags?: string[] | null;
}


function menuField(
  menu: EmbedMenuCatalogueRow[],
  order: number,
  conditional: EmbedField["conditional"],
): EmbedField {
  return {
    id: EMBED_MENU_FIELD_ID,
    type: "checkboxes",
    label: "Menu",
    helpText:
      "Choose dishes from each course. Use Add line for more than one. The team confirms portions, availability and pricing in your quote.",
    required: false,
    visible: true,
    order,
    ...(conditional ? { conditional } : {}),
    options: menu.map((item) => ({
      value: item.id,
      // No prices on the public form: this is a quote request, and the
      // team prices the final quote (portions, package size, travel).
      label: `${item.item_name}${item.sold_as_package && item.base_servings ? ` · serves ${item.base_servings}` : ""}`,
      group: item.category || "Other",
    })),
  };
}

function equipmentField(
  equipment: EmbedEquipmentCatalogueRow[],
  order: number,
  conditional: EmbedField["conditional"],
): EmbedField {
  return {
    id: EMBED_EQUIPMENT_FIELD_ID,
    type: "checkboxes",
    label: "Equipment",
    helpText:
      "Optional. Type to search and add what you need; the team confirms quantities and pricing in your quote.",
    required: false,
    visible: true,
    order,
    ...(conditional ? { conditional } : {}),
    options: equipment.map((item) => ({
      value: item.id,
      label: item.name || "Equipment",
      group: item.category || "Other",
    })),
  };
}

/**
 * Adds live, catalogue-backed customer choices to the two quote-oriented
 * templates. The quick card intentionally stays short and remains a lead-only
 * form.
 */
export function addCatalogueFields(
  fields: EmbedField[],
  templateId: string,
  menu: EmbedMenuCatalogueRow[],
  equipment: EmbedEquipmentCatalogueRow[],
  // Kept for call-site compatibility; public options no longer show prices.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _currency: string,
): EmbedField[] {
  // Every form is a full quote request: no "quick enquiry vs build my
  // quote" choice. Menu and equipment pickers are offered on every
  // template (optional), placed before a trailing notes field. Any legacy
  // request_type field or conditionals pointing at it are dropped.
  void templateId;
  const plain = fields
    .filter((field) => field.id !== EMBED_REQUEST_TYPE_FIELD_ID)
    .map((field) => {
      const cond = field.conditional as { showIfFieldId?: string } | undefined;
      const next: EmbedField = cond?.showIfFieldId === EMBED_REQUEST_TYPE_FIELD_ID
        ? { ...field, conditional: undefined }
        : { ...field };
      const isVenue =
        field.id === "venue" || field.id === "venue_address" || field.mapsTo === "venue";
      if (isVenue) {
        next.placeholder = field.placeholder || "Start typing the venue address";
        next.helpText = field.helpText
          || "Pick a suggestion or type the full address. We verify it when you submit.";
      }
      return next;
    });
  let nextOrder = plain.reduce((max, field) => Math.max(max, field.order || 0), 0) + 1;
  const notesIdx = plain.findIndex((f) => f.id === "notes" || f.mapsTo === "notes");
  const extras: EmbedField[] = [];
  // Staffing (waiters, servers) is asked with the service tick boxes, so
  // "Service"/"Staff" categories stay out of the menu courses.
  const dishes = menu.filter((item) => !/^(service|services|staff|staffing)$/i.test(String(item.category || "").trim()));
  if (dishes.length > 0 && !plain.some((f) => f.id === EMBED_MENU_FIELD_ID)) {
    extras.push(menuField(dishes, nextOrder++, undefined));
  }
  const packages = resolveEquipmentPackages(fields, equipment);
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
  }
  // Service tick boxes: waiters and an on-site chef. Shown on every form
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
  if (notesIdx !== -1) {
    // Take the notes field's slot so notes stays last.
    const notesOrder = plain[notesIdx].order || 0;
    extras.forEach((field, i) => { field.order = notesOrder - 0.5 + i * 0.01; });
    plain.splice(notesIdx, 0, ...extras);
  } else {
    plain.push(...extras);
  }
  return plain;
}

export function selectedIds(value: unknown, max = 50): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ).slice(0, max);
}

export function fieldsForRequestType<T extends { id: string }>(
  fields: T[],
  requestType: string,
): T[] {
  if (requestType !== "enquiry") return fields;
  const quoteOnlyIds = new Set([
    "tier",
    "venue",
    "venue_address",
    EMBED_MENU_FIELD_ID,
    EMBED_EQUIPMENT_FIELD_ID,
  ]);
  return fields.filter((field) => !quoteOnlyIds.has(String(field.id)));
}

export function buildRequestedCatalogueItems(
  menu: EmbedMenuCatalogueRow[],
  equipment: EmbedEquipmentCatalogueRow[],
  guestCount: number,
  /** Equipment from a place-setting package: one per guest. */
  perGuestEquipmentIds: Set<string> = new Set(),
): RequestedCatalogueItem[] {
  const guests = Math.max(1, Math.floor(Number(guestCount) || 1));
  const menuItems: RequestedCatalogueItem[] = menu.map((item) => {
    const isPackage = item.sold_as_package === true;
    const quantity = isPackage ? 1 : guests;
    const unitPrice = Number(item.base_price) || 0;
    return {
      item_type: "menu",
      menu_item_id: item.id,
      item_name: item.item_name,
      name: item.item_name,
      category: item.category || null,
      dietary_tags: item.dietary_tags || null,
      base_servings: item.base_servings ?? null,
      sold_as_package: isPackage,
      // Package lines start at one but remain quantity-editable when the
      // operator reviews the website request in the quote builder.
      pricing_mode: isPackage ? "per_portion" : "per_person",
      quantity,
      unit_price: unitPrice,
      line_total: Number((unitPrice * quantity).toFixed(2)),
    };
  });
  const equipmentItems: RequestedCatalogueItem[] = equipment.map((item) => {
    const unitPrice = Number(item.rental_price) || 0;
    const quantity = perGuestEquipmentIds.has(item.id) ? guests : 1;
    return {
      item_type: "equipment",
      equipment_id: item.id,
      item_name: item.name || "Equipment",
      name: item.name || "Equipment",
      category: item.category || null,
      pricing_mode: "flat",
      // Individually picked equipment does not silently scale to guest
      // count; place-setting packages are one per guest by definition.
      // Both stay editable in the quote builder.
      quantity,
      unit_price: unitPrice,
      line_total: Number((unitPrice * quantity).toFixed(2)),
    };
  });
  return [...menuItems, ...equipmentItems];
}

export function splitRequestedItems(items: RequestedCatalogueItem[]) {
  const menuItems = items
    .filter((item) => item.item_type === "menu")
    .map((item) => ({
      menu_item_id: item.menu_item_id || null,
      item_name: item.item_name,
      name: item.name,
      category: item.category,
      dietary_tags: item.dietary_tags || null,
      pricing_mode: item.pricing_mode,
      quantity: item.quantity,
      unit_price: item.unit_price,
      pricePerPerson: item.unit_price,
      discount_pct: 0,
      line_total: item.line_total,
    }));
  const equipmentItems = items
    .filter((item) => item.item_type === "equipment")
    .map((item) => ({
      equipment_id: item.equipment_id || null,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit_price: item.unit_price,
      rentalPrice: item.unit_price,
      line_total: item.line_total,
      from_stock_qty: item.quantity,
      from_hire_qty: 0,
      hire_in_cost_per_unit: 0,
      hire_in_cost_total: 0,
    }));
  return { menuItems, equipmentItems };
}
