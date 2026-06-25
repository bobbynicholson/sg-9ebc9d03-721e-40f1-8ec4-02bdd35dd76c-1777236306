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
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-brand-primary/20 bg-brand-primary/10 text-brand-primary">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 max-w-3xl text-pretty text-sm leading-6 text-slate-600 dark:text-slate-400">
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
