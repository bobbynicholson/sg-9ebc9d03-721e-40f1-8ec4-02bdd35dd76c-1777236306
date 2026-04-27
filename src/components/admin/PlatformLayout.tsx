import { ReactNode } from "react";
import { PlatformNav } from "@/components/admin/PlatformNav";

interface PlatformLayoutProps {
  children: ReactNode;
}

/**
 * Wrapper for /admin/platform/* pages.
 * Renders the fixed PlatformNav (mobile top bar + desktop sidebar) and pads
 * the page content so it doesn't sit underneath either of them.
 */
export function PlatformLayout({ children }: PlatformLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <PlatformNav />
      <div className="lg:pl-64 xl:pl-72 pt-16 lg:pt-0">{children}</div>
    </div>
  );
}
