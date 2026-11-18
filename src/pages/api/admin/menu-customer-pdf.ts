import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";
import { NON_FOOD_CATEGORIES } from "@/services/menuService";
import type { CustomerMenuPdfData } from "@/services/pdf/CustomerMenuDocument";

const ALLOWED_ROLES = new Set([
  "super_admin", "company_admin", "owner", "admin", "sales_admin", "region_admin",
]);
const CUSTOMER_MENU_CATEGORY_ORDER = ["Starters", "Mains", "Sides", "Salads", "Desserts", "Other"];

function normaliseCategory(raw: unknown): string {
  const value = typeof raw === "string" && raw.trim() ? raw.trim() : "Other";
  const key = value.toLowerCase();
  const aliases: Record<string, string> = {
    starter: "Starters", starters: "Starters", appetizer: "Starters", appetizers: "Starters",
    main: "Mains", mains: "Mains", side: "Sides", sides: "Sides",
    salad: "Salads", salads: "Salads", dessert: "Desserts", desserts: "Desserts",
    drink: "Other", drinks: "Other", beverage: "Other", beverages: "Other",
    kid: "Other", kids: "Other", equipment: "Equipment", service: "Service", other: "Other",
  };
  const category = aliases[key] || value;
  return CUSTOMER_MENU_CATEGORY_ORDER.includes(category) ? category : "Other";
}

function categoryRank(category: string): number {
  const index = CUSTOMER_MENU_CATEGORY_ORDER.indexOf(category);
  return index < 0 ? CUSTOMER_MENU_CATEGORY_ORDER.length : index;
}

async function safeMenuImageData(raw: unknown): Promise<string | null> {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim();
  const maxBytes = 3 * 1024 * 1024;
  if (/^data:image\/(?:png|jpe?g);base64,/i.test(value)) {
    return value.length <= maxBytes * 1.5 ? value : null;
  }

  // The catalogue stores public Supabase URLs. Keep server-side image
  // fetching restricted to that host, and embed only React-PDF-supported
  // formats. WebP/unsupported images use the clean branded fallback.
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").origin;
    const url = new URL(value);
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok || !response.body) return null;
      const contentType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
      if (!["image/png", "image/jpeg", "image/jpg"].includes(contentType)) return null;
      const declaredLength = Number(response.headers.get("content-length") || 0);
      if (declaredLength > maxBytes) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > maxBytes) return null;
      const normalizedType = contentType === "image/jpg" ? "image/jpeg" : contentType;
      return `data:${normalizedType};base64,${bytes.toString("base64")}`;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile, error: profileError } = await ssr
      .from("profiles")
      .select("company_id, role, active_role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    const role = String(profile?.active_role || profile?.role || "").toLowerCase();
    if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Admin access required" });
    if (!profile?.company_id) return res.status(400).json({ error: "No company is linked to this account" });

    const [companyResult, menuResult] = await Promise.all([
      ssr.from("companies")
        .select("company_name, slug, logo_url, primary_color")
        .eq("id", profile.company_id)
        .maybeSingle(),
      ssr.from("menu_items")
        .select("id, item_name, category, image_url, is_available, deleted_at")
        .eq("company_id", profile.company_id)
        .is("deleted_at", null)
        .order("item_name", { ascending: true }),
    ]);
    if (companyResult.error) throw companyResult.error;
    if (menuResult.error) throw menuResult.error;

    const company = companyResult.data;
    const sourceItems = (menuResult.data || []).filter((item) => {
      const category = normaliseCategory(item.category);
      return item.is_available !== false && !NON_FOOD_CATEGORIES.has(category)
        && !["equipment", "service"].includes(String(item.category || "").trim().toLowerCase());
    });
    if (!sourceItems.length) {
      return res.status(422).json({ error: "No available food items to include in the customer menu" });
    }

    // Embed only trusted, same-company Supabase images. Missing catalogue photos
    // become a tidy accent marker in the PDF instead of an empty grey tile.
    const resolved: Array<{ id: string; name: string; category: string; image_url: string | null }> = [];
    for (let start = 0; start < sourceItems.length; start += 4) {
      const batch = sourceItems.slice(start, start + 4);
      const prepared = await Promise.all(batch.map(async (item) => ({
        id: String(item.id),
        name: String(item.item_name || "Menu item"),
        category: normaliseCategory(item.category),
        image_url: await safeMenuImageData(item.image_url),
      })));
      resolved.push(...prepared);
    }

    const logoUrl = await safeMenuImageData(company?.logo_url);
    const grouped = new Map<string, CustomerMenuPdfData["groups"][number]["items"]>();
    for (const item of resolved) {
      const items = grouped.get(item.category) || [];
      items.push({ id: item.id, name: item.name, image_url: item.image_url });
      grouped.set(item.category, items);
    }

    const groups: CustomerMenuPdfData["groups"] = [...grouped.entries()]
      .sort(([left], [right]) => categoryRank(left) - categoryRank(right) || left.localeCompare(right))
      .map(([category, items]) => ({
        category,
        items: items.sort((left, right) => left.name.localeCompare(right.name)),
      }));

    const data: CustomerMenuPdfData = {
      companyName: String(company?.company_name || "Our Menu"),
      logoUrl,
      accentColor: company?.primary_color || null,
      groups,
    };
    const { renderCustomerMenuPdf, sanitiseFilename } = await import("@/services/pdf");
    const pdf = await renderCustomerMenuPdf(data);
    const filename = `${sanitiseFilename(company?.slug || company?.company_name || "customer-menu")}-menu.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(pdf.length));
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(pdf);
  } catch (error: unknown) {
    console.error("[admin/menu-customer-pdf] failed:", error);
    const message = error instanceof Error ? error.message : "Could not create the menu PDF";
    return res.status(500).json({ error: message });
  }
}

export default withApiLogging(handler);
