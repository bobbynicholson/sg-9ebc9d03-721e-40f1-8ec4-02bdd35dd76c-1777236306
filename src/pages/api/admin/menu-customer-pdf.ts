import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";
import type { CustomerMenuPdfData } from "@/services/pdf/CustomerMenuDocument";

const ALLOWED_ROLES = new Set([
  "super_admin", "company_admin", "owner", "admin", "sales_admin", "region_admin",
]);
const CUSTOMER_MENU_CATEGORIES = [
  { label: "Starters", aliases: ["starter", "starters", "appetizer", "appetizers"] },
  { label: "Mains", aliases: ["main", "mains"] },
  { label: "Sides", aliases: ["side", "sides"] },
  { label: "Salads", aliases: ["salad", "salads"] },
  { label: "Desserts", aliases: ["dessert", "desserts"] },
  { label: "Other", aliases: [] },
];
const EXCLUDED_CATEGORIES = new Set(["equipment", "service", "services"]);

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
    const groups: CustomerMenuPdfData["groups"] = CUSTOMER_MENU_CATEGORIES.map(({ label }) => ({
      category: label,
      items: [],
    }));
    const sourceItems = (menuResult.data || []).flatMap((item) => {
      const key = (item.category || "").trim().toLowerCase();
      if (item.is_available === false || EXCLUDED_CATEGORIES.has(key)) return [];
      const categoryIndex = CUSTOMER_MENU_CATEGORIES.findIndex(({ aliases }) => aliases.includes(key));
      const group = groups[categoryIndex < 0 ? groups.length - 1 : categoryIndex];
      return [{ item, group }];
    });
    if (!sourceItems.length) {
      return res.status(422).json({ error: "No available food items to include in the customer menu" });
    }

    const { pdfSafePhotoSource } = await import("@/services/pdf/quoteMenuPhotoData");
    const logo = pdfSafePhotoSource(company?.logo_url, 256);
    const photos = new Map<string, Promise<string | null>>();
    function getThumbnail(url: string | null) {
      if (!url) return null;
      let photo = photos.get(url);
      if (!photo) {
        photo = pdfSafePhotoSource(url, 192);
        photos.set(url, photo);
      }
      return photo;
    }

    for (let start = 0; start < sourceItems.length; start += 4) {
      const batch = sourceItems.slice(start, start + 4);
      const thumbnails = await Promise.all(batch.map(({ item }) => getThumbnail(item.image_url)));
      batch.forEach(({ item, group }, index) => {
        group.items.push({
          id: item.id,
          name: item.item_name?.trim() || "Menu item",
          image_url: thumbnails[index],
        });
      });
    }

    const data: CustomerMenuPdfData = {
      companyName: company?.company_name?.trim() || "",
      logoUrl: await logo,
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
