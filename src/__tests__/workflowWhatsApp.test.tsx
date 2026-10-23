import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LeadWhatsAppButton, OrderWhatsAppButton } from "@/components/messaging/WorkflowWhatsAppButtons";
import { leadWhatsAppConfig, orderWhatsAppConfig } from "@/lib/whatsappContexts";
import { getTemplateDefinition } from "@/lib/messageTemplates/registry";
import { CLIENT_KIND_TO_REGISTRY, renderClientWhatsApp } from "@/lib/whatsappTemplates";
import { supabase } from "@/integrations/supabase/client";
import { resolveTemplateSync } from "@/services/messageTemplateService";

jest.mock("next/router", () => ({ useRouter: () => ({ query: { company_slug: "tenant" } }) }));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: { company_id: "company", full_name: "Team Member" } }) }));
jest.mock("@/hooks/useTemplateOverrides", () => ({ useTemplateOverrides: () => ({ version: 0 }) }));
jest.mock("@/hooks/useTenantCurrency", () => ({ useTenantCurrency: () => ({ code: "ZAR" }) }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/services/messageTemplateService", () => ({ resolveTemplateSync: jest.fn(() => null) }));
jest.mock("@/integrations/supabase/client", () => ({ supabase: { from: jest.fn() } }));
afterEach(() => jest.clearAllMocks());

it("opens WhatsApp directly for a phone-only lead with enquiry templates and their saved editors", () => {
  render(<LeadWhatsAppButton lead={{ contact_name: "Jane Person", client_name: "Example Company", phone: "0825550001", status: "new" }} />);
  fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
  expect(screen.getByRole("group", { name: "Message template" }).querySelectorAll("button")).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Reply to enquiry" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("textbox", { name: "WhatsApp message" })).not.toHaveValue(expect.stringContaining("date is still on"));
  fireEvent.click(screen.getByRole("button", { name: "Ask for event details" }));
  const message = screen.getByRole("textbox", { name: "WhatsApp message" }) as HTMLTextAreaElement;
  expect(message.value).toContain("Hi Jane,");
  expect(message.value).toContain("dietary requirements");
  expect(screen.getByRole("link", { name: "Edit saved template" })).toHaveAttribute("href", "/tenant/admin/email-templates?tab=templates&template=whatsapp_lead_details");
  expect(screen.queryByRole("button", { name: "Quote chase" })).not.toBeInTheDocument();
});

it("opens the order dialog without following the parent card and includes the booking reference", () => {
  const navigate = jest.fn();
  render(<div onClick={navigate}><OrderWhatsAppButton order={{ order_number: "ORD-123", client_name: "Jane Person", client_phone: "0825550001", event_date: "2026-11-05", status: "confirmed" }} /></div>);
  fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
  navigate.mockClear();
  fireEvent.click(screen.getByRole("heading", { name: "WhatsApp message" }));
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Booking update" })).toHaveAttribute("aria-pressed", "true");
  const message = screen.getByRole("textbox", { name: "WhatsApp message" }) as HTMLTextAreaElement;
  expect(message.value).toContain("ORD-123");
  expect(message.value).not.toContain("Deposit invoice");
  fireEvent.click(screen.getByRole("button", { name: "Event this week" }));
  expect(screen.getByRole("link", { name: "Edit saved template" })).toHaveAttribute("href", "/tenant/admin/email-templates?tab=templates&template=whatsapp_event_week");
  expect(navigate).not.toHaveBeenCalled();
});

it("keeps the entry point visible with a clear reason when a contact has no phone", () => {
  const { rerender } = render(<LeadWhatsAppButton lead={{ client_name: "No Phone" }} />);
  expect(screen.getByRole("button", { name: "WhatsApp" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "WhatsApp" })).toHaveAttribute("title", "Add a valid phone number before opening WhatsApp.");
  rerender(<OrderWhatsAppButton order={{ client_name: "No Phone" }} />);
  expect(screen.getByRole("button", { name: "WhatsApp" })).toBeDisabled();
});

it("resolves legacy and joined contacts and keeps consent IDs for the shared dialog", () => {
  expect(leadWhatsAppConfig({ client_phone: "0825550001", converted_to_client_id: "client-1", status: "contacted" }))
    .toMatchObject({ phone: "0825550001", clientId: "client-1", defaultTemplate: "lead_chase" });
  expect(orderWhatsAppConfig({ clients: { id: "client-2", phone: "0825550002", contact_name: "Jane Person", client_name: "Example Company" } }))
    .toMatchObject({ phone: "0825550002", clientId: "client-2", ctx: { contactName: "Jane Person" } });
});

it("respects an existing client's WhatsApp opt-out from the direct order action", async () => {
  (supabase.from as jest.Mock).mockImplementation((table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "clients" ? { user_id: "user-1" } : { whatsapp_opt_in: false }, error: null }) }) }),
  }));
  render(<OrderWhatsAppButton order={{ client_id: "client-1", client_name: "Jane Person", client_phone: "0825550001" }} />);
  fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
  await waitFor(() => expect(screen.getByText("WhatsApp comms off")).toBeInTheDocument());
  expect(screen.queryByRole("link", { name: "Open current message in WhatsApp app" })).not.toBeInTheDocument();
});

it("uses company wording for the new booking template", () => {
  (resolveTemplateSync as jest.Mock).mockReturnValueOnce({ fromOverride: true, body: "Hi Jane, your company-specific booking message." });
  expect(renderClientWhatsApp("order_update", { contactName: "Jane Person", companyId: "company", orderRef: "ORD-123" }))
    .toBe("Hi Jane, your company-specific booking message.");
  expect(resolveTemplateSync).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company", key: "whatsapp_order_update", ctx: expect.objectContaining({ order_ref: "ORD-123" }) }));
});

it.each(["cancelled", "completed", "delivered"])("does not offer pending delivery messages for a %s order", (status) => {
  expect(orderWhatsAppConfig({ status }).templates).toEqual(["order_update"]);
});

it.each(["lead_details", "lead_chase", "order_update"] as const)("registers %s for company customisation and renders a usable default", (kind) => {
  const definition = getTemplateDefinition(CLIENT_KIND_TO_REGISTRY[kind]);
  expect(definition?.channel).toBe("whatsapp");
  expect(renderClientWhatsApp(kind, { contactName: "Jane Person", orderRef: "ORD-123" })).toContain("Hi Jane,");
});

it.each(["quote_sent", "quote_chase", "quote_accepted"] as const)("keeps quote template %s registered and usable", (kind) => {
  expect(getTemplateDefinition(CLIENT_KIND_TO_REGISTRY[kind])?.channel).toBe("whatsapp");
  expect(renderClientWhatsApp(kind, { contactName: "Jane Person", quoteRef: "Q-123" })).toContain("Hi Jane,");
});
