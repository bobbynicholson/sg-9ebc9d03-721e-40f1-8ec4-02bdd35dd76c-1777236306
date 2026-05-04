/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ClientPageHeader -- the branded gradient band that sits at the top
 * of every client portal page.
 *
 * Why one component: the dashboard had a beautiful tenant-branded
 * header (logo + greeting on a gradient, badges on the right) while
 * Quotes / My Orders / Tracking / Billing each had their own
 * mismatched header. From the client's eye that read as "the
 * dashboard is the proper page, the rest of these are admin tools."
 * Bobby pointed at it: every inner page now uses this band so the
 * portal feels like one cohesive product.
 *
 * Two flavours:
 *   - eyebrow + title  (default)            -- "Spit Braai Delivery / Your quotes"
 *   - eyebrow + title (greeting form)       -- "Spit Braai Delivery / Good evening, Bobby"
 *
 * Subtitle is optional and renders under the title in faded white.
 * rightSlot is for badges, action buttons or status pills -- whatever
 * each page wants on its right side.
 */
import { useAuth } from "@/contexts/AuthContext";
import { ChefHat } from "lucide-react";

interface ClientPageHeaderProps {
  /** Page-specific title. For dashboard pass the greeting form. */
  title: string;
  /** Optional one-line copy under the title. */
  subtitle?: string | null;
  /** Optional override for the company-name eyebrow. Defaults to company.company_name. */
  eyebrow?: string;
  /** Right-aligned slot -- badges, action buttons, etc. */
  rightSlot?: React.ReactNode;
}

export function ClientPageHeader({
  title,
  subtitle,
  eyebrow,
  rightSlot,
}: ClientPageHeaderProps) {
  const { company } = useAuth() as any;

  const brandPrimary = company?.primary_color || "#059669";
  const brandSecondary = company?.secondary_color || "#10b981";
  const brandGradient = `linear-gradient(135deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`;
  const companyName = eyebrow || company?.company_name || "Your portal";
  const companyLogo = company?.logo_url || null;

  return (
    <header
      className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 text-white shadow-md"
      style={{ background: brandGradient }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg flex-shrink-0">
            {companyLogo ? (
              <img
                src={companyLogo}
                alt={companyName}
                className="w-10 h-10 sm:w-12 sm:h-12 object-contain rounded-lg"
              />
            ) : (
              <ChefHat className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-white/80 font-medium truncate">
              {companyName}
            </p>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold truncate">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-xs sm:text-sm text-white/85 mt-1 max-w-2xl">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {rightSlot ? (
          <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
            {rightSlot}
          </div>
        ) : null}
      </div>
    </header>
  );
}
