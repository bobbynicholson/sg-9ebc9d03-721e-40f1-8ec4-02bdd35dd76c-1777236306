/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/imports/templates/onboarding-workbook
 *
 * Single-file download containing every template tab the onboarding
 * importer understands: Clients, Orders, Quotes, Invoices, Payments,
 * Leads. The operator fills in whichever tabs they have data for and
 * uploads the whole .xlsx in one go -- the upload route's per-sheet
 * auto-mapping picks each tab up independently, the cross-sheet
 * linker resolves foreign keys (orders -> clients, invoices ->
 * orders, payments -> invoices) at commit time.
 *
 * This is the "Day 2" deliverable from the onboarding plan: turn
 * five separate template downloads + uploads into one round trip.
 *
 * Auth: any signed-in admin / owner / company_admin / super_admin.
 * No tenant data leaks possible -- the file is purely the schema.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import * as XLSX from "xlsx";
import { createPagesServerClient } from "@/lib/supabase/server";
import { TEMPLATE_TYPES, getTemplateDefinition } from "@/lib/importTemplates";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

// Tab order matches the dependency graph the importer commits in:
// clients first (orders + quotes + invoices link to them), then
// orders (invoices + payments may link to them), then quotes,
// then invoices, then payments. Leads last -- independent of the
// rest, included because it's part of the unified onboarding.
const SHEET_ORDER = ["clients", "orders", "quotes", "invoices", "payments", "leads"] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role")
      .eq("id", user.id)
      .single();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(403).json({ error: "Owner or admin only" });
    }

    const X = XLSX as any;
    const wb = X.utils.book_new();

    // First tab: a "Read me" sheet. Catering owners aren't going to
    // read the docs -- this lives in the workbook itself so the
    // instructions sit next to where they're filling data in.
    const intro: any[][] = [
      ["CateringMS onboarding workbook"],
      [""],
      ["Fill in whichever tabs you have data for. Skip the rest -- empty tabs land empty."],
      [""],
      ["Tabs in this file:"],
      ["1. Clients     -- everyone you've worked with. Names, contacts, billing."],
      ["2. Orders      -- past or upcoming events. Required for FY revenue numbers."],
      ["3. Quotes      -- proposals you've sent. Tracks the FU1/FU2/FU3 follow-up."],
      ["4. Invoices    -- bills issued. Links to Orders by 'Order number' column."],
      ["5. Payments    -- money received. Links to Invoices by 'Invoice number'."],
      ["6. Leads       -- prospects who enquired but haven't booked yet."],
      [""],
      ["Tips that save time:"],
      ["- Required columns are marked with a * in the header."],
      ["- The importer auto-creates missing clients from order rows when needed."],
      ["- Invoice and order numbers are preserved verbatim -- no renaming."],
      ["- Past dates land as completed orders / paid invoices automatically."],
      ["- You can re-upload the same file after cleaning -- existing rows update,"],
      ["  empty cells leave manual edits in the portal alone."],
      [""],
      ["When you're done, save this file and upload it from /admin/onboarding."],
    ];
    const introWs = X.utils.aoa_to_sheet(intro);
    introWs["!cols"] = [{ wch: 100 }];
    X.utils.book_append_sheet(wb, introWs, "Read me first");

    // Then every template tab. Mirrors what /api/imports/templates/[type]
    // produces for individual templates: row 1 headers, row 2 example,
    // header comments with hint + aliases on hover.
    for (const type of SHEET_ORDER) {
      if (!TEMPLATE_TYPES.includes(type as any)) continue;
      const def = getTemplateDefinition(type as any);
      const aoa: any[][] = [
        def.columns.map((c) => c.header),
        def.columns.map((c) => c.example),
      ];
      const ws = X.utils.aoa_to_sheet(aoa);

      ws["!cols"] = def.columns.map((c) => ({
        wch: Math.max(14, Math.min(40, c.header.length + 4)),
      }));

      def.columns.forEach((c, idx) => {
        const addr = X.utils.encode_cell({ r: 0, c: idx });
        const cell = ws[addr];
        if (!cell) return;
        const lines: string[] = [];
        if (c.required) lines.push("Required field.");
        if (c.hint) lines.push(c.hint);
        if (c.aliases && c.aliases.length > 0) {
          lines.push(`Also recognised as: ${c.aliases.slice(0, 4).join(", ")}.`);
        }
        if (lines.length > 0) {
          cell.c = [{ a: "CateringMS", t: lines.join("\n") }];
          cell.c.hidden = true;
        }
      });

      X.utils.book_append_sheet(wb, ws, def.sheetName);
    }

    const buf: Buffer = X.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = "cateringms-onboarding-workbook.xlsx";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).send(buf);
  } catch (e: any) {
    console.error("/api/imports/templates/onboarding-workbook crashed:", e);
    return res.status(500).json({ error: e?.message || "Workbook generation failed" });
  }
}
