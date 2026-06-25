/**
 * AutomationSettingsPanel - settings pointer card.
 *
 * Wave 50 LCF-M (task #235): the previous panel was a localStorage-only
 * stub that duplicated /admin/email-settings (real SMTP / provider
 * configuration) and the Templates tab (now backed by the central
 * TEMPLATE_REGISTRY). It saved to localStorage and never actually
 * routed a real send.
 *
 * Rather than leaving a fake editor that misleads operators into
 * thinking they've configured something, this tab now points at the
 * real surfaces and explains the IA. The /admin/email-settings page
 * is the canonical place for SMTP / Resend / Postmark / SendGrid
 * provider config (DKIM verification, send-from address, deliverability
 * health). The Templates tab on this page owns wording, subject and
 * variables for every system-driven message.
 *
 * Pure component: no AdminNav / NoIndexMeta / page header - those are
 * page concerns.
 */
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Settings, ArrowRight, Pencil, Send } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";

export function AutomationSettingsPanel() {
  const { withSlug } = useTenantHref();

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm bg-blue-50">
        <CardContent className="py-4 px-5 flex items-start gap-3">
          <Settings className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-900 leading-relaxed">
            <p className="font-semibold mb-1">Settings live where the action happens.</p>
            <p>
              Configuring who emails come from, which SMTP / Resend account they go through, and how deliverability is monitored is one page over. Editing the wording of any specific message lives on the Templates tab.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
          <CardContent className="p-5 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Email provider settings</h3>
              <p className="text-sm text-slate-600 mt-1">
                SMTP / Resend / Postmark / SendGrid credentials, send-from address, DKIM verification, deliverability health checks.
              </p>
            </div>
            <Link href={withSlug("/admin/email-settings")}>
              <Button variant="outline" className="w-full gap-1.5">
                Open email settings <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
          <CardContent className="p-5 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <Pencil className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Edit message templates</h3>
              <p className="text-sm text-slate-600 mt-1">
                Every system-driven email and WhatsApp message - lifecycle, after-sales, reminders, lead alerts, account emails. Customise the wording, save per-tenant, send a test to yourself.
              </p>
            </div>
            <Link href={withSlug("/admin/email-templates?tab=templates")}>
              <Button variant="outline" className="w-full gap-1.5">
                Open Templates tab <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="py-4 px-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <Send className="w-4 h-4 text-amber-700" />
            </div>
            <div className="text-sm text-slate-700 leading-relaxed">
              <p className="font-semibold text-slate-900 mb-1">Testing what an email looks like</p>
              <p>
                Each template row in the Templates tab has a <em>Send test {`{email/WhatsApp}`} to me</em> button in the editor drawer. It renders the live template (with example data filled in) and ships it to your own inbox / WhatsApp - the fastest way to eyeball a wording change before it lands on a real client.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-slate-500 text-center">
        The legacy SMTP form that used to live here has been retired. It saved to your browser only and never drove a real send.
      </p>
    </div>
  );
}

export default AutomationSettingsPanel;
