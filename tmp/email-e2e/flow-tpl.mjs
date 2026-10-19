import { sb } from "./lib.mjs";
const { data } = await sb.from("email_templates").select("company_id,template_type,is_active,updated_at,body").in("template_type",["deposit_invoice_issued","deposit_payment_received","balance_payment_received"]).order("updated_at",{ascending:false});
for (const t of data||[]) console.log(t.company_id ? "company "+t.company_id.slice(0,8) : "GLOBAL", t.template_type, "active="+t.is_active, "updated", t.updated_at, "\n   ", String(t.body).replace(/\n/g," / ").slice(0,260));
