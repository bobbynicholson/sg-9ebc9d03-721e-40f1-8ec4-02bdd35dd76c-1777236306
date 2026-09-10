import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PublicActionShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "relative flex min-h-screen items-start justify-center overflow-hidden bg-[linear-gradient(180deg,#eef2f6_0%,#f8fafc_260px,#f8fafc_100%)] px-4 py-8 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_260px,#0f172a_100%)]",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[linear-gradient(90deg,rgb(var(--brand-primary-rgb)/0.10),rgb(var(--brand-secondary-rgb)/0.08),rgb(var(--brand-accent-rgb)/0.10))] dark:opacity-35"
      />
      <div className="relative z-0 w-full max-w-md">{children}</div>
    </main>
  );
}
