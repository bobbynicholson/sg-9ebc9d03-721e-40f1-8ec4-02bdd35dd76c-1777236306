/**
 * AdminPageHeader - one consistent page title block for every admin
 * page.
 *
 * The admin pages each rolled their own <h1> - some used a brand
 * gradient, some flat slate, in sizes from text-2xl to text-4xl, with
 * inconsistent spacing. This component gives them all the SAME header:
 * optional icon tile, solid readable title, optional subtitle, and an
 * optional right-aligned actions slot - so headers never drift again.
 *
 * Usage:
 *   <AdminPageHeader
 *     title="Invoices"
 *     subtitle="Track deposits, balances and payments"
 *     icon={Receipt}
 *     actions={<Button>New invoice</Button>}
 *   />
 */
import { PortalHeader } from "@/components/portal/ui";

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  /** lucide icon component, shown in a brand-tinted tile beside the title. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Right-aligned actions (buttons, filters). Wraps below the title on mobile. */
  actions?: React.ReactNode;
  className?: string;
}

export function AdminPageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
  className,
}: AdminPageHeaderProps) {
  return (
    <PortalHeader variant="hero" title={title} subtitle={subtitle} icon={Icon} actions={actions} className={className} />
  );
}
