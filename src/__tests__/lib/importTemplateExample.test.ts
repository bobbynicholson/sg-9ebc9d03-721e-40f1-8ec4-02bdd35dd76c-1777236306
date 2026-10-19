import { parseWorkbook } from "@/lib/importParse";
import { normaliseFieldValue, normaliseQuoteStatus } from "@/lib/importNormalise";
import {
  getTemplateDefinition, templateCsv, recogniseHeaders, buildMappingFromTemplate, TEMPLATE_TYPES,
} from "@/lib/importTemplates";

// Reads a generated file back the way /api/imports/upload does (with the
// byte-order mark the route adds) and maps it the way preview does.
function importRows(csv: string) {
  const [sheet] = parseWorkbook(Buffer.from(`﻿${csv}`, "utf8"), "example.csv");
  const headers = Object.keys(sheet.rows[0].data);
  const def = recogniseHeaders(headers);
  const mapping = def ? buildMappingFromTemplate(def, sheet.name, headers)[sheet.name] : {};
  return {
    def,
    rows: sheet.rows.map((r) => {
      const mapped: Record<string, any> = {};
      const warnings: string[] = [];
      for (const [header, raw] of Object.entries(r.data)) {
        const target = mapping[header]?.target;
        if (!target || target === "skip") continue;
        const norm = target === "status" ? normaliseQuoteStatus(raw) : normaliseFieldValue(target, raw);
        warnings.push(...norm.warnings);
        if (norm.value !== null && norm.value !== undefined && norm.value !== "") mapped[target] = norm.value;
      }
      return { mapped, warnings };
    }),
  };
}

describe("quote example file", () => {
  const def = getTemplateDefinition("quotes");
  const csv = templateCsv(def, "example")!;

  it("has the template's exact headings and five rows", () => {
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(def.columns.map((c) => c.header).join(","));
    expect(lines).toHaveLength(6);
  });

  it("only uses real column keys", () => {
    const keys = new Set(def.columns.map((c) => c.key));
    for (const r of def.sampleRows!) {
      for (const k of Object.keys(r)) expect(keys.has(k)).toBe(true);
    }
  });

  it("imports cleanly: every column recognised, no warnings, required fields present", () => {
    const { def: recognised, rows } = importRows(csv);
    expect(recognised?.type).toBe("quotes");
    expect(rows).toHaveLength(5);
    for (const { mapped, warnings } of rows) {
      expect(warnings).toEqual([]);
      expect(mapped.total_amount).toEqual(expect.any(Number));
      expect(mapped.client_name || mapped.client_email).toBeTruthy();
    }
  });

  it("shows both quote-number cases: your own numbers kept, one row left blank", () => {
    const numbers = importRows(csv).rows.map((r) => r.mapped.quote_number ?? null);
    expect(numbers).toEqual(["Q-2027-001", "Q-2027-002", "Q-2027-003", "Q-2027-004", null]);
  });

  it("uses distinct quote numbers so the file doesn't trip the duplicate check", () => {
    const numbers = def.sampleRows!.map((r) => r.quote_number).filter(Boolean);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("shows the status cases: declined maps to rejected, blank stays blank", () => {
    const statuses = importRows(csv).rows.map((r) => r.mapped.status ?? null);
    expect(statuses).toEqual(["sent", "accepted", "rejected", "draft", null]);
  });

  it("has totals that add up where the breakdown is given", () => {
    for (const r of def.sampleRows!) {
      if (!r.subtotal) continue;
      const sum = Number(r.subtotal) + Number(r.tax_amount || 0) + Number(r.delivery_fee || 0);
      expect(sum).toBe(Number(r.total_amount));
    }
  });
});

describe("quote number column", () => {
  const col = getTemplateDefinition("quotes").columns.find((c) => c.key === "quote_number")!;

  it("is optional and says what happens when it is blank", () => {
    expect(col.required).toBe(false);
    expect(col.header).toBe("Quote number");
    expect(col.hint).toContain("next quote number");
  });

  it("still recognises files made with the old 'Quote number *' heading", () => {
    const headers = ["Quote number *", "Client name *", "Total (R) *"];
    const recognised = recogniseHeaders(headers);
    expect(recognised?.type).toBe("quotes");
    expect(buildMappingFromTemplate(recognised!, "Quotes", headers).Quotes["Quote number *"].target).toBe("quote_number");
  });
});

describe("templateCsv", () => {
  it("keeps the plain template as header plus one example row for every type", () => {
    for (const type of TEMPLATE_TYPES) {
      const def = getTemplateDefinition(type);
      const lines = templateCsv(def, "template")!.trim().split("\r\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe(def.columns.map((c) => c.header).map((h) => (/[",]/.test(h) ? `"${h}"` : h)).join(","));
    }
  });

  it("returns no example file for types without sample rows", () => {
    expect(templateCsv(getTemplateDefinition("clients"), "example")).toBeNull();
  });

  it("quotes cells with commas", () => {
    expect(templateCsv(getTemplateDefinition("quotes"), "example")).toContain('"12 Long Street, Cape Town"');
  });
});
