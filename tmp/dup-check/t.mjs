import { sb, COMPANY } from "../email-e2e/lib.mjs";
const { data } = await sb.from("profiles").select("email, role").eq("company_id", COMPANY);
console.log(JSON.stringify(data));
const { data: c } = await sb.from("companies").select("email").eq("id", COMPANY).single();
const { data: s } = await sb.from("email_provider_settings").select("*").eq("company_id", COMPANY).neq("provider","mailchimp").single();
console.log("company email:", c.email, "| archive_copy_email:", s.archive_copy_email);
