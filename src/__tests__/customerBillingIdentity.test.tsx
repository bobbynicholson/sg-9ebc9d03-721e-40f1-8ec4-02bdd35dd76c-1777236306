import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { customerBillingIdentity } from "@/lib/customerIdentity";
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
