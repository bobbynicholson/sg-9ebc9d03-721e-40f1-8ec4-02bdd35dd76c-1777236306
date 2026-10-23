import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { WhatsAppButton } from "@/components/messaging/WhatsAppButton";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {} }) }));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: { company_id: "company" } }) }));
jest.mock("@/hooks/useTemplateOverrides", () => ({ useTemplateOverrides: () => ({ version: 0 }) }));
jest.mock("@/hooks/useTenantCurrency", () => ({ useTenantCurrency: () => ({ code: "ZAR" }) }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/services/messageTemplateService", () => ({ resolveTemplateSync: () => null }));
jest.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const ctx = { contactName: "Test Customer", companyName: "Catering" };

it("uses the edited message in the desktop app link and offers Web separately", () => {
  render(<WhatsAppButton phone="0825550001" kind="client" ctx={ctx} templates={["lead_followup"]} />);
  fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
  const message = "Hi Test,\nPlate, knife & fork ✓";
  fireEvent.change(screen.getByRole("textbox", { name: "WhatsApp message" }), { target: { value: message } });
  const app = screen.getByRole("link", { name: "Open current message in WhatsApp app" });
  expect(app).toHaveAttribute("href", `whatsapp://send?phone=27825550001&text=${encodeURIComponent(message)}`);
  expect(app).toHaveAttribute("target", "_self");
  const web = screen.getByRole("link", { name: "Open current message in WhatsApp Web" });
  expect(web).toHaveAttribute("href", `https://web.whatsapp.com/send?phone=27825550001&text=${encodeURIComponent(message)}`);
  expect(web).toHaveAttribute("target", "_blank");
});

it("retains a template on immediate open and switches drafts when another template is selected", () => {
  render(<WhatsAppButton phone="0825550001" kind="client" ctx={ctx} templates={["lead_followup", "quote_sent"]} />);
  fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
  const text = screen.getByRole("textbox", { name: "WhatsApp message" }) as HTMLTextAreaElement;
  expect(text.value).not.toBe("");
  fireEvent.change(text, { target: { value: "Custom draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Quote sent — client notification" }));
  expect(text.value).not.toBe("Custom draft");
  expect(screen.getByRole("link", { name: "Open current message in WhatsApp app" }))
    .toHaveAttribute("href", `whatsapp://send?phone=27825550001&text=${encodeURIComponent(text.value)}`);
});

it("has no outbound link for missing numbers or opted-out clients", () => {
  const { rerender } = render(<WhatsAppButton phone={null} kind="client" ctx={ctx} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(<WhatsAppButton phone="0825550001" kind="client" ctx={ctx} optedOut />);
  fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
  expect(screen.getByText("WhatsApp comms off")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
