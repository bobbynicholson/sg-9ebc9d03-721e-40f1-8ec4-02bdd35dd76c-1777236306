import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  icon: LucideIcon;
  iconClassName?: string;
};

export const PortalHeaderIconAction = React.forwardRef<HTMLButtonElement, Props>(
  ({ label, icon: Icon, iconClassName, className, type = "button", ...props }, ref) => (
    <button
      {...props}
      ref={ref}
      type={type}
      title={label}
      aria-label={label}
      className={cn("inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md bg-transparent text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50", className)}
    >
      <Icon aria-hidden="true" className={cn("h-5 w-5", iconClassName)} />
    </button>
  ),
);
PortalHeaderIconAction.displayName = "PortalHeaderIconAction";
