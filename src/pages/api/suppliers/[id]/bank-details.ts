/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { decryptSecret, encryptSecret, hasStrongEncryptionKey } from "@/lib/credentialVault";
import { withApiRequestLogging } from "@/lib/withApiLogging";

const SUPPLIER_ROLES = new Set([
  "super_admin", "owner", "company_admin", "region_admin", "admin", "shopping_staff",
]);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDroppedLegacyColumn(error: any): boolean {
  const message = String(error?.message || "").toLowerCase();
  return ["42703", "PGRST204"].includes(String(error?.code || "")) && message.includes("account_number");
}

async function readLegacySupplierAccount(admin: any, supplierId: string): Promise<any | null> {
  const { data, error } = await admin.from("suppliers").select("account_number, updated_at")
    .eq("id", supplierId).maybeSingle();
  if (error && isDroppedLegacyColumn(error)) return null;
  if (error) throw error;
  return data;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Vary", "Cookie, Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const supplierId = typeof req.query.id === "string" ? req.query.id : "";
  if (!isUuid(supplierId)) return res.status(400).json({ error: "Invalid supplier" });

  if (req.method === "PUT") {
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (!origin || !host) return res.status(403).json({ error: "Same-origin request required" });
    try {
      if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
        return res.status(403).json({ error: "Same-origin request required" });
      }
    } catch {
      return res.status(403).json({ error: "Same-origin request required" });
    }
  }

  const session = createPagesServerClient({ req, res });
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: "Sign in to manage supplier bank details" });
  const { data: profile, error: profileError } = await session.from("profiles")
    .select("company_id, role, active_role, is_active, deleted_at")
    .eq("id", user.id).maybeSingle();
  if (profileError || !profile || profile.is_active === false || profile.deleted_at) {
    return res.status(403).json({ error: "Supplier bank details access denied" });
  }
  const role = String(profile.active_role || profile.role || "");
  if (!SUPPLIER_ROLES.has(role)) return res.status(403).json({ error: "Supplier bank details access denied" });

  const admin: any = getServiceSupabase();
  const { data: supplier, error: supplierError } = await admin.from("suppliers")
    .select("id, company_id").eq("id", supplierId).is("deleted_at", null).maybeSingle();
  if (supplierError || !supplier) return res.status(404).json({ error: "Supplier not found" });
  if (role !== "super_admin" && profile.company_id !== supplier.company_id) {
    return res.status(404).json({ error: "Supplier not found" });
  }

  if (req.method === "GET") {
    const { data: bank, error } = await admin.from("supplier_bank_details")
      .select("account_number, account_number_ciphertext, updated_at")
      .eq("supplier_id", supplierId).eq("company_id", supplier.company_id).maybeSingle();
    if (error) return res.status(503).json({ error: "Could not load supplier bank details" });
    let legacySupplier: any = null;
    try {
      legacySupplier = await readLegacySupplierAccount(admin, supplierId);
    } catch {
      return res.status(503).json({ error: "Could not load supplier bank details" });
    }
    const legacyValue = typeof legacySupplier?.account_number === "string" ? legacySupplier.account_number : "";
    if (!bank) return res.status(200).json({ accountNumber: legacyValue });
    const bankValue = bank.account_number_ciphertext
      ? await decryptSecret(bank.account_number_ciphertext)
      : typeof bank.account_number === "string" ? bank.account_number : "";
    const sourceAt = Date.parse(String(legacySupplier?.updated_at || "")) || 0;
    const bankAt = Date.parse(String(bank.updated_at || "")) || 0;
    if (legacyValue && legacyValue !== bankValue && sourceAt > bankAt) {
      return res.status(200).json({ accountNumber: legacyValue });
    }
    return res.status(200).json({ accountNumber: bankValue });
  }

  if (!hasStrongEncryptionKey()) {
    return res.status(503).json({ error: "Set a strong ENCRYPTION_KEY before saving supplier bank details" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (!Object.prototype.hasOwnProperty.call(body, "accountNumber") ||
      (typeof body.accountNumber !== "string" && body.accountNumber !== null)) {
    return res.status(400).json({ error: "Account number must be text" });
  }
  const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
  if (accountNumber.length > 128 || /[\x00-\x1f\x7f]/.test(accountNumber)) {
    return res.status(400).json({ error: "Account number is invalid" });
  }
  const { error } = await admin.from("supplier_bank_details").upsert({
    supplier_id: supplierId,
    company_id: supplier.company_id,
    account_number: null,
    account_number_ciphertext: accountNumber ? await encryptSecret(accountNumber) : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "supplier_id" });
  if (error) return res.status(503).json({ error: "Could not save supplier bank details" });
  return res.status(200).json({ saved: true });
}

export default withApiRequestLogging(handler);
