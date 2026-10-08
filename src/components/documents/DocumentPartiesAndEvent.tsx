import { Calendar, FileText, MapPin, Users } from "lucide-react";

type Party = {
  name?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  taxNumber?: string | null;
};

type EventDetails = {
  reference?: string | null;
  referenceLabel?: string;
  date?: string | null;
  time?: string | null;
  venue?: string | null;
  guests?: number | string | null;
};

interface DocumentPartiesAndEventProps {
  from: Party;
  billTo: Party;
  event: EventDetails;
}

/**
 * The identity block shared by customer-facing quotes and invoices.
 *
 * Contact details need room to wrap naturally. Event facts are deliberately
 * placed below them in labelled tiles instead of an inline sentence, so a
 * long date, time and venue never split into a confusing visual row.
 */
export function DocumentPartiesAndEvent({
  from,
  billTo,
  event,
}: DocumentPartiesAndEventProps) {
  const hasEventDetails = Boolean(
    event.reference || event.date || event.time || event.venue || event.guests != null,
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        <PartyDetails label="From" party={from} />
        <PartyDetails label="Bill to" party={billTo} />
      </div>

      {hasEventDetails && (
        <section className="border-t border-stone-200 pt-4" aria-label="Event details">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand-primary">
            Event details
          </p>
          <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {event.reference && (
              <EventFact
                icon={FileText}
                label={event.referenceLabel || "Order"}
                value={event.reference}
              />
            )}
            {(event.date || event.time) && (
              <EventFact
                icon={Calendar}
                label="When"
                value={[event.date, event.time].filter(Boolean).join(" · ")}
              />
            )}
            {event.guests != null && event.guests !== "" && (
              <EventFact icon={Users} label="Guests" value={String(event.guests)} />
            )}
            {event.venue && (
              <EventFact
                icon={MapPin}
                label="Venue"
                value={event.venue}
                className="sm:col-span-2"
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function PartyDetails({ label, party }: { label: string; party: Party }) {
  return (
    <section className="min-w-0 rounded-xl border border-stone-100 bg-stone-50/60 px-4 py-3.5">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-brand-primary">
        {label}
      </p>
      {party.name && <p className="break-words text-sm font-semibold text-stone-900">{party.name}</p>}
      {party.address && <p className="mt-0.5 break-words text-xs leading-relaxed text-stone-600">{party.address}</p>}
      {party.email && <p className="break-all text-xs leading-relaxed text-stone-600">{party.email}</p>}
      {party.phone && <p className="text-xs leading-relaxed text-stone-600">{party.phone}</p>}
      {party.taxNumber && (
        <p className="text-xs leading-relaxed text-stone-600">
          Customer VAT No: <span className="font-mono">{party.taxNumber}</span>
        </p>
      )}
    </section>
  );
}

function EventFact({
  icon: Icon,
  label,
  value,
  className = "",
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 items-start gap-2.5 rounded-lg border border-stone-100 bg-stone-50/70 px-3 py-2.5 ${className}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-primary" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">{label}</p>
        <p className="mt-0.5 break-words text-xs font-semibold leading-snug text-stone-900">{value}</p>
      </div>
    </div>
  );
}
