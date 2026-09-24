/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/imports/templates/[type]
 *
 * Generates an .xlsx, .csv, or .txt guide download from the schema definition in
 * src/lib/importTemplates.ts. Operators click "Download template"
 * on the Contacts / Leads pages or in the onboarding wizard, fill
 * in their data, and upload it back through /api/imports/upload.
 *
 * Always built fresh from the schema - never served from a static
 * file - so the template can never drift out of sync with the
 * columns the import engine actually understands.
 *
 * Auth: any signed-in admin / owner / company_admin / super_admin.
 * No tenant data leaks possible because the file is purely the
 * schema - no rows, no IDs.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import * as XLSX from "xlsx";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { createPagesServerClient } from "@/lib/supabase/server";
import {
  TEMPLATE_TYPES,
  getTemplateDefinition,
  type TemplateType,
} from "@/lib/importTemplates";
import { withApiLogging } from "@/lib/withApiLogging";


const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
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

    const type = String(req.query.type || "").toLowerCase() as TemplateType;
    if (!TEMPLATE_TYPES.includes(type)) {
      return res.status(404).json({
        error: `Unknown template type '${type}'. Valid: ${TEMPLATE_TYPES.join(", ")}`,
      });
    }

    const def = getTemplateDefinition(type);
    const format = String(req.query.format || "xlsx").toLowerCase();

    if (format === "csv" || format === "txt") {
      const csvEscape = (value: string) => {
        const text = String(value ?? "");
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };

      if (format === "csv") {
        const csv = [
          def.columns.map((c) => c.header).map(csvEscape).join(","),
          def.columns.map((c) => c.example).map(csvEscape).join(","),
          "",
        ].join("\r\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="cateringms-${def.type}-import-template.csv"`,
        );
        res.setHeader("Cache-Control", "private, max-age=300");
        return res.status(200).send(`\uFEFF${csv}`);
      }

      const guide = [
        `CateringMS ${def.sheetName} import guide`,
        "",
        "Use the exact header row from the CSV or Excel template. Replace the example row with your data and delete this guide file before uploading.",
        "Required columns are marked [REQUIRED]. All other columns are optional.",
        "Dates should use YYYY-MM-DD where possible. Do not include internal database IDs.",
        "",
        "COLUMN DETAILS",
        ...def.columns.map((c, index) => [
          `${index + 1}. ${c.key}`,
          `Header: ${c.header}`,
          `Required: ${c.required ? "yes" : "no"}`,
          `Example: ${c.example}`,
          c.hint ? `How to use: ${c.hint}` : "How to use: Enter this value if you have it; otherwise leave it blank.",
          c.aliases?.length ? `Also recognised: ${c.aliases.join(", ")}` : "",
        ].filter(Boolean).join("\n")),
        "",
        "The importer previews every row before saving. Existing clients matched by email are shown as duplicates so you can skip or update them.",
      ].join("\n\n");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="cateringms-${def.type}-import-column-guide.txt"`,
      );
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.status(200).send(`\uFEFF${guide}`);
    }

    // Build a 2D array of cells:
    //   row 1 - column headers (with " *" suffix on required columns)
    //   row 2 - italic example data, signalling "delete me + replace"
    //   row 3+ - left blank for the operator
    const aoa: any[][] = [
      def.columns.map((c) => c.header),
      def.columns.map((c) => c.example),
    ];

    const X = XLSX as any;
    const ws = X.utils.aoa_to_sheet(aoa);

    // Column widths - slightly wider than the header so things don't
    // clip in Excel's default view. Calibri 11 ~= 7px per character.
    ws["!cols"] = def.columns.map((c) => ({
      wch: Math.max(14, Math.min(40, c.header.length + 4)),
    }));

    // Cell comments on each header so a hover in Excel explains the
    // column intent. SheetJS stores these in cell.c[].
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

    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, def.sheetName);

    const buf: Buffer = X.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `cateringms-${def.type}-import-template.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).send(buf);
  } catch (e: any) {
    console.error("/api/imports/templates/[type] crashed:", e);
    return res.status(500).json({ error: dbErrorMessage(e) || "Template generation failed" });
  }
}

export default withApiLogging(handler);
