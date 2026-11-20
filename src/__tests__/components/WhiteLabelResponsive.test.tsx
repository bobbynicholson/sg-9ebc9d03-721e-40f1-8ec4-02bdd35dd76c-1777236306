import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import WhiteLabelPage from "@/pages/admin/white-label";

const mockUpdateCompany = jest.fn();
const mockToast = jest.fn();

jest.mock("@/components/ProtectedRoute", () => ({ ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("@/components/admin/AdminNav", () => ({ AdminNav: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/components/NoIndexMeta", () => ({ NoIndexMeta: () => null }));
jest.mock("@/components/ui/info-tooltip", () => ({ InfoTooltip: () => null }));
jest.mock("@/components/portal/ui", () => ({
  PortalShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  PortalHeader: ({ title, actions }: { title: React.ReactNode; actions: React.ReactNode }) => <header>{title}{actions}</header>,
  PageWorkbench: () => null,
}));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ company: { id: "company-1", slug: "spit-braai-delivery" }, user: {}, profile: {} }),
}));
jest.mock("@/lib/tenantUrl", () => ({
  useResolvedTenantSlug: () => "spit-braai-delivery",
  useTenantHref: () => ({ withSlug: (path: string) => path }),
}));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("@/lib/branding/store", () => ({ clearBrandingCache: jest.fn(), publishBrandingUpdate: jest.fn() }));
jest.mock("@/lib/branding/applyBranding", () => ({
  DEFAULT_PALETTE: { primary: "#2563eb", secondary: "#7c3aed", accent: "#f59e0b" },
  DEFAULT_ORG_NAME: "CateringMS",
  isWhiteLabelRow: () => true,
  loadBrandFonts: jest.fn(),
}));
jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
        id: "company-1", company_name: "Example Catering", logo_url: "https://example.com/logo.png",
        primary_color: "#123456", secondary_color: "#345678", accent_color: "#56789a",
        brand_font_body: null, brand_font_display: null,
      }, error: null }) }) }),
      update: (patch: unknown) => ({ eq: (column: string, value: string) => mockUpdateCompany(patch, column, value) }),
    }),
    storage: { from: () => ({ remove: jest.fn().mockResolvedValue({ error: null }) }) },
  },
}));

beforeEach(() => {
  mockUpdateCompany.mockReset().mockResolvedValue({ error: null });
  mockToast.mockClear();
});

test("the labelled remove-logo control keeps its save behavior", async () => {
  render(<WhiteLabelPage />);
  await screen.findByAltText("Logo preview");
  const remove = screen.getByRole("button", { name: "Remove logo" });
  expect(remove.querySelector('[data-icon="Trash2"]')).toBeInTheDocument();

  fireEvent.click(remove);
  await waitFor(() => expect(mockUpdateCompany).toHaveBeenCalledWith({ logo_url: null }, "id", "company-1"));
  await waitFor(() => expect(screen.queryByAltText("Logo preview")).not.toBeInTheDocument());
  expect(remove).toBeDisabled();
});

test("branding controls remain labelled and save the selected font", async () => {
  render(<WhiteLabelPage />);
  await screen.findByAltText("Logo preview");
  expect(screen.getByRole("link", { name: "Back to Settings" })).toHaveAttribute("href", "/admin/settings");
  expect(screen.getByRole("button", { name: "Reset branding to default" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Save branding" }).querySelector('[data-icon="Save"]')).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Expand Color Palette" }));

  const primaryHex = screen.getByLabelText("Primary colour hex code");
  expect(primaryHex).toHaveValue("#123456");
  fireEvent.change(primaryHex, { target: { value: "#223344" } });
  expect(screen.getByLabelText("Primary Color")).toHaveValue("#223344");
  const bodyFonts = screen.getByRole("listbox", { name: "Body font choices" });
  expect(screen.getByRole("listbox", { name: "Heading font choices" })).toBeInTheDocument();
  const bodySelector = screen.getByRole("combobox", { name: "Body font choices" });
  fireEvent.change(bodySelector, { target: { value: "Poppins" } });
  expect(bodySelector).toHaveValue("Poppins");
  const poppins = within(bodyFonts).getByRole("option", { name: /^Poppins/ });
  expect(poppins).toHaveAttribute("aria-selected", "true");
  fireEvent.click(within(bodyFonts).getByRole("option", { name: /^Work Sans/ }));
  expect(bodySelector).toHaveValue("Work Sans");

  fireEvent.click(screen.getByRole("button", { name: "Save branding" }));
  await waitFor(() => expect(mockUpdateCompany).toHaveBeenCalledWith(
    expect.objectContaining({ brand_font_body: "Work Sans", primary_color: "#223344" }), "id", "company-1",
  ));

  fireEvent.click(screen.getByRole("button", { name: "Expand Live Preview" }));
  expect(screen.getByText("Primary Button").tagName).toBe("DIV");
});

test("the reset icon preserves its confirmation and reset action", async () => {
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
  render(<WhiteLabelPage />);
  await screen.findByAltText("Logo preview");
  fireEvent.click(screen.getByRole("button", { name: "Reset branding to default" }));
  expect(confirm).toHaveBeenCalled();
  await waitFor(() => expect(mockUpdateCompany).toHaveBeenCalledWith(
    expect.objectContaining({ logo_url: null, primary_color: null, secondary_color: null, accent_color: null }),
    "id", "company-1",
  ));
  confirm.mockRestore();
});
