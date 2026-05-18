/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * outsourceProviderService - Wave 67 Phase B.
 *
 * CRUD for the outsource_providers registry. Mirrors the
 * supplierService shape so the list page reads the same way as
 * /admin/suppliers, but the entity is per-event service providers
 * (on-site chefs, florists, photographers, security, sound) rather
 * than procurement vendors.
 *
 * Spend stats land in Phase E once outsource_assignments has
 * meaningful row counts. This service stays focused on registry CRUD.
 */
import { supabase } from "@/integrations/supabase/client";

export type OutsourceRateType = "per_event" | "per_hour" | "per_guest" | "quoted";
export type OutsourceContactChannel = "whatsapp" | "email" | "sms" | "phone";

export interface OutsourceProvider {
  id: string;
  company_id: string;
  provider_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  provider_roles: string[];
  specialty: string | null;
  service_radius_km: number | null;
  default_rate_type: OutsourceRateType;
  default_rate: number | null;
  default_currency: string;
  payment_terms_days: number | null;
  preferred_contact_channel: OutsourceContactChannel;
  notes: string | null;
  rating: number | null;
  linked_supplier_id: string | null;
  linked_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OutsourceProviderWithStats extends OutsourceProvider {
  assignment_count: number;
  accepted_count: number;
  cancelled_count: number;
  last_assignment_at: string | null;
}

/** Common role suggestions surfaced in the dropdown. Tenants can
 *  type their own (the column is a free TEXT[]) so this is just
 *  the curated quick-pick set. */
export const COMMON_ROLES: Array<{ value: string; label: string }> = [
  { value: "on_site_chef", label: "On-site chef" },
  { value: "florist", label: "Florist" },
  { value: "photographer", label: "Photographer" },
  { value: "videographer", label: "Videographer" },
  { value: "sound_engineer", label: "Sound engineer" },
  { value: "lighting", label: "Lighting" },
  { value: "decor", label: "Decor / styling" },
  { value: "marquee", label: "Marquee / tents" },
  { value: "security", label: "Security" },
  { value: "waiter_lead", label: "Waiter / floor lead" },
  { value: "bar_service", label: "Bar service" },
  { value: "transport", label: "Transport / shuttle" },
  { value: "musician", label: "Musician / band" },
  { value: "mc", label: "MC / host" },
  { value: "cleaning", label: "Cleaning crew" },
];

export const RATE_TYPE_OPTIONS: Array<{ value: OutsourceRateType; label: string; hint: string }> = [
  { value: "per_event", label: "Per event", hint: "Flat fee for the whole booking" },
  { value: "per_hour", label: "Per hour", hint: "Hourly rate * hours on site" },
  { value: "per_guest", label: "Per guest", hint: "Rate * final guest count" },
  { value: "quoted", label: "Quoted per booking", hint: "Negotiated each time" },
];

export const CONTACT_CHANNEL_OPTIONS: Array<{ value: OutsourceContactChannel; label: string }> = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "phone", label: "Phone call" },
];

export const outsourceProviderService = {
  /** List providers for a tenant, including a small stats roll-up
   *  computed client-side from outsource_assignments. */
  async listForCompany(companyId: string): Promise<OutsourceProviderWithStats[]> {
    const { data: providers, error } = await (supabase as any)
      .from("outsource_providers")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("is_active", { ascending: false })
      .order("provider_name", { ascending: true });
    if (error) {
      console.error("[outsourceProviderService.listForCompany] failed:", error);
      return [];
    }
    if (!providers || providers.length === 0) return [];

    const providerIds = (providers as OutsourceProvider[]).map((p) => p.id);
    const { data: assignmentRows, error: aErr } = await (supabase as any)
      .from("outsource_assignments")
      .select("provider_id, status, created_at")
      .eq("company_id", companyId)
      .in("provider_id", providerIds);
    if (aErr) console.warn("[outsourceProviderService] assignments rollup failed:", aErr);

    const statsByProvider = new Map<string, { count: number; accepted: number; cancelled: number; last: string | null }>();
    for (const a of (assignmentRows || []) as Array<{ provider_id: string; status: string; created_at: string }>) {
      const slot = statsByProvider.get(a.provider_id) || { count: 0, accepted: 0, cancelled: 0, last: null };
      slot.count += 1;
      if (a.status === "accepted" || a.status === "en_route" || a.status === "on_site" || a.status === "completed") {
        slot.accepted += 1;
      }
      if (a.status === "cancelled" || a.status === "declined") slot.cancelled += 1;
      if (!slot.last || a.created_at > slot.last) slot.last = a.created_at;
      statsByProvider.set(a.provider_id, slot);
    }

    return (providers as OutsourceProvider[]).map((p) => {
      const s = statsByProvider.get(p.id);
      return {
        ...p,
        assignment_count: s?.count ?? 0,
        accepted_count: s?.accepted ?? 0,
        cancelled_count: s?.cancelled ?? 0,
        last_assignment_at: s?.last ?? null,
      };
    });
  },

  async getById(providerId: string): Promise<OutsourceProvider | null> {
    const { data, error } = await (supabase as any)
      .from("outsource_providers")
      .select("*")
      .eq("id", providerId)
      .maybeSingle();
    if (error) { console.error("[outsourceProviderService.getById] failed:", error); return null; }
    return (data as OutsourceProvider | null) || null;
  },

  async create(args: {
    companyId: string;
    provider_name: string;
    contact_person?: string | null;
    email?: string | null;
    phone?: string | null;
    whatsapp_number?: string | null;
    provider_roles?: string[];
    specialty?: string | null;
    service_radius_km?: number | null;
    default_rate_type?: OutsourceRateType;
    default_rate?: number | null;
    default_currency?: string;
    payment_terms_days?: number | null;
    preferred_contact_channel?: OutsourceContactChannel;
    notes?: string | null;
    linked_supplier_id?: string | null;
  }): Promise<OutsourceProvider | null> {
    const { data, error } = await (supabase as any)
      .from("outsource_providers")
      .insert({
        company_id: args.companyId,
        provider_name: args.provider_name.trim(),
        contact_person: args.contact_person?.trim() || null,
        email: args.email?.trim() || null,
        phone: args.phone?.trim() || null,
        whatsapp_number: args.whatsapp_number?.trim() || null,
        provider_roles: args.provider_roles ?? [],
        specialty: args.specialty?.trim() || null,
        service_radius_km: args.service_radius_km ?? null,
        default_rate_type: args.default_rate_type ?? "per_event",
        default_rate: args.default_rate ?? null,
        default_currency: args.default_currency ?? "ZAR",
        payment_terms_days: args.payment_terms_days ?? null,
        preferred_contact_channel: args.preferred_contact_channel ?? "whatsapp",
        notes: args.notes?.trim() || null,
        linked_supplier_id: args.linked_supplier_id ?? null,
        is_active: true,
      })
      .select()
      .single();
    if (error) { console.error("[outsourceProviderService.create] failed:", error); return null; }
    return data as OutsourceProvider;
  },

  async update(providerId: string, patch: Partial<OutsourceProvider>): Promise<void> {
    const { error } = await (supabase as any)
      .from("outsource_providers")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", providerId);
    if (error) throw error;
  },

  async softDelete(providerId: string): Promise<void> {
    const { error } = await (supabase as any)
      .from("outsource_providers")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", providerId);
    if (error) throw error;
  },
};
