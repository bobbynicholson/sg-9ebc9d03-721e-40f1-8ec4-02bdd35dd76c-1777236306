import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const RESEND = env.RESEND_API_KEY;
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";

// ---- TASK 1: clean the stale backlog (cancel all queued) ----
const { data: q } = await sb.from("outgoing_email_queue").select("id").eq("status","queued");
const ids = (q||[]).map(r=>r.id);
if (ids.length) {
  const { error } = await sb.from("outgoing_email_queue").update({ status:"cancelled", error_message:"Cancelled - stale test backlog (operator request)" }).in("id", ids);
  console.log(error ? "backlog cancel ERR: "+error.message : `Backlog cleaned: ${ids.length} queued emails cancelled.`);
} else console.log("No queued backlog to clean.");

// ---- gather order/company/invoice ----
const { data: o } = await sb.from("orders").select("order_number, company_id, client_email, client_name, event_date").eq("id",OID).maybeSingle();
const { data: c } = await sb.from("companies").select("company_name, slug").eq("id",o.company_id).maybeSingle();
const { data: inv } = await sb.from("invoices").select("id, invoice_number, public_token, total_amount").eq("order_id",OID).limit(1).maybeSingle();
const to = o.client_email; const name = (o.client_name||"there").split(" ")[0];
const company = c.company_name; const base="https://cateringms.com";
const payLink = inv.public_token ? `${base}/pay/i/${inv.public_token}` : `${base}/${c.slug}/client-portal/billing`;
const fmt = n => "R "+Number(n||0).toLocaleString("en-ZA",{minimumFractionDigits:2});
console.log("\nSending to:", to, "| order", o.order_number, "| invoice", inv.invoice_number);

async function send(subject, html, templateType, stampInvoice=false) {
  const r = await fetch("https://api.resend.com/emails", {
    method:"POST", headers:{ "Authorization":`Bearer ${RESEND}`, "Content-Type":"application/json" },
    body: JSON.stringify({ from:`${company} <noreply@send.cateringms.com>`, to:[to], subject, html }),
  });
  const j = await r.json();
  const ok = r.ok && j.id;
  console.log(`  ${ok?"SENT":"FAIL"} ${templateType}${ok?" id="+j.id:" -> "+JSON.stringify(j)}`);
  // log to email_automation_log so the timeline reads it
  await sb.from("email_automation_log").insert([{ company_id:o.company_id, order_id:OID, template_type:templateType, status: ok?"sent":"failed", recipient_email:to, sent_at: ok?new Date().toISOString():null }]);
  if (ok && stampInvoice) await sb.from("invoices").update({ sent_at:new Date().toISOString() }).eq("id", inv.id);
}

await send(`Booking confirmed - ${o.order_number}`,
  `<p>Hi ${name},</p><p>Your booking <b>${o.order_number}</b> for ${o.event_date} is confirmed. Thank you for choosing ${company}!</p>`,
  "order_confirmation");
await send(`Invoice ${inv.invoice_number} - ${company}`,
  `<p>Hi ${name},</p><p>Here is your invoice <b>${inv.invoice_number}</b> for <b>${fmt(inv.total_amount)}</b> (paid in full - thank you).</p><p>View it any time: <a href="${payLink}">${payLink}</a></p>`,
  "balance_invoice_issued", true);
await send(`Thank you from ${company}!`,
  `<p>Hi ${name},</p><p>Thank you for your event with ${company}. We'd love your feedback - just reply to this email or leave us a review.</p>`,
  "review_request");
console.log("\nDone.");
