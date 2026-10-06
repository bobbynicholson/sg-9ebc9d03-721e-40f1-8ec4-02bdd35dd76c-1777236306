import type { EmbedField } from "@/types/embedForms";

export const EMBED_MENU_FIELD_ID = "menu_item_ids";
export const EMBED_EQUIPMENT_FIELD_ID = "equipment_item_ids";
export const EMBED_REQUEST_TYPE_FIELD_ID = "request_type";

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


const QUOTE_SPLIT_TEMPLATES = ["detailed-multi-step", "pricing-calculator"];

function menuField(
  menu: EmbedMenuCatalogueRow[],
  order: number,
  conditional: EmbedField["conditional"],
): EmbedField {
  return {
    id: EMBED_MENU_FIELD_ID,
    type: "checkboxes",
    label: "Menu items",
    helpText:
      "Optional. Type to search and add the dishes you would like. The team confirms portions, availability and pricing in your quote.",
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
  // Two templates split "quick enquiry" from "build my quote" with a
  // request_type choice; every other template simply offers the menu and
  // equipment pickers as optional extras on the same form.
  if (!QUOTE_SPLIT_TEMPLATES.includes(templateId)) {
    const plain = [...fields];
    let nextOrder = plain.reduce((max, field) => Math.max(max, field.order || 0), 0) + 1;
    // Place the pickers before a trailing notes/message field.
    const notesIdx = plain.findIndex((f) => f.id === "notes" || f.mapsTo === "notes");
    const insertAt = notesIdx === -1 ? plain.length : notesIdx;
    const extras: EmbedField[] = [];
    if (menu.length > 0 && !plain.some((f) => f.id === EMBED_MENU_FIELD_ID)) {
      extras.push(menuField(menu, nextOrder++, undefined));
    }
    if (equipment.length > 0 && !plain.some((f) => f.id === EMBED_EQUIPMENT_FIELD_ID)) {
      extras.push(equipmentField(equipment, nextOrder++, undefined));
    }
    if (extras.length === 0) return fields;
    // Keep render order: extras take the notes field's slot, notes moves after.
    if (notesIdx !== -1) {
      const notesOrder = plain[notesIdx].order || 0;
      extras.forEach((field, i) => { field.order = notesOrder - 0.5 + i * 0.01; });
    }
    plain.splice(insertAt, 0, ...extras);
    return plain;
  }

  const quoteOnlyConditional = {
    showIfFieldId: EMBED_REQUEST_TYPE_FIELD_ID,
    showIfValue: "quote",
  };
  const result = fields.map((field) => {
    const isVenue =
      field.id === "venue"
      || field.id === "venue_address"
      || field.mapsTo === "venue";
    const isQuoteOnly = isVenue || field.id === "tier";
    return isQuoteOnly
      ? {
          ...field,
          conditional: quoteOnlyConditional,
          ...(isVenue
            ? {
                placeholder:
                  field.placeholder
                  || "Start with street number and street, then suburb and city",
                helpText:
                  "Enter the full venue address. We verify it and save the map coordinates when you submit.",
              }
            : {}),
        }
      : field;
  });
  if (!result.some((field) => field.id === EMBED_REQUEST_TYPE_FIELD_ID)) {
    result.unshift({
      id: EMBED_REQUEST_TYPE_FIELD_ID,
      type: "radio",
      label: "How can we help?",
      helpText:
        "Choose a short enquiry, or build a detailed quote request from the live menu.",
      required: true,
      visible: true,
      order: 0,
      options: [
        {
          value: "enquiry",
          label: "Quick enquiry · tell us the basics",
        },
        {
          value: "quote",
          label: "Build my quote request · choose menu and equipment",
        },
      ],
    });
  }
  let order = result.reduce((max, field) => Math.max(max, field.order || 0), 0) + 1;

  if (menu.length > 0 && !result.some((field) => field.id === EMBED_MENU_FIELD_ID)) {
    result.push(menuField(menu, order++, quoteOnlyConditional));
  }
  if (equipment.length > 0 && !result.some((field) => field.id === EMBED_EQUIPMENT_FIELD_ID)) {
    result.push(equipmentField(equipment, order, quoteOnlyConditional));
  }

  return result;
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
    return {
      item_type: "equipment",
      equipment_id: item.id,
      item_name: item.name || "Equipment",
      name: item.name || "Equipment",
      category: item.category || null,
      pricing_mode: "flat",
      // Equipment must not silently scale to guest count. The operator can
      // change this editable starting quantity in the quote builder.
      quantity: 1,
      unit_price: unitPrice,
      line_total: unitPrice,
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
