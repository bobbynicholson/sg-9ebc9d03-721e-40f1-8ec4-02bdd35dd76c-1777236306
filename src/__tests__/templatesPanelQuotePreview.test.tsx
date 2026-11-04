import { render, screen, fireEvent } from "@testing-library/react";
import { TemplatesPanel } from "@/components/admin/lifecycle-emails/TemplatesPanel";
import { TEMPLATE_REGISTRY } from "@/lib/messageTemplates/registry";
import { listForCompany } from "@/services/messageTemplateService";

jest.mock("next/router", () => ({
  useRouter: () => ({ query: { template: "email_quote_sent" }, pathname: "/", asPath: "/", push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, profile: { company_id: "company-1" } }) }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/lib/tenantUrl", () => ({ useTenantHref: () => ({ withSlug: (path: string) => path }) }));
jest.mock("@/lib/observability", () => ({ captureException: jest.fn() }));
jest.mock("@/components/messaging/ComposeDrawerHost", () => ({
  ComposeDrawerHost: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
}));
jest.mock("@/components/ui/sheet", () => {
  const Part = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { SheetHeader: Part, SheetTitle: Part, SheetDescription: Part };
});
jest.mock("@/services/messageTemplateService", () => ({
  listForCompany: jest.fn(),
  saveOverride: jest.fn(),
  removeOverride: jest.fn(),
}));

const definition = TEMPLATE_REGISTRY.find((t) => t.key === "email_quote_sent")!;

function mockTemplate(customBody: string | null) {
  (listForCompany as jest.Mock).mockResolvedValue([{
    ...definition,
    isCustomised: customBody != null,
    customSubject: customBody != null ? "Your quote" : null,
    customBody,
    customIsActive: true,
  }]);
}

const previewText = () => screen.getByText("Preview (sample data)").closest(".space-y-2")!.textContent || "";
const customBody = "Hi {{first_name}},\n\nYour quote {{quote_number}} is ready.\n\nRegards,\nCallum.";

describe("New quote email preview", () => {
  it("shows matching Option 1 and Option 2 before the sign-off of a custom template", async () => {
    mockTemplate(customBody);
    render(<TemplatesPanel />);
    await screen.findByText("Preview (sample data)");
    fireEvent.click(screen.getByRole("button", { name: "Two quotes" }));

    const text = previewText();
    const first = text.indexOf("Option 1 — QUO-000061 (On-site catering)");
    const second = text.indexOf("Option 2 — QUO-000062 (Off-site catering)");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThan(text.indexOf("Regards,"));
  });

  it("shows no options for one quote on a custom template", async () => {
    mockTemplate(customBody);
    render(<TemplatesPanel />);
    await screen.findByText("Preview (sample data)");
    fireEvent.click(screen.getByRole("button", { name: "One quote" }));

    expect(previewText()).not.toContain("Option 1");
    expect(previewText()).not.toContain("Option 2");
  });

  it("shows each option once on the default template", async () => {
    mockTemplate(null);
    render(<TemplatesPanel />);
    await screen.findByText("Preview (sample data)");
    fireEvent.click(screen.getByRole("button", { name: "Two quotes" }));

    const text = previewText();
    expect(text.match(/Option 1 — /g)).toHaveLength(1);
    expect(text.match(/Option 2 — /g)).toHaveLength(1);
  });

  it("does not add the options twice after the block is inserted", async () => {
    mockTemplate(customBody);
    render(<TemplatesPanel />);
    await screen.findByText("Preview (sample data)");
    fireEvent.click(screen.getByRole("button", { name: "Insert Option 1 and Option 2 block" }));
    fireEvent.click(screen.getByRole("button", { name: "Two quotes" }));

    const text = previewText();
    expect(text.match(/Option 1 — /g)).toHaveLength(1);
    expect(text.match(/Option 2 — /g)).toHaveLength(1);
  });
});
