import { render, screen } from "@testing-library/react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";

const mockAuth: Record<string, unknown> = {};
const mockReplace = jest.fn();

jest.mock("next/router", () => ({
  useRouter: () => ({ pathname: "/admin/orders", asPath: "/admin/orders", replace: mockReplace, back: jest.fn() }),
}));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockAuth }));
jest.mock("@/components/pwa/PwaLoadingScreen", () => ({ PwaLoadingScreen: () => <div>app loader</div> }));
jest.mock("@/services/authService", () => ({ authService: {} }));
jest.mock("@/services/profileService", () => ({ profileService: {} }));
jest.mock("@/lib/localAuthBypass", () => ({ isLocalAuthBypassEnabled: () => false }));

const signedIn = (role: string) => Object.assign(mockAuth, {
  user: { id: "user-1", role },
  profile: { id: "user-1", role },
  loading: false,
  userRoles: [role],
  activeRole: role,
});

const renderPage = (props: Partial<React.ComponentProps<typeof ProtectedRoute>> = {}) =>
  render(<ProtectedRoute allowedRoles={[UserRole.ADMIN]} {...props}><div>page content</div></ProtectedRoute>);

describe("ProtectedRoute", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockAuth)) delete mockAuth[key];
  });

  it("shows the page on its first render for a signed-in user, with no loader", () => {
    signedIn(UserRole.ADMIN);
    renderPage();
    expect(screen.getByText("page content")).toBeTruthy();
    expect(screen.queryByText("app loader")).toBeNull();
  });

  it("shows the loader while sign-in is still loading", () => {
    Object.assign(mockAuth, { user: null, profile: null, loading: true, userRoles: [], activeRole: null });
    renderPage();
    expect(screen.getByText("app loader")).toBeTruthy();
    expect(screen.queryByText("page content")).toBeNull();
  });

  it("denies a role that is not allowed", () => {
    signedIn(UserRole.CLIENT);
    renderPage();
    expect(screen.getByText("Access Denied")).toBeTruthy();
    expect(screen.queryByText("page content")).toBeNull();
  });

  it("blocks a denied role even for a super admin", () => {
    signedIn(UserRole.SUPER_ADMIN);
    renderPage({ denyRoles: [UserRole.SUPER_ADMIN] });
    expect(screen.queryByText("page content")).toBeNull();
  });

  it("lets a super admin through role restrictions", () => {
    signedIn(UserRole.SUPER_ADMIN);
    renderPage();
    expect(screen.getByText("page content")).toBeTruthy();
  });

  it("shows nothing to a signed-out visitor", () => {
    Object.assign(mockAuth, { user: null, profile: null, loading: false, userRoles: [], activeRole: null });
    renderPage();
    expect(screen.queryByText("page content")).toBeNull();
  });
});
