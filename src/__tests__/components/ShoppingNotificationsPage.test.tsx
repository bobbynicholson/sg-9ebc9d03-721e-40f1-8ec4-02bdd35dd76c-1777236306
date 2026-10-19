import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ShoppingNotificationsPage from "@/pages/team-portal/shopping/notifications";

const mockAuth = { user: { id: "shopper-1", company_id: "company-1" }, activeRole: "shopping_staff" };
const row = (id: string, isRead: boolean, createdAt: string) => ({
  id, user_id: null, recipient_id: null, target_role: "shopping_staff", type: "stock_low", notification_type: null,
  title: `Alert ${id}`, message: null, is_read: isRead, priority: "normal", link: null, action_url: null, created_at: createdAt,
});
// The newest-100 window holds only read rows; an older unread alert sits
// past it and only comes back from the unread window.
const newest = Array.from({ length: 100 }, (_, i) => row(`read-${i}`, true, `2026-10-18T10:${String(i % 60).padStart(2, "0")}:00Z`));
const olderUnread = row("old-unread", false, "2026-09-01T08:00:00Z");

jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockAuth }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/lib/tenantUrl", () => ({ useTenantHref: () => ({ withSlug: (p: string) => p }) }));
jest.mock("@/components/ProtectedRoute", () => ({ ProtectedRoute: ({ children }: any) => children }));
jest.mock("@/components/shopping/ShoppingPageShell", () => ({
  SHOPPING_HERO_CHIP: "",
  ShoppingPageShell: ({ children, subheading, meta }: any) => <div><p>{subheading}</p><div>{meta}</div>{children}</div>,
}));
jest.mock("@/components/portal/ui", () => ({ PortalCard: ({ children }: any) => <div>{children}</div> }));
jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let unreadOnly = false;
      const chain: any = {};
      for (const m of ["select", "or", "order", "limit"]) chain[m] = () => chain;
      chain.eq = (col: string) => { if (col === "is_read") unreadOnly = true; return chain; };
      chain.returns = async () => ({ data: unreadOnly ? [olderUnread] : newest, error: null });
      return chain;
    },
    channel: () => { const c: any = {}; c.on = () => c; c.subscribe = () => c; return c; },
    removeChannel: jest.fn(),
  },
}));

test("an unread alert older than the newest 100 still shows and is counted", async () => {
  render(<ShoppingNotificationsPage />);
  await waitFor(() => expect(screen.getByText("1 unread alert waiting for the shopping team.")).toBeInTheDocument());
  expect(screen.getByText("Alert old-unread")).toBeInTheDocument();
  expect(screen.getByText("101 in view")).toBeInTheDocument();
});
