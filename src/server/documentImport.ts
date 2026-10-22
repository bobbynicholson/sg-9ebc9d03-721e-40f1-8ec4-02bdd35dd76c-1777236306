import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { DOCUMENT_IMPORT_ROLES, type CatalogueChoice } from "@/lib/documentImport";

export async function documentImportAccess(req: NextApiRequest, res: NextApiResponse, readOnly = false) {
  const session = createPagesServerClient({ req, res });
  const { data: { user } } = await session.auth.getUser();
  if (!user) { res.status(401).json({ error: "Sign in to import documents." }); return null; }
  const { data: profile, error } = await session.from("profiles").select("company_id, role, active_role").eq("id", user.id).single();
  const canManage = !!profile && DOCUMENT_IMPORT_ROLES.includes(profile.active_role || profile.role);
  if (error || !profile?.company_id || (!canManage && (!readOnly || !["region_admin", "branch_admin", "sales_admin", "kitchen_manager", "kitchen_staff", "shopping_manager", "shopping_staff", "shopping", "driver", "waiter", "cleaning_manager", "cleaning_staff"].includes(String(profile.active_role || profile.role))))) {
    res.status(403).json({ error: "Only company owners and administrators can import documents." }); return null;
  }
  return { db: getServiceSupabase() as any, companyId: profile.company_id, userId: user.id, canManage };
}

export async function documentImportCatalogue(db: any, companyId: string): Promise<CatalogueChoice[]> {
  // Page through the catalogue: a truncated first 1,000 would cause duplicate items.
  const read = async (table: string, columns: string) => {
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select(columns).eq("company_id", companyId).is("deleted_at", null).order("id").range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) return rows;
      if (rows.length >= 20_000) throw new Error("Catalogue is too large for automatic matching. Contact support.");
    }
  };
  const [menu, equipment] = await Promise.all([
    read("menu_items", "id, item_name, category, base_price, recipes(id)"),
    read("equipment", "id, name, category, rental_price"),
  ]);
  return [
    ...menu.map((v) => ({ id: v.id, name: v.item_name, category: v.category, price: v.base_price, kind: "menu" as const, has_recipe: (v.recipes || []).length > 0 })),
    ...equipment.map((v) => ({ id: v.id, name: v.name || "Unnamed equipment", category: v.category, price: v.rental_price, kind: "equipment" as const })),
  ];
}

export function documentImportError(error: unknown): string {
  const code = (error as any)?.code;
  if (code === "42P01" || code === "PGRST202" || code === "PGRST205") return "PDF importing is waiting for the database update. Your existing records have not changed.";
  if (code === "23505") return "This PDF or document reference is already imported. Open the existing record instead.";
  if (code === "40001") return "This document changed. Refresh before saving.";
  if (code === "23514" && String((error as any)?.message).startsWith("Complete")) return String((error as any).message).slice(0, 600);
  // Avoid returning provider response bodies, stack traces or credentials.
  return error instanceof Error ? error.message.slice(0, 600) : "Could not process this document. Please try again.";
}
