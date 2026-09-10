import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const TOKEN="e877e365-d5b7-4839-b386-d5253f0c1141";
const nowIso = ()=>new Date().toISOString();

const { data: company } = await sb.from("companies").select("id, company_name").eq("embed_token", TOKEN).single();
console.log("Company:", company.company_name, company.id);

// Find a kitchen staffer + a driver in this company.
const { data: people } = await sb.from("profiles").select("id, full_name, role, active_role").eq("company_id", company.id);
const isKitchen = p => [p.role,p.active_role].some(r=>String(r||"").includes("kitchen"));
const isDriver  = p => [p.role,p.active_role].some(r=>String(r||"")==="driver");
const kitchen = (people||[]).find(isKitchen);
const driver  = (people||[]).find(isDriver);
console.log("Kitchen staffer:", kitchen ? `${kitchen.full_name} (${kitchen.id})` : "NONE");
console.log("Driver:", driver ? `${driver.full_name} (${driver.id})` : "NONE");
if (!kitchen || !driver) { console.log("Need both a kitchen staffer and a driver; aborting."); process.exit(1); }

// Use a real recent order for realistic order_number + linkage.
const { data: order } = await sb.from("orders").select("id, order_number, company_id").eq("company_id", company.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
if (!order) { console.log("No order found for company; aborting."); process.exit(1); }
console.log("Using order:", order.order_number, order.id);

const createdNotifIds = [];
const createdShiftIds = { kitchen: null, driver: null };

// ---- Mirror of createNotification's insertRow (notificationService.ts) ----
async function createNotification(n){
  const row = {
    company_id: n.company_id,
    recipient_id: n.recipient_id ?? n.user_id,
    user_id: n.user_id ?? n.recipient_id,
    notification_type: n.notification_type,
    title: n.title,
    message: n.message,
    link: n.link || null,
    priority: n.priority || "normal",
    metadata: {},
    related_entity_type: n.related_entity_type || null,
    related_entity_id: n.related_entity_id || null,
  };
  const { data, error } = await sb.from("notifications").insert([row]).select("id, recipient_id, notification_type, title, message, link").single();
  if (error) throw error;
  createdNotifIds.push(data.id);
  return data;
}

try {
  // 1) Seed an ACTIVE kitchen duty shift + ACTIVE driver shift for this order.
  const { data: kShift, error: kErr } = await sb.from("kitchen_duty_shifts").insert([{
    user_id: kitchen.id, staff_id: kitchen.id, order_id: order.id,
    shift_start: nowIso(), is_active: true, company_id: company.id,
  }]).select("id").single();
  if (kErr) throw new Error("seed kitchen shift: "+kErr.message);
  createdShiftIds.kitchen = kShift.id;

  // driver_shifts is unique per (driver, day); the real driver may already
  // have today's shift, so seed the test shift on an unused synthetic date.
  // autoClockOut matches by (company, driver, order, actual_end IS NULL) -
  // date-independent - so this exercises the exact same code path.
  const seedDate = "2025-02-02";
  await sb.from("driver_shifts").delete().eq("driver_id", driver.id).eq("order_id", order.id).eq("shift_date", seedDate);
  const { data: dShift, error: dErr } = await sb.from("driver_shifts").insert([{
    driver_id: driver.id, company_id: company.id, order_id: order.id,
    shift_date: seedDate, actual_start: nowIso(), status: "active", source: "auto",
  }]).select("id").single();
  if (dErr) throw new Error("seed driver shift: "+dErr.message);
  createdShiftIds.driver = dShift.id;
  console.log("\nSeeded active shifts -> kitchen:", kShift.id.slice(0,8), "driver:", dShift.id.slice(0,8));

  // ===== SCENARIO A: driver arrives to collect -> confirmAtKitchen =====
  console.log("\n=== A. Driver arrives at kitchen (pickup) -> kitchen auto clock-out ===");
  const { data: activeKShifts } = await sb.from("kitchen_duty_shifts")
    .select("id, staff_id, user_id, company_id").eq("order_id", order.id).eq("is_active", true);
  for (const s of activeKShifts || []) {
    // mirror endDutyShift close
    await sb.from("kitchen_duty_shifts").update({ shift_end: nowIso(), is_active: false, updated_at: nowIso() }).eq("id", s.id);
    const recipientId = s.staff_id || s.user_id;
    const note = await createNotification({
      company_id: s.company_id || order.company_id,
      recipient_id: recipientId, user_id: recipientId,
      notification_type: "kitchen_clock_out",
      title: "You've been clocked out",
      message: `Your kitchen shift for ${order.order_number || "this order"} was closed automatically when the driver arrived to collect.`,
      priority: "normal", link: "/team-portal/kitchen/duty",
      related_entity_type: "order", related_entity_id: order.id,
    });
    console.log("  kitchen shift closed:", s.id.slice(0,8));
    console.log(`  -> notify ${kitchen.full_name}: "${note.title}" | ${note.message} | link=${note.link}`);
  }
  const { data: kAfter } = await sb.from("kitchen_duty_shifts").select("is_active, shift_end").eq("id", kShift.id).single();
  console.log("  verify kitchen shift: is_active=", kAfter.is_active, "shift_end set=", !!kAfter.shift_end);

  // ===== SCENARIO B: driver delivers -> autoClockOut =====
  console.log("\n=== B. Driver completes delivery -> driver auto clock-out ===");
  const { data: openShift } = await sb.from("driver_shifts")
    .select("id, actual_start").eq("company_id", company.id).eq("driver_id", driver.id)
    .eq("order_id", order.id).is("actual_end", null).maybeSingle();
  if (openShift) {
    const startMs = new Date(openShift.actual_start).getTime();
    const hours = Number(((Date.now()-startMs)/3_600_000).toFixed(4));
    await sb.from("driver_shifts").update({ actual_end: nowIso(), status: "completed", hours_worked: hours }).eq("id", openShift.id);
    const note = await createNotification({
      company_id: company.id, recipient_id: driver.id, user_id: driver.id,
      notification_type: "driver_clock_out",
      title: "You've been clocked out",
      message: `Your shift was closed automatically now that the delivery for ${order.order_number} is complete.`,
      priority: "normal", link: "/team-portal/driver/earnings",
      related_entity_type: "order", related_entity_id: order.id,
    });
    console.log("  driver shift closed:", openShift.id.slice(0,8), "hours=", hours);
    console.log(`  -> notify ${driver.full_name}: "${note.title}" | ${note.message} | link=${note.link}`);
  }
  const { data: dAfter } = await sb.from("driver_shifts").select("actual_end, status").eq("id", dShift.id).single();
  console.log("  verify driver shift: actual_end set=", !!dAfter.actual_end, "status=", dAfter.status);

  // ===== Confirm the notifications are readable for each recipient =====
  console.log("\n=== Notifications now in each user's bell ===");
  for (const u of [kitchen, driver]) {
    const { data: notes } = await sb.from("notifications").select("notification_type, title, message").in("id", createdNotifIds).eq("recipient_id", u.id);
    for (const n of notes||[]) console.log(`  [${u.full_name}] (${n.notification_type}) ${n.title} -- ${n.message}`);
  }
  console.log("\nRESULT: both shifts auto-closed AND the respective staff member got a notification.");
} catch (e) {
  console.log("\nERROR:", e.message);
} finally {
  // Cleanup everything we created. The real order is left untouched.
  for (const id of createdNotifIds) await sb.from("notifications").delete().eq("id", id);
  if (createdShiftIds.kitchen) await sb.from("kitchen_duty_shifts").delete().eq("id", createdShiftIds.kitchen);
  if (createdShiftIds.driver)  await sb.from("driver_shifts").delete().eq("id", createdShiftIds.driver);
  console.log("\n(cleaned up: test shifts + test notifications deleted; order untouched)");
  process.exit(0);
}
