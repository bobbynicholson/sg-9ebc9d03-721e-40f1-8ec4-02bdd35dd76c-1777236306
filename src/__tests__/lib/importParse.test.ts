import * as XLSX from "xlsx";
import { parseWorkbook } from "@/lib/importParse";
import { normaliseFieldValue } from "@/lib/importNormalise";

const xlsxBuffer = (aoa: any[][], build?: (ws: XLSX.WorkSheet) => void): Buffer => {
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  build?.(ws);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clients");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
};
const csvBuffer = (text: string) => Buffer.from(text, "utf8");
const only = (buf: Buffer, name = "x.xlsx") => parseWorkbook(buf, name)[0];

describe("parseWorkbook - real-world file shapes", () => {
  it("reads a plain sheet with the header on row 1", () => {
    const s = only(xlsxBuffer([["Name", "Email"], ["Thabo", "thabo@example.com"]]));
    expect(s.rows).toEqual([{ rowIndex: 2, data: { Name: "Thabo", Email: "thabo@example.com" } }]);
  });

  it("phone typed as a number in Excel keeps a usable value", () => {
    const s = only(xlsxBuffer([["Name", "Cell"], ["Thabo", 821234567]]));
    const norm = normaliseFieldValue("mobile_number", s.rows[0].data.Cell);
    expect(norm.value).toBe("+27821234567");
  });

  it("international phone with + survives the formula guard", () => {
    const s = only(csvBuffer("Name,Cell\r\nThabo,+27 82 123 4567\r\n"), "x.csv");
    expect(normaliseFieldValue("mobile_number", s.rows[0].data.Cell).value).toBe("+27821234567");
  });

  it("real Excel date cells come through as an unambiguous date", () => {
    const s = only(xlsxBuffer([["Name", "Last event"], ["Thabo", new Date(Date.UTC(2025, 2, 4))]]));
    expect(normaliseFieldValue("historical_last_event_date", s.rows[0].data["Last event"]).value).toBe("2025-03-04");
  });

  it("finds the header row under a title row", () => {
    const s = only(xlsxBuffer([
      ["Client list export - March 2025"],
      [],
      ["Name", "Email", "Cell"],
      ["Thabo", "thabo@example.com", "0821234567"],
    ]));
    expect(Object.keys(s.rows[0].data)).toEqual(["Name", "Email", "Cell"]);
    expect(s.rows[0].rowIndex).toBe(4);
  });

  it("keeps both columns when two headers share a name", () => {
    const s = only(xlsxBuffer([["Name", "Phone", "Phone"], ["Thabo", "0821234567", "0115550000"]]));
    const values = Object.values(s.rows[0].data);
    expect(values).toContain("0821234567");
    expect(values).toContain("0115550000");
  });

  it("keeps a column that has values but no header", () => {
    const s = only(xlsxBuffer([["Name", "", "Email"], ["Thabo", "VIP", "thabo@example.com"]]));
    expect(Object.values(s.rows[0].data)).toContain("VIP");
  });

  it("handles a UTF-8 BOM, accents and quoted commas / line breaks", () => {
    const s = only(csvBuffer("﻿Naam,Notes\r\nRenée Müller,\"Allergic to nuts, shellfish\nVIP\"\r\n"), "x.csv");
    expect(Object.keys(s.rows[0].data)).toEqual(["Naam", "Notes"]);
    expect(s.rows[0].data.Naam).toBe("Renée Müller");
    expect(s.rows[0].data.Notes).toBe("Allergic to nuts, shellfish\nVIP");
  });

  it("neutralises formula injection", () => {
    const s = only(csvBuffer("Name,Notes\r\nThabo,=HYPERLINK(\"http://evil\")\r\n"), "x.csv");
    expect(String(s.rows[0].data.Notes).startsWith("'=")).toBe(true);
  });

  it("returns no rows for a header-only file and nothing for an empty one", () => {
    expect(only(xlsxBuffer([["Name", "Email"]])).rows).toEqual([]);
    expect(parseWorkbook(csvBuffer(""), "x.csv")).toEqual([]);
  });

  it("skips blank rows in the middle and keeps file line numbers", () => {
    const s = only(xlsxBuffer([["Name"], ["A"], [], ["B"]]));
    expect(s.rows.map((r) => r.rowIndex)).toEqual([2, 4]);
  });
});

describe("postal codes from Excel number cells", () => {
  it("pads a 3-digit code back to 4", () => {
    const s = only(xlsxBuffer([["Name", "Postal code"], ["Thabo", 181]]));
    expect(normaliseFieldValue("billing_postal_code", s.rows[0].data["Postal code"]).value).toBe("0181");
  });
});
