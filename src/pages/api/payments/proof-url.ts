/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";

const ADMIN = new Set(["owner", "company_admin", "admin", "super_admin", "sales_admin", "region_admin"]);
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Sign in first" });
  const { data: profile } = await ssr.from("profiles").select("role, active_role, company_id").eq("id", user.id).maybeSingle();
  const role = (profile as any)?.active_role || (profile as any)?.role;
  if (!ADMIN.has(role)) return res.status(403).json({ error: "Admin only" });
  const sb = getServiceSupabase();
  const { data: payment } = await sb.from("payments").select("company_id, payment_proof_path").eq("id", String(req.query.payment_id || "")).maybeSingle();
  if (!payment?.payment_proof_path) return res.status(404).json({ error: "No proof uploaded" });
  if (role !== "super_admin" && payment.company_id !== (profile as any)?.company_id) return res.status(403).json({ error: "Wrong company" });
  const { data, error } = await sb.storage.from("payment-proofs").createSignedUrl(payment.payment_proof_path, 600);
  if (error || !data?.signedUrl) return res.status(404).json({ error: "Proof unavailable" });
  return res.status(200).json({ url: data.signedUrl });
}
export default withApiLogging(handler);
