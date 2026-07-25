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
  pricing_mode: "per_person" | "flat";
  base_servings?: number | null;
  sold_as_package?: boolean;
  dietary_tags?: string[] | null;
}

const money = (value: number | null | undefined, currency: string) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: currency || "ZAR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

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
  currency: string,
): EmbedField[] {
  if (!["detailed-multi-step", "pricing-calculator"].includes(templateId)) {
    return fields;
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

  if (
    menu.length > 0
    && !result.some((field) => field.id === EMBED_MENU_FIELD_ID)
  ) {
    result.push({
      id: EMBED_MENU_FIELD_ID,
      type: "checkboxes",
      label: "Menu preferences",
      helpText:
        "Choose any dishes you are interested in. The catering team will review portions and availability before sending the final quote.",
      required: false,
      visible: true,
      order: order++,
      conditional: quoteOnlyConditional,
      options: menu.map((item) => ({
        value: item.id,
        label: `${item.item_name}${item.category ? ` · ${item.category}` : ""} · ${money(item.base_price, currency)}`,
      })),
    });
  }

  if (
    equipment.length > 0
    && !result.some((field) => field.id === EMBED_EQUIPMENT_FIELD_ID)
  ) {
    result.push({
      id: EMBED_EQUIPMENT_FIELD_ID,
      type: "checkboxes",
      label: "Equipment required",
      helpText:
        "Optional. Choose only what you expect to need; staff will confirm quantities instead of automatically matching the guest count.",
      required: false,
      visible: true,
      order,
      conditional: quoteOnlyConditional,
      options: equipment.map((item) => ({
        value: item.id,
        label: `${item.name || "Equipment"}${item.category ? ` · ${item.category}` : ""} · ${money(item.rental_price, currency)}`,
      })),
    });
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
      pricing_mode: isPackage ? "flat" : "per_person",
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
