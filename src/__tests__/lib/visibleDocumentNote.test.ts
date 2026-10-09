import { visibleDocumentNote } from "@/lib/visibleDocumentNote";

describe("visibleDocumentNote", () => {
  it("hides the imported provenance block and its heading", () => {
    const note = `A NOTE FROM US\nImported from legacy source PDF: Orders 2026\\October\\QUO.pdf\nSource SHA-256: c31d20dd\nSource mode: Off Site.\nBilling address: Grotto Bay.`;
    expect(visibleDocumentNote(note)).toBeNull();
  });

  it("keeps a genuine note before an import audit block", () => {
    const note = `Please call before delivery.\n\nA NOTE FROM US\nImported from legacy source PDF: old.pdf\nSource mode: Off Site.`;
    expect(visibleDocumentNote(note)).toBe("Please call before delivery.");
  });

  it("leaves ordinary notes unchanged", () => {
    expect(visibleDocumentNote("We look forward to catering your event.")).toBe(
      "We look forward to catering your event.",
    );
  });
});