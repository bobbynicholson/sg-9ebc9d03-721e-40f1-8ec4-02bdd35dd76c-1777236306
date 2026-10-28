// Every cancel reason the admin can pick must be accepted by the cancel
// API and by orders_cancellation_category_check. "Test data - clean up"
// failed in production because the DB check was never widened.
import * as fs from "fs";
import * as path from "path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

function quotedValues(block: string): string[] {
  return Array.from(block.matchAll(/["']([a-z_]+)["']/g)).map((m) => m[1]);
}

const dialogValues = Array.from(
  read("src/components/admin/orders/RemoveOrderDialog.tsx").matchAll(/value:\s*"([a-z_]+)"/g),
).map((m) => m[1]);

const apiSource = read("src/pages/api/orders/[id]/cancel.ts");
const apiValues = quotedValues(apiSource.slice(apiSource.indexOf("VALID_CATEGORIES"), apiSource.indexOf("]);", apiSource.indexOf("VALID_CATEGORIES"))));

const latestCheck = fs
  .readdirSync(path.join(process.cwd(), "supabase/migrations"))
  .sort()
  .map((f) => read(`supabase/migrations/${f}`))
  .filter((sql) => sql.includes("ADD CONSTRAINT orders_cancellation_category_check"))
  .pop()!;
const checkSql = latestCheck.slice(latestCheck.indexOf("ADD CONSTRAINT orders_cancellation_category_check"));
const dbValues = quotedValues(checkSql.slice(checkSql.indexOf("IN ("), checkSql.indexOf(");")));

describe("order cancellation reasons", () => {
  it("offers reasons in the cancel dialog", () => {
    expect(dialogValues).toContain("test_data");
  });

  it.each(dialogValues)("%s is accepted by the cancel API and the database check", (value) => {
    expect(apiValues).toContain(value);
    expect(dbValues).toContain(value);
  });
});
