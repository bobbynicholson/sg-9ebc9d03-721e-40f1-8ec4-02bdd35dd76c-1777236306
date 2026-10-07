/**
 * ImportWhatHappensNote - warning shown on every import entry point so
 * whoever runs an import knows which emails their clients will NOT
 * receive for imported records.
 *
 * Keep this in step with the import pipeline: imports no longer pause
 * emails (2026-10-07), but imported orders are still treated as booked
 * in the old system (no auto invoice, kitchen prep or event emails -
 * see ensureInvoiceForOrder, kitchenPrepService and orderWorkflow).
 */
import { AlertTriangle } from "lucide-react";

export function ImportWhatHappensNote({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 ${className}`}>
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
        Imported orders don&apos;t send emails to your clients
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-900">
        The system treats imported orders as already booked in your old system, so for those
        orders your clients will <strong>not</strong> receive:
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-6 text-xs leading-relaxed text-amber-900">
        <li>a deposit invoice or payment request email</li>
        <li>before-event reminder emails</li>
        <li>after-event thank-you and follow-up emails</li>
      </ul>
      <p className="mt-1.5 text-xs leading-relaxed text-amber-900">
        Kitchen prep tasks aren&apos;t created for them either. If an imported event is still
        upcoming, raise and send its invoice by hand and contact the client yourself.
      </p>
      <p className="mt-2 border-t border-amber-200 pt-2 text-xs leading-relaxed text-amber-900">
        <strong>Imported clients</strong> are live straight away: anything you send them by hand
        (quotes, invoices, messages) and orders you create for them in the app email as normal.
        Contacts who unsubscribed or that you blocked are never emailed. A completed import can be
        rolled back from Imports history within 24 hours.
      </p>
    </div>
  );
}
