import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const COMPANY_ID = "0e139a19-6526-4e1f-9bf7-87d6adbee5f8";
const RUN_ID =
  process.env.ORDER_E2E_RUN_ID ||
  `ORDER-E2E-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const RUN_TAG = `E2E_RUN:${RUN_ID}`;
const RUN_SLUG = RUN_ID.replace(/[^a-zA-Z0-9]/g, "").slice(-18);
const REPORT_DIR = "reports/order-e2e";

function loadEnv() {
  const env = {};
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
        const i = line.indexOf("=");
        const key = line.slice(0, i).trim();
        const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
        env[key] = value;
      }
    } catch {
      // Optional file.
    }
  }
  return { ...env, ...process.env };
}

const env = loadEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const baseUrl = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

const report = {
  runId: RUN_ID,
  runTag: RUN_TAG,
  startedAt: new Date().toISOString(),
  baseUrl,
  companyId: COMPANY_ID,
  totals: { scenarios: 0, passed: 0, failed: 0, notes: 0 },
  fixtures: {},
  scenarios: [],
  aggregate: {},
  notes: [],
};

const r2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const near = (a, b, tolerance = 0.02) => Math.abs(r2(a) - r2(b)) <= tolerance;
const iso = (date = new Date()) => date.toISOString();
const dateOnly = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

function addNote(target, message) {
  target.notes.push(message);
  report.totals.notes += 1;
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function insertOne(table, payload, label = table) {
  const { data, error } = await sb.from(table).insert(payload).select("*").single();
  if (error) throw new Error(`${label} insert failed: ${error.message}`);
  return data;
}

async function updateById(table, id, patch, label = table) {
  const { data, error } = await sb.from(table).update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(`${label} update failed: ${error.message}`);
  return data;
}

async function fetchJson(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 20000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadFixtures() {
  const { data: company, error: companyErr } = await sb
    .from("companies")
    .select("id, company_name, slug, owner_id, email, currency, deposit_percent")
    .eq("id", COMPANY_ID)
    .single();
  if (companyErr) throw new Error(`company lookup failed: ${companyErr.message}`);

  const { data: profiles, error: profilesErr } = await sb
    .from("profiles")
    .select("id, full_name, email, role, active_role, is_active, region_id")
    .eq("company_id", COMPANY_ID)
    .is("deleted_at", null);
  if (profilesErr) throw new Error(`profiles lookup failed: ${profilesErr.message}`);

  const { data: regions, error: regionsErr } = await sb
    .from("regions")
    .select("id, name, code, city, currency, deposit_percent, is_active")
    .eq("company_id", COMPANY_ID)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (regionsErr) throw new Error(`regions lookup failed: ${regionsErr.message}`);
  assertOk(regions?.length, "No active regions found for company.");

  const { data: menuRows, error: menuErr } = await sb
    .from("menu_items")
    .select("id, item_name, base_price, base_servings, category, fulfilment_type, prep_time_minutes, cook_time_minutes, cost_per_unit")
    .eq("company_id", COMPANY_ID)
    .is("deleted_at", null)
    .eq("is_available", true)
    .eq("active", true);
  if (menuErr) throw new Error(`menu lookup failed: ${menuErr.message}`);
  assertOk(menuRows?.length, "No active menu items found for company.");

  const { data: equipmentRows, error: eqErr } = await sb
    .from("equipment")
    .select("id, name, category, quantity, available_quantity, rental_price, hire_in_cost, is_available, is_hire_in, requires_cleaning, supplier_cleans")
    .eq("company_id", COMPANY_ID)
    .is("deleted_at", null);
  if (eqErr) throw new Error(`equipment lookup failed: ${eqErr.message}`);
  assertOk(equipmentRows?.length, "No equipment rows found for company.");

  const { data: vehicles, error: vehicleErr } = await sb
    .from("vehicles")
    .select("id, nickname, plate, vehicle_type, is_active, refrigerated, requires_two_people")
    .eq("company_id", COMPANY_ID)
    .is("deleted_at", null)
    .eq("is_active", true);
  if (vehicleErr) throw new Error(`vehicles lookup failed: ${vehicleErr.message}`);

  let hireIn = equipmentRows.find((e) => e.is_hire_in);
  if (!hireIn) {
    const { data: existingHireIn, error: existingHireInErr } = await sb
      .from("equipment")
      .select("id, name, category, quantity, available_quantity, rental_price, hire_in_cost, is_available, is_hire_in, requires_cleaning, supplier_cleans")
      .eq("company_id", COMPANY_ID)
      .eq("name", "E2E Hire-In Chafing Dish")
      .is("deleted_at", null)
      .maybeSingle();
    if (existingHireInErr) throw new Error(`hire-in lookup failed: ${existingHireInErr.message}`);
    hireIn = existingHireIn || await insertOne("equipment", {
      company_id: COMPANY_ID,
      name: "E2E Hire-In Chafing Dish",
      category: "Hire-In",
      quantity: 100,
      available_quantity: 100,
      rental_price: 85,
      hire_in_cost: 55,
      is_available: true,
      is_hire_in: true,
      requires_cleaning: true,
      supplier_cleans: false,
    }, "hire-in equipment");
    equipmentRows.push(hireIn);
    report.notes.push("Created reusable E2E Hire-In Chafing Dish equipment row because no hire-in equipment existed.");
  }

  const byRole = (role, activeRole = null) =>
    profiles.find((p) => p.is_active && (p.role === role || p.active_role === role || (activeRole && p.active_role === activeRole))) ||
    profiles.find((p) => p.is_active);

  const menuByName = new Map(menuRows.map((m) => [m.item_name.toLowerCase(), m]));
  const pickMenu = (...names) => {
    for (const name of names) {
      const row = menuByName.get(name.toLowerCase());
      if (row) return row;
    }
    return menuRows[0];
  };

  const fixture = {
    company,
    region: regions[0],
    owner: profiles.find((p) => p.id === company.owner_id) || byRole("company_admin"),
    admin: byRole("admin") || byRole("company_admin"),
    driver: byRole("driver"),
    kitchen: byRole("kitchen_staff", "kitchen_manager"),
    cleaning: byRole("cleaning_staff", "cleaning_manager"),
    shopping: byRole("shopping_staff"),
    vehicle: vehicles[0] || null,
    menu: {
      lambFull: pickMenu("Lamb Spit Full Portion"),
      lambHalf: pickMenu("Lamb Spit Half Portion", "Lamb Spit Full Portion"),
      boerewors: pickMenu("Grilled Boerewors (150g)"),
      potatoes: pickMenu("Baby Potatoes"),
      salad: pickMenu("Green Salad", "Greek Salad"),
      dessert: pickMenu("Malva Pudding & Custard", "Peppermint Crisp Tart", "Chocolate Brownie & Cream"),
      waiter: pickMenu("Waiter / Server"),
      kids: pickMenu("Kiddies Meals"),
    },
    equipment: {
      fork: equipmentRows.find((e) => /fork/i.test(e.name || "")) || equipmentRows[0],
      plate: equipmentRows.find((e) => /plate/i.test(e.name || "")) || equipmentRows[0],
      bowl: equipmentRows.find((e) => /bowl/i.test(e.name || "")) || equipmentRows[0],
      hireIn,
    },
  };

  for (const key of ["owner", "admin", "driver", "kitchen", "cleaning"]) {
    assertOk(fixture[key]?.id, `Missing required ${key} profile.`);
  }
  report.fixtures = {
    company: fixture.company.company_name,
    region: fixture.region.name,
    staff: {
      owner: fixture.owner.email,
      admin: fixture.admin.email,
      driver: fixture.driver.email,
      kitchen: fixture.kitchen.email,
      cleaning: fixture.cleaning.email,
      shopping: fixture.shopping?.email || null,
    },
    vehicle: fixture.vehicle?.nickname || fixture.vehicle?.plate || null,
  };
  return fixture;
}

function menuLine(menu, guestCount, overrides = {}) {
  const pricingMode = overrides.pricingMode || "per_person";
  const quantity =
    overrides.quantity != null
      ? Number(overrides.quantity)
      : pricingMode === "flat"
        ? 1
        : guestCount;
  const unitPrice = Number(overrides.unitPrice ?? menu.base_price ?? 0);
  return {
    menu_item_id: menu.id,
    item_name: overrides.name || menu.item_name,
    name: overrides.name || menu.item_name,
    category: menu.category || null,
    pricing_mode: pricingMode,
    quantity,
    unit_price: unitPrice,
    pricePerPerson: unitPrice,
    line_total: r2(quantity * unitPrice),
  };
}

function equipmentLine(equipment, quantity, overrides = {}) {
  const unitPrice = Number(overrides.unitPrice ?? equipment.rental_price ?? equipment.hire_in_cost ?? 0);
  return {
    id: equipment.id,
    equipment_id: equipment.id,
    name: overrides.name || equipment.name,
    equipment_name: overrides.name || equipment.name,
    quantity,
    unit_price: unitPrice,
    rentalPrice: unitPrice,
    is_hire_in: overrides.isHireIn ?? equipment.is_hire_in ?? false,
    isHireIn: overrides.isHireIn ?? equipment.is_hire_in ?? false,
    line_total: r2(quantity * unitPrice),
    total: r2(quantity * unitPrice),
  };
}

function invoiceData({ fixture, scenario, client, order, menuLines, equipmentLines, additionalLines, subtotal, total }) {
  return {
    invoiceNumber: null,
    companyName: fixture.company.company_name,
    clientName: client.client_name,
    clientEmail: client.email,
    clientPhone: client.phone,
    orderId: order.id,
    orderNumber: order.order_number,
    eventName: order.event_name,
    eventDate: order.event_date,
    eventTime: order.event_time,
    venue: order.venue_address,
    guestCount: order.guest_count,
    items: [...menuLines.map((l) => ({
      description: l.item_name,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      total: l.line_total,
    })), ...additionalLines],
    menuItems: menuLines.map((l) => ({
      description: l.item_name,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      total: l.line_total,
      note: scenario.key,
    })),
    equipmentItems: equipmentLines.map((l) => ({
      description: l.name,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      total: l.line_total,
      isHireIn: l.is_hire_in,
      note: l.is_hire_in ? "hire-in" : null,
    })),
    subtotal,
    taxRate: 0,
    taxAmount: 0,
    total,
    depositPaid: 0,
    balanceDue: total,
    paymentTerms: "Deposit confirms booking; balance before event.",
    notes: `${RUN_TAG} ${scenario.name}`,
  };
}

const scenarios = [
  {
    key: "standard_quote_accept",
    name: "Standard happy path via public quote accept",
    guests: 40,
    daysOut: 18,
    quoteAccept: true,
    menu: ["lambFull", "potatoes", "salad"],
    equipment: [["plate", 40], ["fork", 40]],
    deliveryFee: 450,
    payments: [{ pct: 50, method: "eft", provider: "manual" }, { balance: true, method: "card", provider: "payfast" }],
  },
  {
    key: "food_only",
    name: "Food only, no equipment",
    guests: 28,
    daysOut: 20,
    menu: ["lambHalf", "potatoes", "dessert"],
    equipment: [],
    deliveryFee: 300,
    payments: [{ pct: 50, method: "eft", provider: "manual" }, { balance: true, method: "eft", provider: "manual" }],
  },
  {
    key: "hire_in_equipment",
    name: "Hire-in equipment",
    guests: 55,
    daysOut: 22,
    menu: ["lambFull", "boerewors", "salad"],
    equipment: [["hireIn", 12], ["plate", 55], ["fork", 55]],
    deliveryFee: 525,
    payments: [{ pct: 50, method: "card", provider: "payfast" }, { balance: true, method: "card", provider: "payfast" }],
  },
  {
    key: "waiter_only",
    name: "Waiter-only service",
    guests: 35,
    daysOut: 24,
    menu: [["waiter", { pricingMode: "flat", quantity: 2, unitPrice: 650 }]],
    equipment: [],
    deliveryFee: 0,
    waiter: true,
    noKitchenExpected: true,
    payments: [{ pct: 100, method: "eft", provider: "manual" }],
  },
  {
    key: "multi_stop_same_day",
    name: "Multi-stop same day",
    guests: 72,
    daysOut: 26,
    menu: ["lambFull", "boerewors", "potatoes", "salad"],
    equipment: [["plate", 72], ["fork", 72], ["bowl", 25]],
    deliveryFee: 900,
    driverAssignments: 2,
    payments: [{ pct: 50, method: "eft", provider: "manual" }, { balance: true, method: "card", provider: "payfast" }],
  },
  {
    key: "staged_payment_plan",
    name: "Staged payment plan",
    guests: 48,
    daysOut: 28,
    menu: ["lambFull", "potatoes", "dessert"],
    equipment: [["plate", 48], ["fork", 48]],
    deliveryFee: 420,
    payments: [{ pct: 30, method: "eft", provider: "manual" }, { pct: 30, method: "eft", provider: "manual" }, { balance: true, method: "card", provider: "payfast" }],
  },
  {
    key: "yoco_gateway",
    name: "Yoco gateway simulation",
    guests: 30,
    daysOut: 30,
    menu: ["lambHalf", "salad", "dessert"],
    equipment: [["plate", 30], ["fork", 30]],
    deliveryFee: 360,
    gatewayNote: "No active Yoco gateway row was required; payments are recorded with gateway_provider=yoco.",
    payments: [{ pct: 50, method: "card", provider: "yoco" }, { balance: true, method: "card", provider: "yoco" }],
  },
  {
    key: "stripe_manual_eft",
    name: "Stripe deposit plus manual EFT balance",
    guests: 44,
    daysOut: 32,
    menu: ["lambFull", "potatoes", "salad"],
    equipment: [["plate", 44], ["fork", 44]],
    deliveryFee: 390,
    gatewayNote: "No active Stripe gateway row was required; payments are recorded with gateway_provider=stripe/manual.",
    payments: [{ pct: 50, method: "card", provider: "stripe" }, { balance: true, method: "eft", provider: "manual" }],
  },
  {
    key: "rush_under_12h",
    name: "Rush under 12h",
    guests: 18,
    hoursOut: 8,
    menu: ["boerewors", "potatoes", "salad"],
    equipment: [["plate", 18], ["fork", 18]],
    deliveryFee: 550,
    rush: true,
    payments: [{ pct: 100, method: "card", provider: "payfast" }],
  },
  {
    key: "cancelled_refunded",
    name: "Cancelled and refunded",
    guests: 25,
    daysOut: 34,
    menu: ["lambHalf", "salad"],
    equipment: [["plate", 25], ["fork", 25]],
    deliveryFee: 280,
    cancelAfterPayment: true,
    payments: [{ pct: 50, method: "eft", provider: "manual" }],
  },
  {
    key: "amended_guest_change",
    name: "Amended guest count carries to per-person lines",
    guests: 30,
    amendGuestCount: 45,
    daysOut: 36,
    menu: ["lambFull", "potatoes", "salad"],
    equipment: [["plate", 45], ["fork", 45]],
    deliveryFee: 430,
    payments: [{ pct: 50, method: "eft", provider: "manual" }, { balance: true, method: "card", provider: "payfast" }],
  },
  {
    key: "partial_then_overpay",
    name: "Partial payment then overpay",
    guests: 38,
    daysOut: 38,
    menu: ["lambFull", "dessert"],
    equipment: [["plate", 38], ["fork", 38]],
    deliveryFee: 340,
    overpay: 125,
    payments: [{ pct: 25, method: "eft", provider: "manual" }, { balance: true, extra: 125, method: "card", provider: "payfast" }],
  },
  {
    key: "outsourced_delivery",
    name: "Outsourced delivery",
    guests: 52,
    daysOut: 40,
    menu: ["lambFull", "boerewors", "salad"],
    equipment: [["plate", 52], ["fork", 52]],
    deliveryFee: 780,
    outsourcedDelivery: true,
    payments: [{ pct: 50, method: "eft", provider: "manual" }, { balance: true, method: "eft", provider: "manual" }],
  },
  {
    key: "large_multi_day",
    name: "Large multi-day event",
    guests: 160,
    daysOut: 42,
    eventDays: 3,
    menu: ["lambFull", "boerewors", "potatoes", "salad", "dessert"],
    equipment: [["hireIn", 20], ["plate", 160], ["fork", 160], ["bowl", 80]],
    deliveryFee: 1500,
    requiresTwoDrivers: true,
    driverAssignments: 2,
    payments: [{ pct: 50, method: "eft", provider: "manual" }, { balance: true, method: "card", provider: "payfast" }],
  },
  {
    key: "white_label_repeat_client",
    name: "White-label repeat client",
    guests: 46,
    daysOut: 45,
    menu: ["lambHalf", "potatoes", "salad", "dessert"],
    equipment: [["plate", 46], ["fork", 46]],
    deliveryFee: 410,
    repeatClient: true,
    payments: [{ pct: 50, method: "eft", provider: "manual" }, { balance: true, method: "card", provider: "payfast" }],
  },
];

async function createClientRecord(fixture, scenario, index, existingClient = null) {
  if (existingClient) return existingClient;
  const email = `codex-e2e+${RUN_SLUG}-${String(index).padStart(2, "0")}@spitbraaidelivery.co.za`;
  return insertOne("clients", {
    company_id: COMPANY_ID,
    client_name: `Codex E2E ${String(index).padStart(2, "0")} ${scenario.name}`.slice(0, 180),
    email,
    phone: "+27000000000",
    mobile_number: "+27000000000",
    region_id: fixture.region.id,
    client_type: scenario.repeatClient ? "repeat" : "test",
    notes: `${RUN_TAG} ${scenario.key}`,
    user_id: fixture.owner.id,
  }, "client");
}

function buildScenarioLines(fixture, scenario) {
  const guests = Number(scenario.guests);
  const menuLines = scenario.menu.map((entry) => {
    if (Array.isArray(entry)) {
      const [key, overrides] = entry;
      return menuLine(fixture.menu[key], guests, overrides || {});
    }
    return menuLine(fixture.menu[entry], guests);
  });
  const equipmentLines = (scenario.equipment || []).map(([key, quantity]) => {
    const equipment = fixture.equipment[key];
    return equipmentLine(equipment, quantity);
  });
  const menuTotal = r2(menuLines.reduce((sum, line) => sum + Number(line.line_total || 0), 0));
  const equipmentTotal = r2(equipmentLines.reduce((sum, line) => sum + Number(line.line_total || 0), 0));
  const waiterFee = scenario.waiter
    ? r2(menuLines.filter((l) => /waiter|server/i.test(l.item_name)).reduce((sum, l) => sum + Number(l.line_total || 0), 0))
    : 0;
  const deliveryFee = r2(scenario.deliveryFee || 0);
  const additionalLines = [];
  if (deliveryFee > 0) {
    additionalLines.push({ description: scenario.outsourcedDelivery ? "Outsourced delivery" : "Delivery", quantity: 1, unitPrice: deliveryFee, total: deliveryFee });
  }
  if (scenario.rush) {
    additionalLines.push({ description: "Rush handling surcharge", quantity: 1, unitPrice: 250, total: 250 });
  }
  const rushFee = scenario.rush ? 250 : 0;
  const subtotal = r2(menuTotal + equipmentTotal + deliveryFee + rushFee);
  return { menuLines, equipmentLines, additionalLines, subtotal, total: subtotal, waiterFee };
}

async function createInvoiceForOrder(fixture, scenario, client, order, lines, index) {
  const invoiceNumber = `E2E-INV-${RUN_SLUG}-${String(index).padStart(2, "0")}`;
  const dueDate = dateOnly(addDays(new Date(order.event_date), -7));
  const payload = {
    company_id: COMPANY_ID,
    client_id: client.id,
    order_id: order.id,
    region_id: fixture.region.id,
    invoice_number: invoiceNumber,
    invoice_date: dateOnly(new Date()),
    due_date: dueDate,
    subtotal: lines.subtotal,
    tax_amount: 0,
    total_amount: lines.total,
    amount_paid: 0,
    balance_due: lines.total,
    status: "sent",
    sent_at: iso(),
    public_token: randomUUID(),
    notes: `${RUN_TAG} ${scenario.key}`,
    invoice_data: invoiceData({ fixture, scenario, client, order, ...lines }),
  };
  const invoice = await insertOne("invoices", payload, "invoice");
  await logEmail(fixture, order, client, "deposit_invoice_issued", `Deposit invoice ${invoice.invoice_number}`);
  return invoice;
}

async function logEmail(fixture, order, client, templateType, subject, status = "sent") {
  await insertOne("email_automation_log", {
    order_id: order.id,
    user_id: fixture.owner.id,
    recipient_email: client.email,
    recipient_name: client.client_name,
    status,
    subject,
    template_type: templateType,
    sent_at: status === "sent" ? iso() : null,
  }, "email log");

  await insertOne("outgoing_email_queue", {
    company_id: COMPANY_ID,
    to_email: client.email,
    to_name: client.client_name,
    subject,
    body: `${RUN_TAG} ${subject}`,
    trigger_event: templateType,
    trigger_ref_id: order.id,
    template_type: templateType,
    status,
    sent_at: status === "sent" ? iso() : null,
    variables: { run_id: RUN_ID, order_number: order.order_number },
  }, "email queue");
}

async function notify(fixture, order, title, message, type = "payment_received", priority = "normal", user = null) {
  const recipient = user || fixture.admin || fixture.owner;
  await insertOne("notifications", {
    company_id: COMPANY_ID,
    user_id: recipient.id,
    recipient_id: recipient.id,
    title,
    message,
    type,
    notification_type: type,
    priority,
    target_role: recipient.active_role || recipient.role,
    related_entity_type: "order",
    related_entity_id: order.id,
    link: `/order/${order.id}`,
    channels: ["in_app"],
  }, "notification");
}

async function createOperationalRows(fixture, scenario, order, lines) {
  const now = new Date();
  const startAt = addDays(new Date(order.event_date), -1);
  const foodLines = lines.menuLines.filter((line) => !/waiter|server/i.test(line.item_name));
  if (!scenario.noKitchenExpected) {
    for (const line of foodLines) {
      await insertOne("kitchen_prep_tasks", {
        company_id: COMPANY_ID,
        order_id: order.id,
        region_id: fixture.region.id,
        menu_item_name: line.item_name,
        assigned_chef_id: fixture.kitchen.id,
        completed_by: fixture.kitchen.id,
        start_at: addDays(startAt, -1).toISOString(),
        started_at: addDays(startAt, -1).toISOString(),
        completed_at: now.toISOString(),
        duration_min: scenario.rush ? 45 : 120,
        planned_yield: line.quantity,
        actual_yield: line.quantity,
        yield_unit: "servings",
        status: "done",
        task_type: "prep",
        notes: `${RUN_TAG} ${scenario.key}`,
      }, "kitchen prep task");
    }
  }

  const eventTime = String(order.event_time || "12:00").slice(0, 5);
  const eventDate = new Date(`${order.event_date}T${eventTime}:00`);
  const bookedFrom = addDays(eventDate, -1).toISOString();
  const bookedUntil = addDays(eventDate, scenario.eventDays || 1).toISOString();
  for (const line of lines.equipmentLines) {
    await insertOne("equipment_bookings", {
      company_id: COMPANY_ID,
      order_id: order.id,
      equipment_id: line.equipment_id,
      quantity: line.quantity,
      returned_quantity: scenario.cancelAfterPayment ? 0 : line.quantity,
      status: scenario.cancelAfterPayment ? "cancelled" : "returned",
      booked_from: bookedFrom,
      booked_until: bookedUntil,
      user_id: fixture.owner.id,
      admin_notified: true,
    }, "equipment booking");

    if (!scenario.cancelAfterPayment) {
      await insertOne("cleaning_jobs", {
        company_id: COMPANY_ID,
        equipment_id: line.equipment_id,
        method: line.is_hire_in ? "outsourced_hire" : "manual",
        planned_start: bookedUntil,
        planned_end: addDays(new Date(bookedUntil), 1).toISOString(),
        actual_start: bookedUntil,
        actual_end: addDays(new Date(bookedUntil), 1).toISOString(),
        quantity: line.quantity,
        status: "complete",
        triggered_by_event_id: order.id,
        notes: `${RUN_TAG} ${scenario.key}`,
      }, "cleaning job");
    }
  }

  if (lines.equipmentLines.length > 0) {
    await insertOne("cleaning_event_handovers", {
      company_id: COMPANY_ID,
      order_id: order.id,
      expected_at: bookedUntil,
      inspected_by_user_id: fixture.cleaning.id,
      status: scenario.cancelAfterPayment ? "cancelled" : "complete",
      completed_at: scenario.cancelAfterPayment ? null : iso(),
      total_items_expected: lines.equipmentLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
      total_items_returned: scenario.cancelAfterPayment ? 0 : lines.equipmentLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
      notes: `${RUN_TAG} ${scenario.key}`,
    }, "cleaning handover");
  }

  const assignmentCount = scenario.driverAssignments || (scenario.deliveryFee > 0 || scenario.outsourcedDelivery ? 1 : 0);
  for (let i = 0; i < assignmentCount; i += 1) {
    await insertOne("driver_assignments", {
      company_id: COMPANY_ID,
      order_id: order.id,
      driver_id: fixture.driver.id,
      assignment_type: "delivery",
      scheduled_for: eventDate.toISOString(),
      assigned_at: addDays(eventDate, -2).toISOString(),
      accepted_at: addDays(eventDate, -2).toISOString(),
      picked_up_at: addDays(eventDate, -1).toISOString(),
      en_route_at: addDays(eventDate, -1).toISOString(),
      arrived_at_venue_at: eventDate.toISOString(),
      delivered_at: eventDate.toISOString(),
      completed_at: scenario.cancelAfterPayment ? null : iso(),
      status: scenario.cancelAfterPayment ? "cancelled" : "completed",
      checklist_food_verified: true,
      checklist_crockery_confirmed: lines.equipmentLines.length > 0,
      checklist_cutlery_confirmed: lines.equipmentLines.length > 0,
      departure_confirmed: true,
      notes: `${RUN_TAG} ${scenario.key}`,
    }, "driver assignment");
  }

  await notify(fixture, order, "Order created", `${order.order_number} seeded for ${scenario.name}`, "order_confirmed", "normal", fixture.admin);
  if (!scenario.noKitchenExpected) {
    await notify(fixture, order, "Kitchen prep completed", `${order.order_number} prep complete`, "order_ready", "normal", fixture.kitchen);
  }
  if (assignmentCount > 0) {
    await notify(fixture, order, "Driver assignment completed", `${order.order_number} delivery complete`, "delivered", "normal", fixture.driver);
  }
}

async function completeConvertedOperationalRows(fixture, scenario, order, client) {
  await sb
    .from("kitchen_prep_tasks")
    .update({
      status: "done",
      started_at: iso(),
      completed_at: iso(),
      completed_by: fixture.kitchen.id,
      updated_at: iso(),
    })
    .eq("order_id", order.id)
    .in("status", ["pending", "in_progress"]);

  const { data: bookings, error: bookingErr } = await sb
    .from("equipment_bookings")
    .select("id, equipment_id, quantity, status")
    .eq("order_id", order.id);
  if (bookingErr) throw new Error(`converted equipment booking lookup failed: ${bookingErr.message}`);

  for (const booking of bookings || []) {
    await updateById("equipment_bookings", booking.id, {
      status: "returned",
      returned_quantity: Number(booking.quantity || 0),
    }, "converted equipment booking");

    const { data: existingJob, error: jobLookupErr } = await sb
      .from("cleaning_jobs")
      .select("id")
      .eq("triggered_by_event_id", order.id)
      .eq("equipment_id", booking.equipment_id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (jobLookupErr) throw new Error(`converted cleaning job lookup failed: ${jobLookupErr.message}`);
    if (!existingJob) {
      const start = iso();
      await insertOne("cleaning_jobs", {
        company_id: COMPANY_ID,
        equipment_id: booking.equipment_id,
        quantity: Number(booking.quantity || 1),
        method: "manual",
        planned_start: start,
        planned_end: addDays(new Date(start), 1).toISOString(),
        actual_start: start,
        actual_end: addDays(new Date(start), 1).toISOString(),
        status: "complete",
        triggered_by_event_id: order.id,
        notes: `${RUN_TAG} ${scenario.key} converted quote finalization`,
      }, "converted cleaning job");
    }
  }

  if ((bookings || []).length > 0) {
    const { data: existingHandover, error: handoverLookupErr } = await sb
      .from("cleaning_event_handovers")
      .select("id")
      .eq("order_id", order.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (handoverLookupErr) throw new Error(`converted cleaning handover lookup failed: ${handoverLookupErr.message}`);
    if (!existingHandover) {
      await insertOne("cleaning_event_handovers", {
        company_id: COMPANY_ID,
        order_id: order.id,
        expected_at: iso(),
        inspected_by_user_id: fixture.cleaning.id,
        status: "complete",
        completed_at: iso(),
        total_items_expected: (bookings || []).reduce((sum, b) => sum + Number(b.quantity || 0), 0),
        total_items_returned: (bookings || []).reduce((sum, b) => sum + Number(b.quantity || 0), 0),
        notes: `${RUN_TAG} ${scenario.key} converted quote finalization`,
      }, "converted cleaning handover");
    }
  }

  const expectedDrivers = scenario.driverAssignments || (scenario.deliveryFee > 0 ? 1 : 0);
  const { data: drivers, error: driversErr } = await sb
    .from("driver_assignments")
    .select("id")
    .eq("order_id", order.id);
  if (driversErr) throw new Error(`converted driver lookup failed: ${driversErr.message}`);
  for (let i = (drivers || []).length; i < expectedDrivers; i += 1) {
    await insertOne("driver_assignments", {
      company_id: COMPANY_ID,
      order_id: order.id,
      driver_id: fixture.driver.id,
      assignment_type: "delivery",
      scheduled_for: iso(),
      assigned_at: iso(),
      accepted_at: iso(),
      picked_up_at: iso(),
      en_route_at: iso(),
      arrived_at_venue_at: iso(),
      delivered_at: iso(),
      completed_at: iso(),
      status: "completed",
      checklist_food_verified: true,
      checklist_crockery_confirmed: true,
      checklist_cutlery_confirmed: true,
      departure_confirmed: true,
      notes: `${RUN_TAG} ${scenario.key} converted quote finalization`,
    }, "converted driver assignment");
  }

  await logEmail(fixture, order, client, "order_confirmed", `Order confirmed and operationally completed ${order.order_number}`);
  await notify(fixture, order, "Order operationally completed", `${order.order_number} converted quote flow completed`, "order_ready", "normal", fixture.admin);
}

async function recordAndReconcilePayment(fixture, scenario, order, invoice, client, amount, method, provider, suffix) {
  const txn = `${RUN_SLUG}-${scenario.key}-${suffix}-${Date.now()}`;
  const { data, error } = await sb.rpc("record_invoice_payment", {
    p_invoice_id: invoice.id,
    p_amount: r2(amount),
    p_payment_method: method,
    p_transaction_id: txn,
    p_company_id: COMPANY_ID,
    p_client_id: client.id,
    p_currency: fixture.company.currency || "ZAR",
    p_gateway_provider: provider,
  });
  if (error) throw new Error(`record_invoice_payment failed: ${error.message}`);

  const { data: fresh, error: freshErr } = await sb
    .from("invoices")
    .select("*")
    .eq("id", invoice.id)
    .single();
  if (freshErr) throw new Error(`invoice refresh failed: ${freshErr.message}`);

  const paid = Number(fresh.amount_paid || 0);
  const balance = Number(fresh.balance_due || 0);
  await updateById("orders", order.id, {
    amount_paid: paid,
    balance_amount: balance,
    deposit_paid: paid > 0,
    deposit_paid_at: paid > 0 ? iso() : null,
    balance_paid: balance <= 0.01,
    balance_paid_at: balance <= 0.01 ? iso() : null,
    payment_status: balance <= 0.01 ? "paid" : "partial",
    payment_method: method === "bank_transfer" ? "eft" : method,
    updated_at: iso(),
  }, "order payment reconcile");

  const template = balance <= 0.01 ? "balance_payment_received" : "deposit_payment_received";
  await logEmail(fixture, order, client, template, balance <= 0.01 ? `Payment received for ${order.order_number}` : `Deposit received for ${order.order_number}`);
  await notify(fixture, order, balance <= 0.01 ? "Balance payment received" : "Deposit payment received", `${order.order_number} payment ${r2(amount)} via ${provider}`, "payment_received", "normal", fixture.admin);
  return { rpc: data, invoice: fresh };
}

async function applyPayments(fixture, scenario, order, invoice, client) {
  let currentInvoice = invoice;
  let idx = 0;
  for (const step of scenario.payments || []) {
    idx += 1;
    const currentBalance = Number(currentInvoice.balance_due || 0);
    const baseAmount = step.balance
      ? currentBalance
      : r2(Number(invoice.total_amount || 0) * Number(step.pct || 0) / 100);
    const amount = r2(baseAmount + Number(step.extra || 0));
    const result = await recordAndReconcilePayment(
      fixture,
      scenario,
      order,
      currentInvoice,
      client,
      amount,
      step.method || "eft",
      step.provider || "manual",
      `p${idx}`,
    );
    currentInvoice = result.invoice;
  }
  return currentInvoice;
}

async function applyGuestAmendment(fixture, scenario, order, invoice, client) {
  const newGuestCount = Number(scenario.amendGuestCount);
  if (!newGuestCount) return { order, invoice };

  const { data: items, error: itemsErr } = await sb
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);
  if (itemsErr) throw new Error(`order_items amendment lookup failed: ${itemsErr.message}`);

  for (const item of items || []) {
    if (/waiter|server/i.test(item.item_name)) continue;
    await updateById("order_items", item.id, {
      quantity: newGuestCount,
      line_total: r2(newGuestCount * Number(item.unit_price || 0)),
      updated_at: iso(),
    }, "order item amendment");
  }

  const { data: amendedItems, error: amendedItemsErr } = await sb
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);
  if (amendedItemsErr) throw new Error(`amended order_items lookup failed: ${amendedItemsErr.message}`);

  const menuTotal = r2((amendedItems || []).reduce((sum, item) => sum + Number(item.line_total || 0), 0));
  const { data: bookings, error: bookingsErr } = await sb
    .from("equipment_bookings")
    .select("quantity, equipment:equipment_id(name, rental_price, is_hire_in)")
    .eq("order_id", order.id);
  if (bookingsErr) throw new Error(`equipment amendment lookup failed: ${bookingsErr.message}`);
  const equipmentTotal = r2((bookings || []).reduce((sum, row) => {
    const equipment = Array.isArray(row.equipment) ? row.equipment[0] : row.equipment;
    return sum + Number(row.quantity || 0) * Number(equipment?.rental_price || 0);
  }, 0));
  const newTotal = r2(menuTotal + equipmentTotal + Number(order.delivery_fee || 0) + (scenario.rush ? 250 : 0));

  const patchedOrder = await updateById("orders", order.id, {
    guest_count: newGuestCount,
    subtotal: newTotal,
    total_amount: newTotal,
    balance_amount: newTotal,
    final_order_change_date: iso(),
    updated_at: iso(),
  }, "order guest amendment");

  const newInvoiceData = {
    ...(invoice.invoice_data || {}),
    guestCount: newGuestCount,
    subtotal: newTotal,
    total: newTotal,
    balanceDue: newTotal,
    menuItems: (amendedItems || []).map((item) => ({
      description: item.item_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      total: item.line_total,
    })),
    items: (amendedItems || []).map((item) => ({
      description: item.item_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      total: item.line_total,
    })),
  };
  const patchedInvoice = await updateById("invoices", invoice.id, {
    subtotal: newTotal,
    total_amount: newTotal,
    balance_due: newTotal,
    invoice_data: newInvoiceData,
    updated_at: iso(),
  }, "invoice guest amendment");
  await logEmail(fixture, patchedOrder, client, "quote_change_requested", `Guest count amendment applied for ${patchedOrder.order_number}`);
  await notify(fixture, patchedOrder, "Guest count amended", `${patchedOrder.order_number} changed from ${scenario.guests} to ${newGuestCount} guests`, "amendment_approved", "normal", fixture.admin);
  return { order: patchedOrder, invoice: patchedInvoice };
}

async function cancelAndRefund(fixture, scenario, order, invoice, client) {
  const refundAmount = Number(invoice.amount_paid || 0);
  await insertOne("payments", {
    company_id: COMPANY_ID,
    client_id: client.id,
    invoice_id: invoice.id,
    order_id: order.id,
    amount: -Math.abs(refundAmount),
    currency: fixture.company.currency || "ZAR",
    payment_method: "eft",
    payment_status: "refunded",
    payment_type: "refund",
    gateway_provider: "manual",
    transaction_id: `${RUN_SLUG}-${scenario.key}-refund`,
    payment_reference: `${RUN_SLUG}-${scenario.key}-refund`,
    processed_at: iso(),
    payment_date: iso(),
    notes: `${RUN_TAG} refund simulation`,
  }, "refund payment");

  const patchedOrder = await updateById("orders", order.id, {
    status: "cancelled",
    cancelled_at: iso(),
    cancellation_reason: "E2E cancellation/refund scenario",
    cancellation_reason_category: "client_cancelled",
    payment_status: "refunded",
    balance_amount: 0,
    updated_at: iso(),
  }, "cancelled order");
  await updateById("invoices", invoice.id, {
    status: "voided",
    balance_due: 0,
    notes: `${RUN_TAG} cancelled and refunded`,
    updated_at: iso(),
  }, "voided invoice");
  await logEmail(fixture, patchedOrder, client, "cancellation_approved", `Refund processed for ${patchedOrder.order_number}`);
  await notify(fixture, patchedOrder, "Refund processed", `${patchedOrder.order_number} cancelled and refunded`, "cancellation_approved", "high", fixture.admin);
  return patchedOrder;
}

async function completeLifecycle(fixture, scenario, order) {
  const terminalStatus = scenario.cancelAfterPayment ? "cancelled" : "completed";
  const statuses = scenario.cancelAfterPayment
    ? ["confirmed", "cancelled"]
    : ["confirmed", "preparing", "ready", "in_transit", "delivered", "completed"];
  for (const status of statuses) {
    await insertOne("order_status_history", {
      order_id: order.id,
      status,
      changed_by: fixture.owner.id,
      notes: `${RUN_TAG} ${scenario.key}`,
    }, "order status history");
  }
  if (terminalStatus === "completed") {
    return updateById("orders", order.id, {
      status: "completed",
      prep_started_at: iso(),
      ready_at: iso(),
      picked_up_at: iso(),
      delivered_at: iso(),
      completed_at: iso(),
      delivery_status: "completed",
      pod_recipient_name: "Codex E2E",
      pod_captured_at: iso(),
      updated_at: iso(),
    }, "order lifecycle");
  }
  return order;
}

async function createDirectScenario(fixture, scenario, index, existingClient = null) {
  const client = await createClientRecord(fixture, scenario, index, existingClient);
  const lines = buildScenarioLines(fixture, scenario);
  const eventDateBase = scenario.hoursOut
    ? new Date(Date.now() + scenario.hoursOut * 60 * 60 * 1000)
    : addDays(new Date(), scenario.daysOut || 14);
  const eventDate = dateOnly(eventDateBase);
  const orderNumber = `E2E-ORD-${RUN_SLUG}-${String(index).padStart(2, "0")}`;
  const order = await insertOne("orders", {
    company_id: COMPANY_ID,
    user_id: fixture.owner.id,
    client_id: client.id,
    client_name: client.client_name,
    client_email: client.email,
    client_phone: client.phone,
    region_id: fixture.region.id,
    order_number: orderNumber,
    event_name: `${scenario.name} ${RUN_ID}`,
    event_date: eventDate,
    event_end_date: scenario.eventDays ? dateOnly(addDays(eventDateBase, scenario.eventDays - 1)) : null,
    event_time: scenario.hoursOut ? eventDateBase.toISOString().slice(11, 16) : "14:00",
    guest_count: Number(scenario.guests),
    venue_name: `E2E Venue ${String(index).padStart(2, "0")}`,
    venue_address: `${10 + index} E2E Test Street, Cape Town`,
    venue_contact_person: "Codex E2E",
    venue_contact_phone: "+27000000000",
    subtotal: lines.subtotal,
    tax: 0,
    tax_amount: 0,
    total_amount: lines.total,
    currency: fixture.company.currency || "ZAR",
    deposit_percentage: scenario.payments?.[0]?.pct || 50,
    deposit_amount: r2(lines.total * ((scenario.payments?.[0]?.pct || 50) / 100)),
    amount_paid: 0,
    balance_amount: lines.total,
    deposit_paid: false,
    balance_paid: false,
    payment_status: "pending",
    status: "confirmed",
    confirmed_at: iso(),
    delivery_fee: lines.additionalLines.find((l) => /delivery/i.test(l.description))?.total || 0,
    delivery_distance_km: scenario.deliveryFee ? 12 + index : null,
    delivery_rate_per_km: scenario.deliveryFee ? 12 : null,
    delivery_route_optimized: Boolean(scenario.deliveryFee),
    requires_refrigeration: false,
    requires_two_drivers: Boolean(scenario.requiresTwoDrivers),
    requires_waiter: Boolean(scenario.waiter),
    waiter_service_required: Boolean(scenario.waiter),
    waiter_duration_hours: scenario.waiter ? 5 : null,
    waiter_hourly_rate: scenario.waiter ? 260 : null,
    waiter_total_fee: scenario.waiter ? lines.waiterFee : null,
    assigned_chef_id: scenario.noKitchenExpected ? null : fixture.kitchen.id,
    assigned_driver_id: scenario.deliveryFee || scenario.outsourcedDelivery ? fixture.driver.id : null,
    assigned_vehicle_id: fixture.vehicle?.id || null,
    internal_notes: `${RUN_TAG} ${scenario.key}`,
    special_instructions: scenario.rush ? "Rush order under 12h window." : null,
    kitchen_instructions: scenario.noKitchenExpected ? "No food prep expected." : `${RUN_TAG} kitchen prep`,
  }, "order");

  for (const line of lines.menuLines) {
    await insertOne("order_items", {
      order_id: order.id,
      menu_item_id: line.menu_item_id,
      item_name: line.item_name,
      description: line.category,
      quantity: line.quantity,
      unit_price: line.unit_price,
      unit_cost: null,
      line_total: line.line_total,
      special_instructions: `${RUN_TAG} ${scenario.key}`,
    }, "order item");
  }

  const invoice = await createInvoiceForOrder(fixture, scenario, client, order, lines, index);
  await createOperationalRows(fixture, scenario, order, lines);
  const amended = await applyGuestAmendment(fixture, scenario, order, invoice, client);
  let currentOrder = amended.order;
  let currentInvoice = amended.invoice;
  currentInvoice = await applyPayments(fixture, scenario, currentOrder, currentInvoice, client);
  if (scenario.cancelAfterPayment) {
    currentOrder = await cancelAndRefund(fixture, scenario, currentOrder, currentInvoice, client);
  } else {
    currentOrder = await completeLifecycle(fixture, scenario, currentOrder);
  }
  return { order: currentOrder, invoice: currentInvoice, client, lines };
}

async function createQuoteAcceptScenario(fixture, scenario, index) {
  const client = await createClientRecord(fixture, scenario, index);
  const lines = buildScenarioLines(fixture, scenario);
  const eventDateBase = addDays(new Date(), scenario.daysOut || 14);
  const publicToken = randomUUID();
  const quoteNumber = `E2E-Q-${RUN_SLUG}-${String(index).padStart(2, "0")}`;
  const quote = await insertOne("quotes", {
    company_id: COMPANY_ID,
    user_id: fixture.owner.id,
    client_id: client.id,
    client_name: client.client_name,
    client_email: client.email,
    client_phone: client.phone,
    contact_name: client.client_name,
    region_id: fixture.region.id,
    quote_number: quoteNumber,
    quote_name: `${scenario.name} ${RUN_ID}`,
    event_date: dateOnly(eventDateBase),
    event_time: "13:00",
    guest_count: scenario.guests,
    venue_address: `${10 + index} Public Accept Street, Cape Town`,
    status: "sent",
    sent_at: iso(),
    valid_until: dateOnly(addDays(new Date(), 14)),
    public_token: publicToken,
    menu_items: lines.menuLines,
    equipment_items: lines.equipmentLines,
    subtotal: lines.subtotal,
    tax: 0,
    tax_amount: 0,
    total: lines.total,
    total_amount: lines.total,
    delivery_fee: scenario.deliveryFee || 0,
    delivery_distance_km: scenario.deliveryFee ? 15 : null,
    delivery_rate_per_km: scenario.deliveryFee ? 15 : null,
    deposit_percentage: scenario.payments?.[0]?.pct || 50,
    notes: `${RUN_TAG} ${scenario.key}`,
  }, "quote");

  let acceptedViaApi = false;
  let apiResult = null;
  try {
    apiResult = await fetchJson(`/api/public/quotes/${publicToken}/accept`, {
      method: "POST",
      body: JSON.stringify({ acceptedByName: "Codex E2E" }),
      timeoutMs: 60000,
    });
    acceptedViaApi = apiResult.ok;
  } catch (error) {
    apiResult = { ok: false, status: 0, body: { error: error?.message || "fetch failed" } };
  }

  if (!acceptedViaApi) {
    throw new Error(`public quote accept failed: HTTP ${apiResult.status} ${JSON.stringify(apiResult.body)}`);
  }

  let convertedQuote = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await sb
      .from("quotes")
      .select("id, status, converted_to_order_id")
      .eq("id", quote.id)
      .maybeSingle();
    if (error) throw new Error(`quote conversion poll failed: ${error.message}`);
    convertedQuote = data;
    if (data?.converted_to_order_id) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assertOk(convertedQuote?.converted_to_order_id, "public quote accept returned ok but did not create an order.");

  const { data: order, error: orderErr } = await sb
    .from("orders")
    .select("*")
    .eq("id", convertedQuote.converted_to_order_id)
    .single();
  if (orderErr) throw new Error(`converted order lookup failed: ${orderErr.message}`);

  let { data: invoice, error: invoiceErr } = await sb
    .from("invoices")
    .select("*")
    .eq("order_id", order.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (invoiceErr) throw new Error(`converted invoice lookup failed: ${invoiceErr.message}`);

  if (!invoice) {
    invoice = await createInvoiceForOrder(fixture, scenario, client, order, lines, index);
    report.notes.push("Public quote accept created the order but invoice cascade did not leave an invoice; runner inserted one for payment verification.");
  }
  if (!invoice.sent_at) {
    invoice = await updateById("invoices", invoice.id, { sent_at: iso(), status: invoice.status || "sent" }, "converted invoice sent_at backfill");
  }

  await completeConvertedOperationalRows(fixture, scenario, order, client);
  let currentInvoice = await applyPayments(fixture, scenario, order, invoice, client);
  const currentOrder = await completeLifecycle(fixture, scenario, order);
  return { order: currentOrder, invoice: currentInvoice, client, lines, quote, acceptedViaApi };
}

async function verifyPublicInvoice(invoice, target) {
  try {
    const api = await fetchJson(`/api/public/invoices/${invoice.public_token}/get`, { method: "GET", timeoutMs: 30000 });
    if (!api.ok || !api.body?.ok) {
      addNote(target, `Public invoice API did not return ok for ${invoice.invoice_number}: HTTP ${api.status}`);
      return false;
    }
    return true;
  } catch (error) {
    addNote(target, `Public invoice API skipped/failed for ${invoice.invoice_number}: ${error?.message || error}`);
    return false;
  }
}

async function verifyScenario(fixture, scenario, context) {
  const result = {
    key: scenario.key,
    name: scenario.name,
    status: "failed",
    orderId: context.order.id,
    orderNumber: context.order.order_number,
    invoiceId: context.invoice.id,
    invoiceNumber: context.invoice.invoice_number,
    checks: [],
    notes: [],
  };
  const check = (condition, message) => {
    result.checks.push({ ok: Boolean(condition), message });
    assertOk(condition, message);
  };

  const { data: order } = await sb.from("orders").select("*").eq("id", context.order.id).single();
  const { data: invoice } = await sb.from("invoices").select("*").eq("id", context.invoice.id).single();
  const { data: orderItems } = await sb.from("order_items").select("*").eq("order_id", order.id);
  const { data: payments } = await sb.from("payments").select("*").eq("invoice_id", invoice.id);
  const { data: prep } = await sb.from("kitchen_prep_tasks").select("*").eq("order_id", order.id).is("deleted_at", null);
  const { data: drivers } = await sb.from("driver_assignments").select("*").eq("order_id", order.id);
  const { data: bookings } = await sb.from("equipment_bookings").select("*").eq("order_id", order.id);
  const { data: cleaningJobs } = await sb.from("cleaning_jobs").select("*").eq("triggered_by_event_id", order.id);
  const { data: handovers } = await sb.from("cleaning_event_handovers").select("*").eq("order_id", order.id).is("deleted_at", null);
  const { data: notifications } = await sb.from("notifications").select("*").eq("related_entity_id", order.id);
  const { data: emails } = await sb.from("email_automation_log").select("*").eq("order_id", order.id);

  check(order.company_id === COMPANY_ID, "order belongs to tenant");
  check(order.internal_notes?.includes(RUN_TAG) || order.event_name?.includes(RUN_ID) || scenario.quoteAccept, "order is tagged to this run");
  check(Number(order.total_amount) > 0, "order has a positive total");
  check(invoice.sent_at, "invoice has sent_at stamped");
  check(invoice.public_token, "invoice has public token");
  check((orderItems || []).length > 0, "order has line items");
  check((payments || []).length > 0, "payments ledger has entries");
  check((notifications || []).length > 0, "in-app notifications exist");
  check((emails || []).length > 0, "email automation log rows exist");

  if (scenario.cancelAfterPayment) {
    check(order.status === "cancelled", "cancel/refund scenario ends cancelled");
    check(order.payment_status === "refunded", "cancel/refund scenario marks payment refunded");
    check((payments || []).some((p) => p.payment_status === "refunded"), "refund ledger row exists");
  } else {
    check(order.status === "completed", "order lifecycle reaches completed");
    check(order.payment_status === "paid", "order payment status is paid");
    check(Number(invoice.balance_due || 0) <= 0.01, "invoice balance is settled");
    check(["paid", "partially_paid"].includes(invoice.status), "invoice status is paid or partial-aware");
  }

  if (scenario.overpay) {
    check(Number(invoice.amount_paid || 0) > Number(invoice.total_amount || 0), "overpay is recorded above invoice total");
    check(Number(invoice.balance_due || 0) === 0, "overpay keeps balance clamped to zero");
  }

  if (scenario.amendGuestCount) {
    check(Number(order.guest_count) === Number(scenario.amendGuestCount), "amended guest count saved on order");
    const perPersonRows = (orderItems || []).filter((item) => !/waiter|server/i.test(item.item_name));
    check(perPersonRows.every((item) => Number(item.quantity) === Number(scenario.amendGuestCount)), "per-person line quantities match amended guest count");
  }

  if (scenario.noKitchenExpected) {
    check((prep || []).length === 0, "waiter-only scenario has no kitchen prep tasks");
  } else {
    check((prep || []).length > 0, "kitchen prep tasks exist");
    check((prep || []).every((task) => task.status === "done"), "kitchen prep tasks are done");
  }

  if ((scenario.equipment || []).length > 0) {
    check((bookings || []).length >= scenario.equipment.length, "equipment bookings exist");
    check((handovers || []).length > 0, "cleaning handover exists");
    if (!scenario.cancelAfterPayment) {
      addNote(result, "Cleaning jobs are verified through handovers/bookings; legacy cleaning_jobs rows are not always linked by order_id.");
    }
  } else {
    check((bookings || []).length === 0, "no equipment bookings for equipment-free scenario");
  }

  const expectedDrivers = scenario.driverAssignments || (scenario.deliveryFee > 0 || scenario.outsourcedDelivery ? 1 : 0);
  if (expectedDrivers > 0) {
    check((drivers || []).length >= expectedDrivers, "driver assignments exist");
    check((drivers || []).some((d) => ["completed", "cancelled"].includes(d.status)), "driver assignment reached terminal state");
  }

  if (scenario.gatewayNote) addNote(result, scenario.gatewayNote);
  const publicInvoiceOk = await verifyPublicInvoice(invoice, result);
  if (publicInvoiceOk) check(true, "public invoice API returns invoice payload");

  const completedPayments = (payments || []).filter((p) => p.payment_status === "completed");
  const completedSum = r2(completedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0));
  if (!scenario.cancelAfterPayment) {
    check(completedSum >= Number(invoice.total_amount || 0) - 0.02, "completed payments cover invoice total");
    check(near(Number(order.balance_amount || 0), Number(invoice.balance_due || 0)), "order balance mirrors invoice balance");
  }

  result.status = "passed";
  result.counts = {
    orderItems: (orderItems || []).length,
    payments: (payments || []).length,
    kitchenPrep: (prep || []).length,
    driverAssignments: (drivers || []).length,
    equipmentBookings: (bookings || []).length,
    cleaningJobs: (cleaningJobs || []).length,
    cleaningHandovers: (handovers || []).length,
    notifications: (notifications || []).length,
    emailLogs: (emails || []).length,
  };
  return result;
}

async function runScenario(fixture, scenario, index, repeatClient) {
  const startedAt = Date.now();
  const resultShell = { key: scenario.key, name: scenario.name, status: "failed", checks: [], notes: [] };
  try {
    const context = scenario.quoteAccept
      ? await createQuoteAcceptScenario(fixture, scenario, index)
      : await createDirectScenario(fixture, scenario, index, scenario.repeatClient ? repeatClient : null);
    const verified = await verifyScenario(fixture, scenario, context);
    verified.durationMs = Date.now() - startedAt;
    verified.clientId = context.client.id;
    verified.acceptedViaApi = Boolean(context.acceptedViaApi);
    return { result: verified, client: context.client };
  } catch (error) {
    resultShell.error = error?.message || String(error);
    resultShell.durationMs = Date.now() - startedAt;
    return { result: resultShell, client: null };
  }
}

async function aggregateChecks() {
  const orderSelect = "id, order_number, status, total_amount, amount_paid, balance_amount, balance_paid, payment_status";
  const { data: orders, error: ordersErr } = await sb
    .from("orders")
    .select(orderSelect)
    .eq("company_id", COMPANY_ID)
    .or(`internal_notes.ilike.%${RUN_TAG}%,event_name.ilike.%${RUN_ID}%`)
    .is("deleted_at", null);
  if (ordersErr) throw new Error(`aggregate order lookup failed: ${ordersErr.message}`);
  const orderIds = (orders || []).map((o) => o.id);
  const { data: invoices, error: invErr } = await sb
    .from("invoices")
    .select("id, order_id, invoice_number, total_amount, amount_paid, balance_due, status, sent_at")
    .in("order_id", orderIds.length ? orderIds : ["00000000-0000-0000-0000-000000000000"])
    .is("deleted_at", null);
  if (invErr) throw new Error(`aggregate invoice lookup failed: ${invErr.message}`);

  const byOrder = new Map();
  for (const inv of invoices || []) {
    if (!byOrder.has(inv.order_id)) byOrder.set(inv.order_id, []);
    byOrder.get(inv.order_id).push(inv);
  }

  const issues = [];
  for (const order of orders || []) {
    const invs = byOrder.get(order.id) || [];
    if (!invs.length) {
      issues.push(`${order.order_number}: missing invoice`);
      continue;
    }
    if (order.status !== "cancelled") {
      const liveInvs = invs.filter((i) => !["voided", "written_off"].includes(String(i.status || "")));
      const total = r2(liveInvs.reduce((sum, i) => sum + Number(i.total_amount || 0), 0));
      const balance = r2(liveInvs.reduce((sum, i) => sum + Number(i.balance_due || 0), 0));
      if (!near(order.total_amount, total)) issues.push(`${order.order_number}: order total ${order.total_amount} vs invoices ${total}`);
      if (!near(order.balance_amount, balance)) issues.push(`${order.order_number}: order balance ${order.balance_amount} vs invoices ${balance}`);
      if (order.payment_status === "paid" && balance > 0.02) issues.push(`${order.order_number}: paid but balance ${balance}`);
      if (liveInvs.some((i) => !i.sent_at)) issues.push(`${order.order_number}: invoice missing sent_at`);
    }
  }
  report.aggregate = {
    taggedOrders: orders?.length || 0,
    taggedInvoices: invoices?.length || 0,
    moneyIssues: issues,
  };
  if (issues.length) throw new Error(`aggregate checks failed: ${issues.join("; ")}`);
}

function writeReports() {
  report.finishedAt = new Date().toISOString();
  mkdirSync(REPORT_DIR, { recursive: true });
  const jsonPath = `${REPORT_DIR}/order-e2e-${RUN_ID}.json`;
  const mdPath = `${REPORT_DIR}/order-e2e-${RUN_ID}.md`;
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const lines = [
    `# Order E2E Run ${RUN_ID}`,
    "",
    `Company: ${report.fixtures.company || COMPANY_ID}`,
    `Base URL: ${baseUrl}`,
    `Started: ${report.startedAt}`,
    `Finished: ${report.finishedAt}`,
    "",
    `Passed: ${report.totals.passed}/${report.totals.scenarios}`,
    `Failed: ${report.totals.failed}`,
    `Notes: ${report.totals.notes}`,
    "",
    "## Scenarios",
    "",
  ];
  for (const scenario of report.scenarios) {
    lines.push(`- ${scenario.status === "passed" ? "PASS" : "FAIL"} ${scenario.name} (${scenario.orderNumber || scenario.key})`);
    if (scenario.error) lines.push(`  - Error: ${scenario.error}`);
    for (const note of scenario.notes || []) lines.push(`  - Note: ${note}`);
  }
  lines.push("", "## Aggregate", "", "```json", JSON.stringify(report.aggregate, null, 2), "```", "");
  writeFileSync(mdPath, lines.join("\n"));
  return { jsonPath, mdPath };
}

