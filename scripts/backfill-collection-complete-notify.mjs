import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const OID = "5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";

const { data: o } = await sb.from("orders")
  .select("company_id, order_number, client_id, client_email, client_name, venue_name, venue_address, event_name")
  .eq("id", OID).maybeSingle();
console.log("ORDER:", o?.order_number, "company:", o?.company_id);

// Collection assignment status
const { data: da } = await sb.from("driver_assignments")
  .select("assignment_type, status, en_route_at, picked_up_at, completed_at")
  .eq("order_id", OID).eq("assignment_type", "collection");
console.log("COLLECTION assignment(s):", da);

// Resolve client's auth user id
let clientUid = null;
if (o?.client_id) {
  const { data: cl } = await sb.from("clients").select("user_id").eq("id", o.client_id).maybeSingle();
  clientUid = cl?.user_id || null;
}
console.log("client auth user id:", clientUid);

// Existing collection_complete notifications for this order?
const { data: existing } = await sb.from("notifications")
  .select("id, notification_type, created_at")
  .eq("related_entity_id", OID)
  .eq("notification_type", "collection_complete");
console.log("existing collection_complete notifications:", existing);

const SEND = process.argv.includes("--send");
if (!SEND) {
  console.log("\n(dry run) pass --send to actually insert the notification");
  process.exit(0);
}
if (!clientUid) { console.log("No client auth user id - cannot notify."); process.exit(1); }
if (existing && existing.length > 0) { console.log("Already has a collection_complete notification - skipping to avoid dupes."); process.exit(0); }

const venue = o.venue_name || (o.venue_address ? String(o.venue_address).split(",")[0] : "the venue");
const eventName = o.event_name && o.event_name !== "Untitled" ? o.event_name : "your event";
const row = {
  company_id: o.company_id, recipient_id: clientUid, user_id: clientUid,
  notification_type: "collection_complete",
  title: "Equipment collected, all done",
  message: `Our team has collected the catering equipment from ${venue}. That's ${eventName} fully wrapped up on our side. We'd love to hear how it went!`,
  priority: "normal",
  link: `/client-portal/tracking?orderId=${OID}`,
  related_entity_type: "order", related_entity_id: OID,
};
const { data, error } = await sb.from("notifications").insert([row]).select("id, created_at, is_read");
if (error) { console.log("INSERT FAILED:", error.message); process.exit(1); }
console.log("SENT collection_complete to client. id=", data[0].id);
