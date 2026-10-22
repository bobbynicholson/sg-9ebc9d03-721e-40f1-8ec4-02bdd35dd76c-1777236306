import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ManualInvoiceDialog } from "@/components/billing/ManualInvoiceDialog";
import { supabase } from "@/integrations/supabase/client";
import { resolveDefaultRegionId } from "@/lib/defaultRegion";

jest.mock("@/integrations/supabase/client", () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "admin", company_id: "tenant" } }) }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/lib/defaultRegion", () => ({ resolveDefaultRegionId: jest.fn() }));
jest.mock("@/components/admin/ClientTypeahead", () => ({ ClientTypeahead: (props: any) => <input id={props.id} value={props.value} onChange={(e) => props.onChange(e.target.value)} /> }));

function database(existing: any = null, failInvoice = false) {
  const inserts: Array<{ table: string; row: any }> = [];
  const filters: unknown[] = [];
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const query: any = {
      select: () => query,
      eq: (key: string, value: string) => { filters.push([table, key, value]); return query; },
      ilike: (key: string, value: string) => { filters.push([table, key, value]); return query; },
      is: () => query,
      maybeSingle: async () => ({ data: table === "clients" ? existing : { vat_rate: 0.15 }, error: null }),
      insert: (rows: any[]) => { inserts.push({ table, row: rows[0] }); return query; },
      single: async () => table === "invoices" && failInvoice ? { data: null, error: { message: "Temporary failure" } } : { data: { id: table + "-new" }, error: null },
    };
    return query;
  });
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: "INV-TEST", error: null });
  (resolveDefaultRegionId as jest.Mock).mockResolvedValue("tenant-region");
  return { inserts, filters };
}

function fill() {
  fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Sheri Lee Pan" } });
  fireEvent.change(screen.getByLabelText("Company / organisation name (optional)"), { target: { value: "Subsidiary Ltd" } });
  fireEvent.change(screen.getByPlaceholderText("finance@acme.com"), { target: { value: "sheri@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("Item description"), { target: { value: "Catering" } });
  fireEvent.change(screen.getByPlaceholderText("Unit price"), { target: { value: "100" } });
}

test("a new company contact and its manual invoice retain both names and a valid region", async () => {
  const db = database();
  const onCreated = jest.fn();
  render(<ManualInvoiceDialog open onOpenChange={() => {}} onCreated={onCreated} />);
  fill(); fireEvent.click(screen.getByRole("button", { name: /Create invoice/i }));
  await waitFor(() => expect(onCreated).toHaveBeenCalled());
  expect(db.inserts.find((i) => i.table === "clients")?.row).toMatchObject({ company_id: "tenant", region_id: "tenant-region", client_name: "Sheri Lee Pan", company_name: "Subsidiary Ltd", phone: "" });
  expect(db.inserts.find((i) => i.table === "invoices")?.row.invoice_data).toMatchObject({ clientName: "Sheri Lee Pan", clientCompanyName: "Subsidiary Ltd" });
});

test("an existing contact is matched by tenant and email; a one-off billing company stays on the invoice", async () => {
  const db = database({ id: "existing-client", company_name: "Parent Ltd" });
  render(<ManualInvoiceDialog open onOpenChange={() => {}} onCreated={() => {}} />);
  fill(); fireEvent.click(screen.getByRole("button", { name: /Create invoice/i }));
  await waitFor(() => expect(db.inserts.some((i) => i.table === "invoices")).toBe(true));
  expect(db.inserts.filter((i) => i.table === "clients")).toHaveLength(0);
  expect(db.filters).toEqual(expect.arrayContaining([["clients", "company_id", "tenant"], ["clients", "email", "sheri@example.com"]]));
  expect(db.inserts.find((i) => i.table === "invoices")?.row).toMatchObject({ client_id: "existing-client", invoice_data: { clientName: "Sheri Lee Pan", clientCompanyName: "Subsidiary Ltd" } });
});

test("invoice failure keeps the entered person and company available for retry", async () => {
  const db = database({ id: "existing-client" }, true);
  const onCreated = jest.fn();
  render(<ManualInvoiceDialog open onOpenChange={() => {}} onCreated={onCreated} />);
  fill(); fireEvent.click(screen.getByRole("button", { name: /Create invoice/i }));
  await waitFor(() => expect(db.inserts.some((i) => i.table === "invoices")).toBe(true));
  expect(onCreated).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Contact name") as HTMLInputElement).value).toBe("Sheri Lee Pan");
  expect((screen.getByLabelText("Company / organisation name (optional)") as HTMLInputElement).value).toBe("Subsidiary Ltd");
});
