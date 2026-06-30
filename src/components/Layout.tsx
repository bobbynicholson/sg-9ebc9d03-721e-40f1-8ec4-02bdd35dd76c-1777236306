import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DynamicNav } from "@/components/DynamicNav";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { TrialExpiryBanner } from "@/components/TrialExpiryBanner";
import { PageWorkbench } from "@/components/portal/ui";

interface LayoutProps {
  children: ReactNode;
  showNav?: boolean;
  showHeader?: boolean;
  showFooter?: boolean;
  maxWidth?: "full" | "7xl" | "6xl" | "5xl" | "4xl";
}

export function Layout({
  children,
  showNav = true,
  showHeader = true,
  showFooter = false,
  maxWidth = "7xl",
}: LayoutProps) {
  const { user, loading } = useAuth();

  // Show loading state while auth is initializing
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const maxWidthClasses = {
    full: "max-w-full",
    "7xl": "max-w-7xl",
    "6xl": "max-w-6xl",
    "5xl": "max-w-5xl",
    "4xl": "max-w-4xl",
  };

  // Portal pages have a fixed left sidebar (lg:w-64 / xl:w-72). We
  // clear it with a left padding on the shell. Public/marketing pages
  // (showNav=false) keep mx-auto centring - that's the right shape
  // for a hero-and-content layout with no sidebar.
  // Offset MUST match the nav width. AdminNav + the staff PortalSidebar
  // are lg:w-72 xl:w-80; ClientNav is now widened to match. The old
  // lg:pl-64 xl:pl-72 here left a 32px overlap where the wider AdminNav
  // sat on top of the content's left edge on every PortalLayout page.
  const isPortal = showNav && user;
  const portalShell = isPortal ? "lg:pl-72 xl:pl-80 pt-16 lg:pt-0" : "";
  // On portal pages, content sits flush against the left padding the
  // shell already provides - no mx-auto, otherwise the content
  // centres in the post-sidebar gap and leaves a big empty rail.
  const innerAlignment = isPortal ? "" : "mx-auto";
  // Portal pages use the FULL desktop width (no max-w cap) so there's
  // no empty side rail - matches PortalShell. The maxWidth prop only
  // applies to public/marketing pages, which stay centred + capped.
  const innerMaxWidth = isPortal ? "max-w-full" : maxWidthClasses[maxWidth];
  const shellBackground = isPortal
    ? "relative overflow-hidden bg-[linear-gradient(180deg,#eef2f6_0%,#f8fafc_260px,#f8fafc_100%)] dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_260px,#0f172a_100%)]"
    : "bg-background";

  return (
    <div className={`min-h-screen flex flex-col ${shellBackground} ${portalShell}`}>
      {isPortal && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[linear-gradient(90deg,rgb(var(--brand-primary-rgb)/0.10),rgb(var(--brand-secondary-rgb)/0.08),rgb(var(--brand-accent-rgb)/0.10))] dark:opacity-35"
        />
      )}
      {/* Trial Expiry Banner - Shows for authenticated users with trial status */}
      {user && <TrialExpiryBanner />}

      {/* Header - Public/Marketing header */}
      {showHeader && !user && <Header />}

      {/* Navigation - Role-based navigation for authenticated users */}
      {showNav && user && <DynamicNav userRole={user.role} />}

      {/* Main Content */}
      <main className="relative z-0 flex-1">
        <div className={`${innerAlignment} px-4 sm:px-6 lg:px-8 py-8 ${innerMaxWidth}`}>
          {isPortal && <PageWorkbench />}
          {children}
        </div>
      </main>

      {/* Footer */}
      {showFooter && <Footer />}
    </div>
  );
}

/**
 * Layout variant for public pages (marketing, auth, etc.)
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <Layout showNav={false} showHeader={true} showFooter={true} maxWidth="6xl">
      {children}
    </Layout>
  );
}

/**
 * Layout variant for authenticated portal pages
 */
export function PortalLayout({ children, maxWidth = "7xl" }: { children: ReactNode; maxWidth?: LayoutProps["maxWidth"] }) {
  return (
    <Layout showNav={true} showHeader={false} showFooter={false} maxWidth={maxWidth}>
      {children}
    </Layout>
  );
}

/**
 * Minimal layout with no nav/header/footer
 */
export function MinimalLayout({ children }: { children: ReactNode }) {
  return (
    <Layout showNav={false} showHeader={false} showFooter={false} maxWidth="full">
      {children}
    </Layout>
  );
}
