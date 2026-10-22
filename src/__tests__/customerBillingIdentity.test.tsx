import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { customerBillingIdentity, importedCustomerIdentity, resolveInvoiceCompanyName, resolveInvoiceContactName } from "@/lib/customerIdentity";
import { CustomerIdentityFields } from "@/components/admin/CustomerIdentityFields";
import { DocumentPartiesAndEvent } from "@/components/documents/DocumentPartiesAndEvent";

test("company is the bill-to while the contact remains available for greetings", () => {
  expect(customerBillingIdentity(" Sheri Lee Pan ", " Example Events Ltd ")).toEqual({ name: "Example Events Ltd", contactName: "Sheri Lee Pan" });
  expect(customerBillingIdentity("Sheri Lee Pan", "  ")).toEqual({ name: "Sheri Lee Pan", contactName: null });
  expect(customerBillingIdentity("Example Events Ltd", "Example Events Ltd").contactName).toBeNull();
});

test("changing company never overwrites the contact, and both names survive form save", () => {
  let saved: unknown;
  function Form() {
    const [contactName, contact] = useState("Sheri Lee Pan");
    const [companyName, company] = useState("");
    return <form onSubmit={(e) => { e.preventDefault(); saved = { contactName, companyName }; }}>
      <CustomerIdentityFields {...{ contactName, companyName }} onContactNameChange={contact} onCompanyNameChange={company} />
      <button>Save</button>
    </form>;
  }
  render(<Form />);
  fireEvent.change(screen.getByLabelText("Company / organisation name (optional)"), { target: { value: "Example Events Ltd" } });
  expect((screen.getByLabelText("Contact name") as HTMLInputElement).value).toBe("Sheri Lee Pan");
  fireEvent.click(screen.getByText("Save"));
  expect(saved).toEqual({ contactName: "Sheri Lee Pan", companyName: "Example Events Ltd" });
});

test("preview shows the company first and the person as attention", () => {
  render(<DocumentPartiesAndEvent from={{ name: "The caterer" }} billTo={{ ...customerBillingIdentity("Sheri Lee Pan", "Example Events Ltd"), email: "contact@example.com" }} event={{}} />);
  expect(screen.getByText("Example Events Ltd")).toBeTruthy();
  expect(screen.getByText("Attention: Sheri Lee Pan")).toBeTruthy();
});

test("a manual invoice's billing override wins over the contact default", () => {
  expect(resolveInvoiceCompanyName({ invoiceData: { clientCompanyName: "Subsidiary Ltd" }, client: { company_name: "Parent Ltd" } })).toBe("Subsidiary Ltd");
});
test("an explicit individual invoice stays individual, while legacy invoices inherit", () => {
  expect(resolveInvoiceCompanyName({ invoiceData: { clientCompanyName: null }, client: { company_name: "Parent Ltd" } })).toBeNull();
  expect(resolveInvoiceCompanyName({ invoiceData: {}, client: { company_name: "Parent Ltd" } })).toBe("Parent Ltd");
});
test("the booking's billing identity wins consistently over stale invoice data", () => {
  expect(resolveInvoiceCompanyName({ order: { client_company_name: "New booking Ltd" }, invoiceData: { clientCompanyName: "Old snapshot Ltd" }, client: { company_name: "Parent Ltd" } })).toBe("New booking Ltd");
  expect(resolveInvoiceCompanyName({ order: { client_company_name: null }, invoiceData: { clientCompanyName: "Old snapshot Ltd" }, client: { company_name: "Parent Ltd" } })).toBeNull();
});
test("imports keep a real contact name separate from the organisation", () => {
  expect(importedCustomerIdentity(" Sheri Lee Pan ", " ELP Consulting ")).toEqual({ client_name: "Sheri Lee Pan", company_name: "ELP Consulting" });
  expect(importedCustomerIdentity(null, "ELP Consulting")).toEqual({ client_name: "Customer", company_name: "ELP Consulting" });
});
test("viewing an order cannot edit either identity field until edit mode is enabled", () => {
  render(<CustomerIdentityFields contactName="Sheri" companyName="ELP Consulting" onContactNameChange={() => {}} onCompanyNameChange={() => {}} disabled />);
  expect((screen.getByLabelText("Contact name") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText("Company / organisation name (optional)") as HTMLInputElement).disabled).toBe(true);
});

test("all document views use the booking or invoice contact before the general account contact", () => {
  expect(resolveInvoiceContactName({ order: { client_name: "Alex" }, invoiceData: { clientName: "Jo" }, client: { client_name: "Sheri" } })).toBe("Alex");
  expect(resolveInvoiceContactName({ invoiceData: { clientName: "Jo" }, client: { client_name: "Sheri" } })).toBe("Jo");
  expect(resolveInvoiceContactName({ invoiceData: {}, client: { client_name: "Sheri" } })).toBe("Sheri");
});
