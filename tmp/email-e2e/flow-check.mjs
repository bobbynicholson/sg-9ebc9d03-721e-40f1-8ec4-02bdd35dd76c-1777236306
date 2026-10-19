import { sb, COMPANY } from "./lib.mjs";
const { data } = await sb.from("email_automation_log").select("created_at,template_type,recipient_email,subject").eq("user_id", COMPANY).gte("created_at","2026-10-15T18:33:00Z").order("created_at");
console.log(JSON.stringify(data, null, 1));
const { data: q } = await sb.from("quotes").select("deposit_percentage, deposit_amount, first_payment_amount, total_amount, payment_terms").eq("id","620cfd68-b049-4e60-95d4-91251fdf2664").maybeSingle();
console.log("source quote:", JSON.stringify(q));
const { data: inv } = await sb.from("invoices").select("invoice_data").eq("invoice_number","INV-000016").eq("company_id",COMPANY).maybeSingle();
const d = inv?.invoice_data || {}; console.log("invoice_data keys:", Object.keys(d).join(","), "| deposit-ish:", JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => /deposit|first|amount|due|request/i.test(k)))));
