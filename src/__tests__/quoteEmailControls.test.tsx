import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AutomatedEmailControls } from "@/components/admin/AutomatedEmailControls";
import { TemplatesPanel } from "@/components/admin/lifecycle-emails/TemplatesPanel";
import { getTemplateDefinition } from "@/lib/messageTemplates/registry";
import { listForCompany, saveOverride } from "@/services/messageTemplateService";

const mockRouter = { asPath: "/admin/email-settings", query: {} as Record<string, string> };
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("@/lib/tenantUrl", () => ({ useTenantHref: () => ({ withSlug: (path: string) => `/company${path}` }) }));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { company_id: "company-1" }, profile: { company_id: "company-1" } }) }));
jest.mock("@/services/messageTemplateService", () => ({ listForCompany: jest.fn(), saveOverride: jest.fn(), removeOverride: jest.fn() }));
jest.mock("@/lib/observability", () => ({ captureException: jest.fn() }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));

beforeEach(() => {
  mockRouter.query = {};
  (listForCompany as jest.Mock).mockResolvedValue([{ ...getTemplateDefinition("quote_price_updated"), isCustomised: false, customSubject: null, customBody: null, customIsActive: true }]);
  (saveOverride as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => { jest.clearAllMocks(); });

it("finds the quote update, turns it off and links directly to its editor", () => {
  const change = jest.fn();
  render(<AutomatedEmailControls preferences={{}} onModeChange={change} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "quote price update" } });
  fireEvent.click(screen.getByRole("switch", { name: "Quote price update — client email" }));
  expect(change).toHaveBeenCalledWith("quote_price_updated", "off");
  expect(screen.getByRole("link", { name: "Edit the Quote price update — client email template" }))
    .toHaveAttribute("href", "/company/admin/email-templates?tab=templates&template=quote_price_updated");
});

it("opens the linked template, saves its company wording and stays closed afterward", async () => {
  mockRouter.query = { template: "quote_price_updated" };
  render(<TemplatesPanel />);
  const subject = await screen.findByLabelText("Subject");
  fireEvent.change(subject, { target: { value: "Your revised {{quote_number}}" } });
  fireEvent.change(screen.getByLabelText("Message body"), { target: { value: "Hi {{first_name}}, please review {{quote_url}}." } });
  fireEvent.click(screen.getByRole("button", { name: "Save customisation" }));
  await waitFor(() => expect(saveOverride).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-1", key: "quote_price_updated", subject: "Your revised {{quote_number}}", body: "Hi {{first_name}}, please review {{quote_url}}." })));
  await waitFor(() => expect(screen.queryByLabelText("Subject")).not.toBeInTheDocument());
  expect(listForCompany).toHaveBeenCalledTimes(2);
});
