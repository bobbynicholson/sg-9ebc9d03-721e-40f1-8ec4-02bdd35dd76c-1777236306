import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Stable Phase 2 anchor for a meaningful page section.
 *
 * Use a dotted ref such as `admin.orders.table` and a short DOM id such as
 * `orders-table`. The navigation registry owns the user-facing destination;
 * this component owns the page-level target and scroll offset.
 */
export function ChatSection({
  id,
  refName,
  className,
  children,
  label,
  kind = "section",
  ...rest
}: HTMLAttributes<HTMLDivElement> & { refName: string; label?: string; kind?: "section" | "subsection" | "record" }) {
  return (
    <div id={id} data-chat-section={refName} data-chat-section-label={label} data-chat-section-kind={kind} className={cn("scroll-mt-20", className)} {...rest}>
      {children}
    </div>
  );
}