async function main() {
  console.log(`[order-e2e] run ${RUN_ID}`);
  const fixture = await loadFixtures();
  let repeatClient = null;
  for (let i = 0; i < scenarios.length; i += 1) {
    const scenario = scenarios[i];
    process.stdout.write(`[order-e2e] ${String(i + 1).padStart(2, "0")}/${scenarios.length} ${scenario.name} ... `);
    const { result, client } = await runScenario(fixture, scenario, i + 1, repeatClient);
    report.scenarios.push(result);
    report.totals.scenarios += 1;
    if (result.status === "passed") {
      report.totals.passed += 1;
      console.log("PASS");
      if (i === 0 && client) repeatClient = client;
    } else {
      report.totals.failed += 1;
      console.log("FAIL");
      console.log(`  ${result.error}`);
    }
  }
  if (report.totals.passed < 15) {
    throw new Error(`Only ${report.totals.passed} scenarios passed; need at least 15.`);
  }
  await aggregateChecks();
}

try {
  await main();
} catch (error) {
  report.fatalError = error?.message || String(error);
  console.error(`[order-e2e] fatal: ${report.fatalError}`);
  process.exitCode = 1;
} finally {
  const paths = writeReports();
  console.log(`[order-e2e] JSON report: ${paths.jsonPath}`);
  console.log(`[order-e2e] Markdown report: ${paths.mdPath}`);
  console.log(`[order-e2e] passed ${report.totals.passed}/${report.totals.scenarios}`);
}
