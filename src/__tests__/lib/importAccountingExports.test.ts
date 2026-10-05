import { buildMappingFromTemplate, composeImportedClient, getTemplateDefinition, recogniseHeaders } from "@/lib/importTemplates";

const WAVE_HEADERS = "id,company,firstName,lastName,email,phone,fax,mobile,tollFree,website,billingAddress1,billingAddress2,billingCity,billingProvince,billingCountry,billingPostalCode,shippingAddress1,shippingAddress2,shippingCity,shippingProvince,shippingCountry,shippingPostalCode,shipToContact,shipToPhone,deliveryInstructions,currency,balance,overdue,createdAt".split(",");

test("a Wave customer export is recognised as a clients import", () => {
  expect(recogniseHeaders(WAVE_HEADERS)?.type).toBe("clients");
});

test("Wave columns map onto client fields instead of being skipped", () => {
  const mapping = buildMappingFromTemplate(getTemplateDefinition("clients"), "Sheet1", WAVE_HEADERS).Sheet1;
  const target = (header: string) => mapping[header].target;
  expect(target("company")).toBe("client_name");
  expect(target("firstName")).toBe("first_name");
  expect(target("lastName")).toBe("last_name");
  expect(target("email")).toBe("email");
  expect(target("mobile")).toBe("mobile_number");
  expect(target("billingAddress1")).toBe("billing_address_line1");
  expect(target("billingAddress2")).toBe("billing_address_line2");
  expect(target("shippingAddress1")).toBe("delivery_address_1");
  expect(target("balance")).toBe("skip");
});

test("a person without a company becomes the client name", () => {
  expect(composeImportedClient({ first_name: "Aaron", last_name: "Rhodes" })).toEqual({ client_name: "Aaron Rhodes" });
});

test("company name wins; contact person and delivery details go to notes", () => {
  const row = composeImportedClient({
    client_name: "911 Service Centre", first_name: "Joanna", last_name: "Schrenk", notes: "VIP",
    delivery_address_1: "5 The Dell", delivery_city: "Pinelands", delivery_instructions: "Gate code 1234",
  });
  expect(row.client_name).toBe("911 Service Centre");
  expect(row.notes).toBe("VIP\nContact: Joanna Schrenk\nDelivery address: 5 The Dell, Pinelands\nDelivery instructions: Gate code 1234");
  expect(Object.keys(row).sort()).toEqual(["client_name", "notes"]);
});

test("our own template headers still map as before", () => {
  const mapping = buildMappingFromTemplate(getTemplateDefinition("clients"), "S", ["Client name *", "Email *", "Mobile"]).S;
  expect(mapping["Client name *"].target).toBe("client_name");
  expect(mapping["Email *"].target).toBe("email");
});
