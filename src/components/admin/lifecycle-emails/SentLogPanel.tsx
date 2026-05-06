/**
 * SentLogPanel -- after-sales emails sent log surface.
 *
 * Extracted from /admin/after-sales-emails. That page was previously a
 * redirect stub pointing at /admin/messaging-templates -- so this panel
 * shows an equivalent "moved" notice without auto-redirecting (the
 * redirect would yank the user out of the Lifecycle Emails hub mid-tab).
 *
 * The standalone wrapper page keeps its own auto-redirect for legacy
 * bookmark links. When the real sent-log surface lands later it drops
 * in here without touching the hub.
 *
 * Pure component: no AdminNav / NoIndexMeta / page header -- those are
 * page concerns. This is just the body.
 */
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, ArrowRight } from "lucide-react";

export function SentLogPanel() {
  return (
    <div className="flex items-center justify-center p-6">
      <Card className="border-0 shadow-lg max-w-md w-full">
        <CardContent className="py-8 px-6 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-100 flex items-center justify-center">
            <Mail className="w-6 h-6 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">After-sales sent log</h2>
          <p className="text-sm text-slate-600">
            Post-event templates now live alongside lead and quote templates on the Templates tab next door, so company customisations stay in one place. The dedicated sent log for after-sales touchpoints has folded into the Automation tab's audit feed.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Link href="/admin/email-templates?tab=templates">
              <Button variant="outline" className="gap-2 w-full sm:w-auto">
                Open Templates tab <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/admin/email-templates?tab=automation">
              <Button className="gap-2 w-full sm:w-auto">
                Open Automation tab <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SentLogPanel;
