/**
 * ODOC: order header - the title block every viewer sees the same way.
 *
 * Mirrors the visual language of the client portal HeroCard (which
 * Bobby cited as the reference) without the live tracking widgets.
 * Client name, event title, date, time, venue, guest count, status.
 */
import { CollapsibleSection } from "./CollapsibleSection";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Clock, MapPin, Users, User, Mail, Phone, FileText } from "lucide-react";

interface Props {
  order: {
    id: string;
    order_number: string | null;
    event_name: string | null;
    event_date: string;
    event_time: string | null;
    venue_name: string | null;
    venue_address: string | null;
    guest_count: number | null;
    status: string;
    client_name: string | null;
    client_email: string | null;
    client_phone: string | null;
    special_instructions: string | null;
    kitchen_instructions: string | null;
  };
  defaultOpen?: boolean;
  forceOpen?: boolean;
}

const STATUS_TONES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700 border-slate-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  preparing: "bg-orange-100 text-orange-800 border-orange-200",
  ready: "bg-amber-100 text-amber-800 border-amber-200",
  in_transit: "bg-purple-100 text-purple-800 border-purple-200",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  paused: "bg-blue-50 text-blue-700 border-blue-200",
};

export function OrderHeaderSection({ order, defaultOpen, forceOpen }: Props) {
  const tone = STATUS_TONES[order.status?.toLowerCase()] || STATUS_TONES.confirmed;
  const eventDateLong = new Date(order.event_date).toLocaleDateString("en-ZA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const summary = `${order.client_name || "Client"} - ${eventDateLong}${order.event_time ? ` ${order.event_time.slice(0, 5)}` : ""}`;
  return (
    <CollapsibleSection
      id="section-header"
      title={order.event_name || order.client_name || `Order ${order.order_number || ""}`.trim() || "Order"}
      summary={summary}
      icon={FileText}
      accent="slate"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Event</p>
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <CalendarIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span>{eventDateLong}</span>
          </div>
          {order.event_time && (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span>{order.event_time.slice(0, 5)}</span>
            </div>
          )}
          {order.guest_count != null && order.guest_count > 0 && (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span>{order.guest_count} guest{order.guest_count === 1 ? "" : "s"}</span>
            </div>
          )}
          {(order.venue_name || order.venue_address) && (
            <div className="flex items-start gap-2 text-sm text-slate-700">
              <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                {order.venue_name && <p className="font-medium">{order.venue_name}</p>}
                {order.venue_address && <p className="text-xs text-slate-500">{order.venue_address}</p>}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Client</p>
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span>{order.client_name || "—"}</span>
          </div>
          {order.client_email && (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <a href={`mailto:${order.client_email}`} className="hover:underline truncate">{order.client_email}</a>
            </div>
          )}
          {order.client_phone && (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <a href={`tel:${order.client_phone}`} className="hover:underline">{order.client_phone}</a>
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Badge variant="outline" className={`${tone} capitalize text-xs`}>
              {order.status?.replace(/_/g, " ")}
            </Badge>
            {order.order_number && (
              <span className="text-xs text-slate-500 tabular-nums">#{order.order_number}</span>
            )}
          </div>
        </div>
      </div>
      {(order.special_instructions || order.kitchen_instructions) && (
        <div className="mt-4 pt-4 border-t border-slate-200 space-y-2 text-sm">
          {order.special_instructions && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Special instructions</p>
              <p className="text-slate-700 whitespace-pre-wrap">{order.special_instructions}</p>
            </div>
          )}
          {order.kitchen_instructions && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Kitchen notes</p>
              <p className="text-slate-700 whitespace-pre-wrap">{order.kitchen_instructions}</p>
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
