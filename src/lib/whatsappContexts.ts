import { formatLocalDate } from "@/lib/localFormat";
import { formatClock } from "@/lib/portalTime";
import type { ClientWhatsAppContext, ClientWhatsAppKind } from "@/lib/whatsappTemplates";

interface Contact {
  id?: string | null;
  contact_name?: string | null;
  client_name?: string | null;
  phone?: string | null;
}

export interface WhatsAppLead {
  contact_name?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  phone?: string | null;
  converted_to_client_id?: string | null;
  event_type?: string | null;
  event_date?: string | null;
  guest_count?: number | null;
  status?: string | null;
}

export interface WhatsAppOrder extends WhatsAppLead {
  client_id?: string | null;
  client?: Contact | null;
  clients?: Contact | null;
  order_number?: string | null;
  event_name?: string | null;
  setup_time?: string | null;
  delivery_time?: string | null;
  driver_name?: string | null;
}

interface WorkflowWhatsAppConfig {
  phone: string | null;
  clientId: string | null;
  ctx: ClientWhatsAppContext;
  templates: ClientWhatsAppKind[];
  defaultTemplate: ClientWhatsAppKind;
}

export function leadWhatsAppConfig(lead: WhatsAppLead): WorkflowWhatsAppConfig {
  return {
    phone: lead.client_phone || lead.phone || null,
    clientId: lead.converted_to_client_id || null,
    ctx: {
      contactName: lead.contact_name || lead.client_name || "Client",
      eventName: lead.event_type || null,
      eventDate: lead.event_date ? formatLocalDate(lead.event_date) : null,
      guestCount: lead.guest_count ?? null,
    },
    templates: ["lead_followup", "lead_details", "lead_chase"],
    defaultTemplate: !lead.status || lead.status === "new" ? "lead_followup" : "lead_chase",
  };
}

export function orderWhatsAppConfig(order: WhatsAppOrder): WorkflowWhatsAppConfig {
  const client = order.client || order.clients;
  const finished = ["cancelled", "completed", "delivered"].includes(order.status || "");
  return {
    phone: order.client_phone || order.phone || client?.phone || null,
    clientId: order.client_id || client?.id || null,
    ctx: {
      contactName: order.contact_name || client?.contact_name || order.client_name || client?.client_name || "Client",
      eventName: order.event_name || order.event_type || null,
      eventDate: order.event_date ? formatLocalDate(order.event_date) : null,
      orderRef: order.order_number || null,
      guestCount: order.guest_count ?? null,
      arrivalTime: order.setup_time || order.delivery_time ? formatClock(order.setup_time || order.delivery_time) : null,
      driverName: order.driver_name || null,
    },
    templates: finished ? ["order_update"] : ["order_update", "event_week", "event_day_morning", "event_arrived", "delay_alert"],
    defaultTemplate: "order_update",
  };
}
