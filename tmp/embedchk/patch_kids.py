def patch(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='').write(s)


patch('src/lib/embed/catalogueSelection.ts', [
    ('''export const EMBED_CHEF_FIELD_ID = "onsite_chef";''', '''export const EMBED_CHEF_FIELD_ID = "onsite_chef";
export const EMBED_KIDS_FIELD_ID = "children_count";

/** The tenant's children's meal ("Kiddies Meals", "Kids meal"...). */
export const KIDS_MEAL_PATTERN = /\\b(kid|kids|kiddie|kiddies|child|children)/i;'''),
    # Kids meals are asked via the children box, not the menu courses.
    ('''  const dishes = menu.filter((item) => !/^(service|services|staff|staffing)$/i.test(String(item.category || "").trim()));''',
     '''  const dishes = menu.filter((item) =>
    !/^(service|services|staff|staffing)$/i.test(String(item.category || "").trim())
    && !KIDS_MEAL_PATTERN.test(String(item.item_name || "")));'''),
    # "How many children?" right after the guest count.
    ('''  // Service tick boxes: waiters and an on-site chef. Shown on every form''', '''  // "How many children?": the quote gets the children's meal with this
  // quantity. Sits right after the guest count (Event step).
  const savedKids = fields.find((f) => f.id === EMBED_KIDS_FIELD_ID);
  const kidsIdx = plain.findIndex((f) => f.id === EMBED_KIDS_FIELD_ID);
  if (kidsIdx !== -1) plain.splice(kidsIdx, 1);
  if (savedKids?.visible !== false) {
    const guestIdx = plain.findIndex((f) => f.id === "guest_count" || f.id === "guests" || f.mapsTo === "guest_count");
    const kidsField = {
      id: EMBED_KIDS_FIELD_ID,
      type: "number",
      label: savedKids?.label || "How many children?",
      placeholder: savedKids?.placeholder || "0",
      helpText: savedKids?.helpText || "Optional. Each child gets our kiddies meal.",
      required: false,
      visible: true,
      order: guestIdx !== -1 ? (plain[guestIdx].order || 0) + 0.5 : nextOrder++,
      validation: { min: 0, max: 1000 },
      // Multi-step form: keep it on the Event page next to the guests.
      step: 1,
    } as EmbedField;
    if (guestIdx !== -1) plain.splice(guestIdx + 1, 0, kidsField);
    else extras.push(kidsField);
  }

  // Service tick boxes: waiters and an on-site chef. Shown on every form'''),
])

patch('src/pages/api/public/embed/[token]/submit.ts', [
    ('''  EMBED_CHEF_FIELD_ID,
  isTicked,''', '''  EMBED_CHEF_FIELD_ID,
  EMBED_KIDS_FIELD_ID,
  KIDS_MEAL_PATTERN,
  isTicked,'''),
    ('''  const servicesRequested = [waiterRequested ? "Waiter service" : null, chefRequested ? "On-site chef" : null].filter(Boolean);''',
     '''  // Children: the tenant's kiddies meal, quantity = number of children
  // (an R0 "Children's meals" line for staff to price if the menu has none).
  const kids = Math.min(1000, Math.max(0, Math.floor(Number(payload[EMBED_KIDS_FIELD_ID]) || 0)));
  if (kids > 0) {
    const { data: menuRows } = await (supabase as any)
      .from("menu_items")
      .select("id, item_name, base_price, category, dietary_tags")
      .eq("company_id", company.id)
      .is("deleted_at", null)
      .or("is_available.is.null,is_available.eq.true");
    const kidsMeal = ((menuRows || []) as any[]).find((m) => KIDS_MEAL_PATTERN.test(String(m.item_name || "")));
    const unitPrice = Number(kidsMeal?.base_price) || 0;
    requestedCatalogueItems.push({
      item_type: "menu",
      menu_item_id: kidsMeal?.id,
      item_name: kidsMeal?.item_name || "Children's meals",
      name: kidsMeal?.item_name || "Children's meals",
      category: kidsMeal?.category || "Other",
      dietary_tags: kidsMeal?.dietary_tags || null,
      pricing_mode: "per_portion",
      quantity: kids,
      unit_price: unitPrice,
      line_total: Number((unitPrice * kids).toFixed(2)),
    });
    mapped.notes = [mapped.notes, `Children: ${kids} (${kidsMeal?.item_name || "children's meals"} added to the quote)`].filter(Boolean).join("\\n\\n");
  }
  const servicesRequested = [waiterRequested ? "Waiter service" : null, chefRequested ? "On-site chef" : null].filter(Boolean);'''),
])

patch('src/lib/embedFormApi.ts', [
    ('''  "onsite_chef",
  "website",''', '''  "onsite_chef",
  "children_count",
  "website",'''),
])
print('ok')
