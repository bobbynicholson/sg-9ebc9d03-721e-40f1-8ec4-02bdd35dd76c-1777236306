import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Mail } from "lucide-react";
import Link from "next/link";

interface Props {
  /** Tenant-scoped href to the After-Sales Emails editor. */
  templatesHref: string;
}

const TIMELINE = [
  { months: 2, title: "Initial Feedback Request", desc: "How was your event?" },
  { months: 4, title: "New Services Introduction", desc: "Share menu updates & special offers" },
  { months: 6, title: "Seasonal Check-in", desc: "Perfect timing for celebrations" },
  { months: 8, title: "VIP Benefits Reminder", desc: "Exclusive discounts & priority booking" },
  { months: 10, title: "Year-End Planning", desc: "Holiday events & new year bookings" },
  { months: 12, title: "Anniversary Celebration", desc: "Special thank you & biggest discount" },
];

/**
 * Email-automation tab for /admin/settings. Pure informational
 * summary of the 12-month, six-email post-event journey; actual
 * template editing lives on /admin/after-sales-emails. The parent
 * passes a tenant-scoped href so this component stays free of
 * useTenantHref.
 *
 * Extracted from inline in src/pages/admin/settings.tsx (P2-13
 * Phase F settings split).
 */
export function EmailAutomationSettingsTab({ templatesHref }: Props) {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
          <Mail className="w-4 h-4 md:w-5 md:h-5" />
          After-Sales Email Automation
          <InfoTooltip
            content={
              "Quick summary of the 12-month, six-email post-event journey.\n\nEdit the actual wording over on the After-Sales Emails page."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 md:px-6">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 md:p-6 border border-blue-200">
          <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base md:text-lg mb-2">Intelligent Follow-Up System</h3>
              <p className="text-sm md:text-base text-slate-700 mb-3 md:mb-4">
                Automatically nurture client relationships with 6 strategic emails sent over 12 months after each event.
              </p>
              <div className="grid grid-cols-3 gap-2 md:gap-4 mb-3 md:mb-4">
                <div className="bg-white rounded-lg p-2 md:p-3 text-center">
                  <div className="text-xl md:text-2xl font-bold text-blue-600">6</div>
                  <div className="text-xs text-slate-600">Strategic Emails</div>
                </div>
                <div className="bg-white rounded-lg p-2 md:p-3 text-center">
                  <div className="text-xl md:text-2xl font-bold text-green-600">12</div>
                  <div className="text-xs text-slate-600">Month Journey</div>
                </div>
                <div className="bg-white rounded-lg p-2 md:p-3 text-center">
                  <div className="text-xl md:text-2xl font-bold text-purple-600">Auto</div>
                  <div className="text-xs text-slate-600">Fully Automated</div>
                </div>
              </div>
              <Link href={templatesHref}>
                <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700">
                  Manage Email Templates
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Email Journey Timeline:</h4>
          <div className="space-y-2">
            {TIMELINE.map((email, index) => (
              <div
                key={index}
                className="flex items-center gap-2 md:gap-3 p-2 md:p-3 bg-white rounded-lg border"
              >
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {email.months}mo
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-xs md:text-sm">{email.title}</p>
                  <p className="text-xs text-slate-600 truncate">{email.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
