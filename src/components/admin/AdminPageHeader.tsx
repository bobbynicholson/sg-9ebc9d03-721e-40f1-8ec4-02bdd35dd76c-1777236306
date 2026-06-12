/**
 * AdminPageHeader - one consistent page title block for every admin
 * page.
 *
 * The admin pages each rolled their own <h1> - some used a brand
 * gradient, some flat slate, in sizes from text-2xl to text-4xl, with
 * inconsistent spacing. This component gives them all the SAME header:
 * optional icon tile, gradient brand title, optional subtitle, and an
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
import { cn } from "@/lib/utils";

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
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand-primary/10">
            <Icon className="h-5 w-5 text-brand-primary" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent leading-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
