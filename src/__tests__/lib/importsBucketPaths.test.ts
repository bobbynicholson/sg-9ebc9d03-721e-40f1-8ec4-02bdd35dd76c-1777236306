import fs from "fs";
import path from "path";

// The "imports" storage bucket only accepts uploads whose first folder is
// the caller's company_id (migration 20260705250000_imports_storage_bucket).
// A path that starts with anything else is refused, which is how shopping
// receipt photos on "Complete shop" were silently never saved.
const UPLOADERS = [
  "src/pages/team-portal/shopping/orders.tsx",
  "src/services/shopping/proactiveRestockService.ts",
  "src/pages/api/imports/receipts/upload.ts",
  "src/pages/api/imports/upload.ts",
];

describe("imports bucket upload paths", () => {
  it.each(UPLOADERS)("%s starts every upload path with the company id", (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    const paths = [...source.matchAll(/const path = `([^`]+)`/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p).toMatch(/^\$\{[^}]*company_?[iI]d\}\//);
    }
  });
});
