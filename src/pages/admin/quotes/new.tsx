/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Quote Builder - /admin/quotes/new and /admin/quotes/new?leadId=...
 *
 * The page Callum lives on. The whole point is to kill the
 * Xero -> PDF -> email -> attach -> send loop. One screen, one save,
 * one send.
 *
 * Architectural decisions (the panel of 20 settled on these after a
 * lot of arguing):
 *
 *  A. PERSISTENCE
 *     - Real Supabase writes only. The previous version saved to
 *       localStorage which is why quotes disappeared. The first save
 *       INSERTs and stashes the new id; every subsequent edit UPDATEs
 *       that same row.
 *     - Auto-save drafts every 1.5 s after the last edit (debounced).
 *       Toast "Saved" is intentionally subtle.
 *     - Send flips status='draft' -> 'sent' and stamps sent_at. The
 *       existing trg_quote_sent_email trigger queues the branded
 *       email, so "Save & Send" really does close the loop.
 *
 *  B. PRICING INTELLIGENCE
 *     - Per-line "pricing mode" toggle: per_person | per_portion | flat
 *         per_person -> auto-multiplies by guest count, edits cascade
 *         per_portion -> the team sets quantity (e.g. trays of salad)
 *         flat -> single line item (delivery surcharge, hire fee)
 *     - Per-line discount % so a "regular client gets 10% off lamb".
 *     - Quote-level adjustments:
 *         surge %: weekend / public-holiday uplift (pre-discount, so
 *           it acts on the rack rate)
 *         discount %: applied AFTER surge
 *         flat discount: subtract a Rand amount before tax
 *     - Tax (VAT 15%) and delivery still apply as today.
 *     - Margin is a future hook but the cost field is preserved on
 *       each line so the next iteration just reads it.
 *
 *  C. VALIDITY
 *     - valid_until defaults to today + 30 days, editable.
 *     - Surfaces an "Expires in Nd" pill so the team thinks about it.
 *
 *  D. SUMMARY PANEL
 *     - Sticky on the right (desktop), collapsible on mobile.
 *     - Shows a "what the client sees" mini-preview underneath the
 *       running total so Callum doesn't have to re-open the email
 *       template.
 *
 *  E. LEAD LINKAGE
 *     - leadId in the URL pre-fills the form AND links the quote
 *       (quotes.lead_id = lead.id) AND flips lead.status to 'quoted'
 *       on first save.
 *
 *  F. SECURITY
 *     - Every Supabase write uses the user's session, RLS scopes
 *       inserts/updates to the caller's company. Tenant-isolated by
 *       construction.
 */
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, ArrowLeft, Save, Send, Plus, Trash2, MapPin, Sparkles,
  Loader2, CheckCircle2, AlertTriangle, Eye, Calendar, Users, Mail, Phone,
  Percent, TrendingUp, Wand2, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { AddressAutocomplete } from "@/components/admin/AddressAutocomplete";
import { useCompanyKitchens, type KitchenOption } from "@/hooks/useCompanyKitchens";
import { dispatchService } from "@/services/dispatchService";
import { resolveDefaultRegionId } from "@/lib/defaultRegion";
import { resolveBranchSettings } from "@/services/branchSettingsService";
import { suggestKitchenForDate, type CapacitySuggestion } from "@/services/kitchenCapacityService";
import { ClientTypeahead } from "@/components/admin/ClientTypeahead";
import { MenuItemTypeahead, MenuItemPick } from "@/components/admin/MenuItemTypeahead";
import { AllergenReviewBadge } from "@/components/admin/AllergenReviewBadge";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EquipmentTypeahead, EquipmentPick } from "@/components/admin/EquipmentTypeahead";
import {
  getEquipmentAvailability,
  getEquipmentMeta,
  splitQuantity,
  type EquipmentAvailability,
} from "@/services/equipmentAvailabilityService";
import { quoteIntelligenceService, KnownClientResult, ClientSnapshot } from "@/services/quoteIntelligenceService";
import Head from "next/head";
import { ChatBot } from "@/components/ChatBot";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { quoteService } from "@/services/quoteService";
import { propagateQuoteEditToOrder } from "@/services/quote/propagateQuoteEdit";
import { QuoteSendDialog } from "@/components/billing/QuoteSendDialog";
import { toLocalISO } from "@/lib/localDate";
import { EntityNotesThread } from "@/components/admin/EntityNotesThread";

// ── Types ─────────────────────────────────────────────────────────────

type PricingMode = "per_person" | "per_portion" | "flat";

interface LineItem {
  /** Stable client-side id - not persisted. */
  id: string;
  /** When linked to the company's menu_items table. */
  menu_item_id: string | null;
  name: string;
  description?: string;
  category: string | null;
  dietary_tags: string[] | null;
  pricingMode: PricingMode;
  unitPrice: number;
  /** For per_person: copy of guestCount. per_portion: portions. flat: 1. */
  quantity: number;
  /**
   * Flow audit Leg B P0-9: when the operator types a non-default
   * quantity on a per_person line ("vegetarian for 5 of 100"),
   * subsequent guestCount changes used to clobber it back to the new
   * guestCount. Flag flips true the moment the operator overrides
   * the line and stays true for the lifetime of the row, so the
   * guestCount cascade leaves overridden lines alone.
   */
  quantityOverridden?: boolean;
  /** Per-line discount in percent (0-100). */
  discountPct: number;
  /** Optional cost-per-unit copied off menu_items.cost_per_unit - preserved
   *  for the future margin tracker, not displayed yet. */
  costPerUnit?: number;
  /** Phase 2 #7: timestamp from menu_items.allergens_reviewed_at when
   *  the line was picked from the catalogue. NULL means the kitchen
   *  lead never signed off - the quote builder warns at accept time. */
  allergensReviewedAt?: string | null;
}

interface EquipmentLineItem {
  id: string;
  /** When linked to the company's equipment catalog. */
  equipment_id: string | null;
  name: string;
  category: string | null;
  quantity: number;
  unitPrice: number;
  /** Carried through so the kitchen + driver views can spot stockouts. */
  availableQuantity?: number | null;
  /** What the company pays per unit when they hire-in extra to fulfil
   *  this booking (loaded from equipment.hire_in_cost when picked). */
  hireInCost?: number;
}

// Per-line live availability snapshot, keyed by line id. Loaded
// asynchronously when the line is linked to a catalog row AND we have
// an event date. Surfaces "owned / reserved on this date / free" and
// drives the from-stock vs hire-in split display.
type AvailabilityMap = Record<string, EquipmentAvailability | "loading" | undefined>;

const LINE_CATEGORIES = [
  { value: "starter", label: "Starter" },
  { value: "main", label: "Main" },
  { value: "side", label: "Side" },
  { value: "salad", label: "Salad" },
  { value: "dessert", label: "Dessert" },
  { value: "beverage", label: "Beverage" },
  { value: "other", label: "Other" },
];

const PRICING_LABEL: Record<PricingMode, string> = {
  per_person: "/ guest",
  per_portion: "/ portion",
  flat: "flat",
};

const TAX_RATE = 0.15;
const DEFAULT_VALIDITY_DAYS = 30;
const AUTOSAVE_DELAY_MS = 1500;

// Phase 6 #1: tenant-currency-aware money formatter. The module-
// level fmtR was hard-coded to "R " + en-ZA; on a UK/US tenant the
// builder still showed "R 1,234.56" instead of "£1,234.56". Now
// fmtR reads through a module-level _currentFmt that the component
// sets when the tenant currency resolves - every existing
// fmtR(...) call site stays unchanged because the closure re-reads
// the underlying formatter each call.
const CURRENCY_LOCALES: Record<string, string> = {
  ZAR: "en-ZA",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "en-GB",
  AUD: "en-AU",
};
function makeFmtMoney(code: string | null | undefined): (v: number) => string {
  const safe = (code && code in CURRENCY_LOCALES ? code : "ZAR") as keyof typeof CURRENCY_LOCALES;
  const locale = CURRENCY_LOCALES[safe];
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: safe,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (v: number) => fmt.format(Number.isFinite(v) ? v : 0);
}
let _currentFmt = makeFmtMoney("ZAR");
const fmtR = (v: number) => _currentFmt(v);
function setQuoteBuilderCurrency(code: string | null | undefined): void {
  _currentFmt = makeFmtMoney(code);
}

const safeNum = (n: any) => {
  const v = typeof n === "string" ? parseFloat(n) : Number(n);
  return Number.isFinite(v) ? v : 0;
};

const todayISO = () => toLocalISO(new Date());
const futureISO = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalISO(d);
};

// Quote-number generator: QT-YYYYMMDD-XXXXXX (six hex chars). The
// existing data uses sequential 001/002/003; we don't have a counter
// available client-side, so the random suffix keeps uniqueness without
// a round-trip. Visually distinct from REQ- (client portal).
function newQuoteNumber(): string {
  const date = todayISO().replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `QT-${date}-${rand}`;
}

// ── Page ─────────────────────────────────────────────────────────────

// QTS-A (QTS-8): admit sales_admin + region_admin to match the
// index + [id] wrappers. sales_admin is the page's primary user.
export default function ProtectedNewQuotePage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <NewQuotePage />
    </ProtectedRoute>
  );
}

function NewQuotePage() {
  const router = useRouter();
  const { user } = useAuth() as any;
  const { toast } = useToast();
  // Wave 27: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { leadId, fromQuoteId } = router.query;
  const companyId = (user?.user_metadata?.company_id as string | undefined) || null;

  // Phase 6 #1: tenant-currency-aware money formatter. Hook resolves
  // the tenant's currency (companies.currency, ZAR default) and we
  // rebind the module-level formatter so every existing fmtR(...)
  // call site renders in the tenant's currency without diffing 37
  // individual call sites.
  const tenantCurrency = useTenantCurrency(companyId);
  useEffect(() => {
    setQuoteBuilderCurrency(tenantCurrency.code);
  }, [tenantCurrency.code]);

  // ── Form state ─────────────────────────────────────────────────────
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientSnapshot, setClientSnapshot] = useState<ClientSnapshot | null>(null);

  const [clientName, setClientName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  // Distinct from event start time: a morning setup for an evening
  // event is normal at big functions, so the operator gets an
  // explicit field they can override (defaults to event_time minus
  // the operations.deliveryBufferMinutes setting - see
  // suggestedSetupTime below).
  const [setupTime, setSetupTime] = useState("");
  /** Operations buffer in minutes (default 30 if the operator
   *  hasn't customised settings.operations.deliveryBufferMinutes).
   *  Drives the suggested setup time shown next to the time input. */
  const [deliveryBufferMins, setDeliveryBufferMins] = useState(30);
  const [guestCount, setGuestCount] = useState(0);
  const [venueAddress, setVenueAddress] = useState("");
  const [venueLat, setVenueLat] = useState<number | null>(null);
  const [venueLng, setVenueLng] = useState<number | null>(null);

  const [menuItems, setMenuItems] = useState<LineItem[]>([
    {
      id: "L1",
      menu_item_id: null,
      name: "",
      category: "main",
      dietary_tags: null,
      pricingMode: "per_person",
      unitPrice: 0,
      quantity: 0,
      discountPct: 0,
    },
  ]);
  const [equipment, setEquipment] = useState<EquipmentLineItem[]>([]);
  // Live availability per equipment line. Refetches when the event
  // date or the picked equipment_id changes. Used to compute the
  // from-stock vs hire-in split on the fly.
  const [availability, setAvailability] = useState<AvailabilityMap>({});

  const [deliveryDistance, setDeliveryDistance] = useState(0);
  // Wave 11 #7: this used to default to 8.5 (ZAR-flavoured magic
  // number). UK / US / non-ZA tenants got a R8.50/km auto-fee
  // injected before the branch resolver ran, then the resolver
  // overwrote it - but the visible-on-screen flicker showed the
  // wrong number. Default to 0; resolveBranchSettings populates
  // the real rate per tenant + region a tick later.
  const [deliveryCostPerKm, setDeliveryCostPerKm] = useState(0);
  const [minDeliveryFee, setMinDeliveryFee] = useState(0);
  /** Effective VAT rate, resolved from region override or company
   *  default. Held in state because it changes when the operator
   *  switches kitchen on a multi-branch quote. */
  const [taxRate, setTaxRate] = useState(0.15);
  /** Whether the tenant enters prices INC-VAT (vs ex-VAT). Resolved
   *  from companies.pricing_includes_vat. Drives the quote math
   *  below: when true, line totals are gross and we derive ex-VAT
   *  by dividing back; when false (default), VAT is added on top. */
  const [pricingIncludesVat, setPricingIncludesVat] = useState(false);
  /** Effective deposit percentage. Stamped onto the quote at save so
   *  downstream order + invoice generation honour the branch override
   *  without re-resolving. */
  const [depositPercent, setDepositPercent] = useState(30);
  const [deliveryFee, setDeliveryFee] = useState(0);
  /** True once the operator has manually overridden the auto-fee.
   *  Stops subsequent auto-recalcs from clobbering their override. */
  const [deliveryFeeOverridden, setDeliveryFeeOverridden] = useState(false);
  /** Available kitchens for this company (active branches + HQ). */
  const { kitchens } = useCompanyKitchens(companyId || null);
  /** Currently picked kitchen the delivery is leaving from. Defaults
   *  to the first available kitchen on load; operator switches via
   *  the picker when the company has more than one branch. */
  const [kitchenId, setKitchenId] = useState<string | null>(null);
  const selectedKitchen: KitchenOption | null =
    kitchens.find((k) => k.id === kitchenId) || kitchens[0] || null;

  // Default the picker to the first kitchen once they load. Re-runs
  // if the operator's company switches (super_admin scenario).
  useEffect(() => {
    if (!kitchenId && kitchens.length > 0) {
      setKitchenId(kitchens[0].id);
    }
  }, [kitchens, kitchenId]);

  // Capacity-based kitchen suggestion. Triggers whenever the event
  // date or the set of available kitchens changes. The hint appears
  // next to the kitchen picker so the operator can swap to a less
  // busy branch on a known-busy date without having to dig through
  // /admin/regions or the calendar.
  const [capacitySuggestion, setCapacitySuggestion] = useState<CapacitySuggestion | null>(null);
  useEffect(() => {
    if (!companyId || !eventDate) { setCapacitySuggestion(null); return; }
    const candidates = kitchens.filter((k) => k.source === "region").map((k) => k.id);
    if (candidates.length <= 1) { setCapacitySuggestion(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const s = await suggestKitchenForDate(companyId, eventDate, candidates);
        if (!cancelled) setCapacitySuggestion(s);
      } catch (e) {
        console.warn("[quotes/new] capacity suggestion failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, eventDate, kitchens]);

  const [surgePct, setSurgePct] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountFlat, setDiscountFlat] = useState(0);

  const [validUntil, setValidUntil] = useState(futureISO(DEFAULT_VALIDITY_DAYS));
  const [internalNotes, setInternalNotes] = useState("");
  const [clientNotes, setClientNotes] = useState("");

  // ── Persistence state ─────────────────────────────────────────────
  /** The id of the row in `quotes` once it's been saved. Null until then. */
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quoteNumber, setQuoteNumber] = useState<string | null>(null);
  // Wave 12 audit: capture the persisted total at hydrate time so we
  // can warn when the live recompute drifts away from it - happens
  // when the operator opens an old quote whose persisted columns
  // were calculated under different VAT math (e.g. before the
  // pricing_includes_vat flag was flipped). The customer-facing
  // /q/[token] view reads the persisted columns; until the operator
  // hits Save, the public view shows stale numbers.
  const [persistedTotalAtLoad, setPersistedTotalAtLoad] = useState<number | null>(null);
  // Wave 14 audit: track whether we arrived via "Revise & resend" so
  // the banner copy and the save side-effects know to reset the
  // public lifecycle (clear accepted_at / viewed_at, auto-address
  // pending change requests). True when the source quote (fromQuoteId)
  // was past 'draft' status at hydrate time.
  const [isRevisingNonDraft, setIsRevisingNonDraft] = useState<boolean>(false);
  // TIGHTEN I.120 (2026-06-02): track whether the loaded quote already
  // has a linked order. When set, the banner + button copy reflect
  // "update the order" instead of "send to the client for acceptance",
  // and Save / Save & Send both propagate to the order without firing
  // the quote-ready email.
  const [linkedOrderId, setLinkedOrderId] = useState<string | null>(null);
  const [linkedOrderNumber, setLinkedOrderNumber] = useState<string | null>(null);
  const isConvertedQuote = !!linkedOrderId;
  const [status, setStatus] = useState<"draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired" | "revised" | "pending">("draft");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [allergenGateOpen, setAllergenGateOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // ── Computed totals ───────────────────────────────────────────────
  const computed = useMemo(() => {
    const lineFigures = menuItems.map((it) => {
      // Per-guest lines default to the global guest count, but the
      // operator can override per line (vegetarian for 2, normal lamb
      // for 98 of a 100-guest event). A non-null line.quantity always
      // wins; null falls back to guestCount.
      const q =
        it.pricingMode === "per_person"
          ? (typeof it.quantity === "number" && it.quantity > 0 ? it.quantity : guestCount)
          : it.pricingMode === "flat"
            ? 1
            : it.quantity;
      const gross = it.unitPrice * q;
      const net = gross * (1 - it.discountPct / 100);
      return { gross, net };
    });
    const equipmentFigures = equipment.map((eq) => ({
      gross: eq.unitPrice * eq.quantity,
      net: eq.unitPrice * eq.quantity,
    }));
    const itemsGross =
      lineFigures.reduce((s, f) => s + f.gross, 0) +
      equipmentFigures.reduce((s, f) => s + f.gross, 0);
    const lineDiscounts =
      lineFigures.reduce((s, f) => s + (f.gross - f.net), 0);
    const itemsNet = itemsGross - lineDiscounts;

    const surge = itemsNet * (surgePct / 100);
    const afterSurge = itemsNet + surge;

    const pctDiscount = afterSurge * (discountPct / 100);
    const afterDiscounts = afterSurge - pctDiscount - discountFlat;

    // Convention switch. When the tenant enters prices inc-VAT, the
    // line sums + delivery fee + discounts are all gross numbers; we
    // derive the ex-VAT subtotal by dividing back. When ex-VAT (the
    // historic default), VAT is added on top.
    const grossOrNet = afterDiscounts + deliveryFee;
    let subtotal: number;
    let tax: number;
    let total: number;
    if (pricingIncludesVat) {
      total = Number(grossOrNet.toFixed(2));
      subtotal = Number((total / (1 + taxRate)).toFixed(2));
      tax = Number((total - subtotal).toFixed(2));
    } else {
      subtotal = Number(grossOrNet.toFixed(2));
      tax = Number((subtotal * taxRate).toFixed(2));
      total = Number((subtotal + tax).toFixed(2));
    }

    return {
      lineFigures,
      itemsGross,
      lineDiscounts,
      itemsNet,
      surge,
      pctDiscount,
      flatDiscount: discountFlat,
      afterDiscounts,
      deliveryFee,
      subtotal,
      tax,
      total,
    };
  }, [menuItems, equipment, guestCount, surgePct, discountPct, discountFlat, deliveryFee, taxRate, pricingIncludesVat]);

  // ── Pre-fill: load company default delivery buffer ─────────────────
  // Wave 11 #7: this used to also pull deliveryCostPerKm from a global
  // localStorage key 'admin_settings'. That key was unscoped, so a
  // platform user who switched tenants saw the previous tenant's rate
  // bleed in. The branch resolver above (resolveBranchSettings) is
  // the canonical source for delivery rate per tenant + region.
  // Buffer minutes stays for now - it's a per-operator UX preference
  // (when does the driver leave the kitchen relative to start time)
  // rather than tenant data. Scope by companyId so the buffer doesn't
  // bleed across tenants either.
  useEffect(() => {
    if (typeof window === "undefined" || !companyId) return;
    try {
      const raw = localStorage.getItem(`admin_settings.${companyId}`);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s?.operations?.deliveryBufferMinutes === "number") {
        setDeliveryBufferMins(s.operations.deliveryBufferMinutes);
      }
    } catch {
      /* ignore */
    }
  }, [companyId]);

  /** Suggested setup time = event_time - delivery buffer, formatted
   *  HH:MM. Returns null when there's no event time yet. The operator
   *  sees this as a hint next to the Setup Time input and can either
   *  use it (one click) or type their own (e.g. morning setup for an
   *  evening wedding). */
  const suggestedSetupTime = useMemo(() => {
    if (!eventTime) return null;
    const [hStr, mStr] = eventTime.split(":");
    const h = Number(hStr);
    const m = Number(mStr || 0);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const totalMins = h * 60 + m - deliveryBufferMins;
    if (totalMins < 0) return null; // event is too early in the day for the buffer
    const sh = Math.floor(totalMins / 60);
    const sm = totalMins % 60;
    return `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
  }, [eventTime, deliveryBufferMins]);

  // ── Pre-fill: load lead when ?leadId=... ──────────────────────────
  // Deps include user.id so the effect re-runs once auth settles.
  // Without that, the first render fires while the session is still
  // restoring, RLS blocks the read, and the form sits empty even
  // though the URL has the leadId.
  useEffect(() => {
    if (!leadId || typeof leadId !== "string") return;
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data: lead, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .maybeSingle();
      if (cancelled || error || !lead) {
        if (error) console.warn("[new quote] lead pre-fill failed:", error.message);
        return;
      }

      const l = lead as any;
      setClientName(l.contact_name || l.client_name || "");
      setEmail(l.email || l.client_email || "");
      setPhone(l.phone || l.client_phone || "");
      if (l.event_date) setEventDate(l.event_date);
      if (l.event_type) setEventName(l.event_type);
      if (typeof l.guest_count === "number") setGuestCount(l.guest_count);
      if (l.venue_address) setVenueAddress(l.venue_address);
      if (l.venue_lat) setVenueLat(l.venue_lat);
      if (l.venue_lng) setVenueLng(l.venue_lng);

      // Carry through requested_items from a client portal rebook lead.
      if (Array.isArray(l.requested_items) && l.requested_items.length > 0) {
        setMenuItems(
          l.requested_items.map((it: any, i: number) => ({
            id: `L_lead_${i}`,
            menu_item_id: it.menu_item_id ?? null,
            name: it.item_name ?? "",
            category: (it.category || "main").toLowerCase(),
            dietary_tags: Array.isArray(it.dietary_tags) ? it.dietary_tags : null,
            pricingMode: "per_person" as PricingMode,
            unitPrice: 0,
            quantity: l.guest_count ?? 0,
            discountPct: 0,
          })),
        );
        toast({
          title: "Pre-filled from client request",
          description: `${l.requested_items.length} item${l.requested_items.length === 1 ? "" : "s"} carried through. Set the prices.`,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [leadId, toast, user?.id]);

  // ── Pre-fill: load an existing quote when ?fromQuoteId=... ────────
  // Lets the in-place editor on /admin/quotes/[id] hand off complex
  // edits to this richer builder.
  useEffect(() => {
    if (!fromQuoteId || typeof fromQuoteId !== "string") return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", fromQuoteId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      hydrateFromQuote(data);
      setQuoteId(data.id);
      setQuoteNumber(data.quote_number);
      setStatus(data.status as any);
      setIsRevisingNonDraft((data as any).status && (data as any).status !== "draft");
      // TIGHTEN I.120: capture linked order so banner / buttons can
      // surface "Update order" rather than "Save & Send".
      const linkedId = (data as any).converted_to_order_id ?? null;
      setLinkedOrderId(linkedId);
      if (linkedId) {
        try {
          const { data: ord } = await supabase
            .from("orders")
            .select("order_number")
            .eq("id", linkedId)
            .maybeSingle();
          if (!cancelled) setLinkedOrderNumber((ord as any)?.order_number ?? null);
        } catch { /* non-blocking */ }
      }
      setPersistedTotalAtLoad(
        typeof data.total === "number"
          ? data.total
          : typeof data.total_amount === "number"
            ? data.total_amount
            : 0,
      );
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromQuoteId]);

  function hydrateFromQuote(q: any) {
    setClientId(q.client_id || null);
    setClientName(q.client_name || "");
    setEmail(q.client_email || "");
    if (q.client_phone) setPhone(q.client_phone);
    if (q.event_date) setEventDate(q.event_date);
    // event_time on the quote is HH:MM (or HH:MM:SS); the <input
    // type="time"> only accepts HH:MM so trim seconds if present.
    if (q.event_time) setEventTime(String(q.event_time).slice(0, 5));
    if (q.setup_time) setSetupTime(String(q.setup_time).slice(0, 5));
    if (q.quote_name) setEventName(q.quote_name);
    if (typeof q.guest_count === "number") setGuestCount(q.guest_count);
    if (q.venue_address) setVenueAddress(q.venue_address);
    if (q.venue_lat) setVenueLat(safeNum(q.venue_lat));
    if (q.venue_lng) setVenueLng(safeNum(q.venue_lng));
    if (q.valid_until) setValidUntil(q.valid_until);
    if (q.notes) setInternalNotes(q.notes);
    // Restore the delivery fee state. We keep three pieces of state
    // (distance, rate, fee) and a flag for "operator has manually
    // overridden the auto-calc". On reopen we trust the saved fee
    // and turn the override flag on so the auto-recalc effect doesn't
    // silently clobber what the operator (or the client) saw on the
    // saved quote.
    if (typeof q.delivery_distance_km === "number") setDeliveryDistance(q.delivery_distance_km);
    if (typeof q.delivery_rate_per_km === "number") setDeliveryCostPerKm(q.delivery_rate_per_km);
    if (typeof q.delivery_fee === "number") {
      setDeliveryFee(q.delivery_fee);
      // If the saved fee doesn't match the canonical round-trip
      // formula, treat it as a manual / flat-fee override - otherwise
      // let the auto-calc keep owning it as distances or rates
      // change. Anchored on round-trip math so legacy one-way quotes
      // (saved before the Phase 30 round-trip switch) land as frozen
      // overrides on reopen rather than silently doubling.
      const dist = Number(q.delivery_distance_km) || 0;
      const rate = Number(q.delivery_rate_per_km) || 0;
      const roundTrip = dist * 2 * rate;
      if (Math.abs(q.delivery_fee - roundTrip) > 0.01) setDeliveryFeeOverridden(true);
    }
    if (Array.isArray(q.menu_items)) {
      setMenuItems(
        q.menu_items.map((m: any, i: number) => ({
          id: `L_${i}`,
          menu_item_id: m.menu_item_id ?? null,
          name: m.item_name ?? m.name ?? "",
          description: m.description ?? undefined,
          category: m.category ?? "main",
          dietary_tags: Array.isArray(m.dietary_tags) ? m.dietary_tags : null,
          pricingMode: (m.pricingMode || m.pricing_mode || "per_person") as PricingMode,
          unitPrice: safeNum(m.unit_price ?? m.unitPrice ?? m.pricePerPerson),
          quantity: safeNum(m.quantity),
          discountPct: safeNum(m.discountPct ?? m.discount_pct),
        })),
      );
    }
    if (Array.isArray(q.equipment_items)) {
      setEquipment(
        q.equipment_items.map((e: any, i: number) => ({
          id: `E_${i}`,
          equipment_id: e.equipment_id ?? null,
          name: e.name ?? "",
          category: e.category ?? null,
          quantity: safeNum(e.quantity),
          unitPrice: safeNum(e.unit_price ?? e.rentalPrice ?? e.unitPrice),
          hireInCost: safeNum(e.hire_in_cost_per_unit),
        })),
      );
    }
  }

  // ── Resolve effective settings (VAT, delivery, deposit) for the
  // currently picked branch. Re-runs when the operator switches
  // kitchen on a multi-branch quote so the totals reflect the right
  // branch's overrides instead of head-office defaults.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const regionForResolver =
      selectedKitchen && selectedKitchen.source === "region"
        ? selectedKitchen.id
        : null;
    // Resolve the per-tenant pricing convention once per quote. Not
    // a branch-level override - this is a company-wide accounting
    // decision so it stays on companies.pricing_includes_vat.
    (async () => {
      try {
        const { data: co } = await supabase
          .from("companies")
          .select("pricing_includes_vat")
          .eq("id", companyId)
          .maybeSingle();
        if (!cancelled) {
          setPricingIncludesVat((co as any)?.pricing_includes_vat === true);
        }
      } catch (e) {
        console.warn("[quotes/new] pricing convention load failed:", e);
      }
    })();
    (async () => {
      try {
        const s = await resolveBranchSettings(companyId, regionForResolver);
        if (cancelled) return;
        if (typeof s.deliveryCostPerKm === "number" && s.deliveryCostPerKm > 0) {
          setDeliveryCostPerKm(s.deliveryCostPerKm);
        }
        if (typeof s.minDeliveryFee === "number" && s.minDeliveryFee >= 0) {
          setMinDeliveryFee(s.minDeliveryFee);
        }
        if (typeof s.vatRate === "number" && s.vatRate >= 0) {
          // s.vatRegistered=false should still produce 0 VAT on the
          // total even if vatRate is populated, so respect that flag.
          setTaxRate(s.vatRegistered ? s.vatRate : 0);
        }
        if (typeof s.depositPercent === "number" && s.depositPercent >= 0) {
          setDepositPercent(s.depositPercent);
        }
      } catch (e) {
        console.warn("[quotes/new] branch settings load failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, selectedKitchen?.id, selectedKitchen?.source]);

  // ── Auto-distance from selected kitchen to venue (haversine). ────
  // Triggers whenever venueLat/Lng changes (set by AddressAutocomplete
  // on pick) OR the operator switches kitchen via the picker.
  //
  // havInitRef guards the FIRST run after mount so reopening a quote
  // with a saved flat-fee override doesn't have the override cleared
  // by the loader-triggered distance recompute. Real subsequent
  // changes (operator picks a new kitchen / venue on this session)
  // still clear the override and re-enable auto-fee.
  const havInitRef = useRef(false);
  useEffect(() => {
    if (
      !selectedKitchen ||
      typeof venueLat !== "number" || typeof venueLng !== "number"
    ) return;
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(venueLat - selectedKitchen.lat);
    const dLng = toRad(venueLng - selectedKitchen.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(selectedKitchen.lat)) *
        Math.cos(toRad(venueLat)) *
        Math.sin(dLng / 2) ** 2;
    const km = 2 * R * Math.asin(Math.sqrt(a));
    setDeliveryDistance(Number(km.toFixed(2)));
    if (havInitRef.current) {
      // Real user-driven change: switching kitchen / picking new
      // address re-enables auto-fee.
      setDeliveryFeeOverridden(false);
    } else {
      havInitRef.current = true;
    }
  }, [selectedKitchen?.id, selectedKitchen?.lat, selectedKitchen?.lng, venueLat, venueLng]);

  // ── Auto-fee from distance × 2 (round-trip) × per-km, floored at
  // min fee. The ×2 covers the return leg - a venue 10km away costs
  // 20km of fuel + driver time. Skipped once the operator has typed
  // a flat-fee override into the delivery fee input.
  useEffect(() => {
    if (deliveryFeeOverridden) return;
    const calc = deliveryDistance * 2 * deliveryCostPerKm;
    setDeliveryFee(Number(Math.max(calc, minDeliveryFee).toFixed(2)));
  }, [deliveryDistance, deliveryCostPerKm, minDeliveryFee, deliveryFeeOverridden]);

  // ── Cascade guest count to per_person lines ───────────────────────
  // Only cascades into lines the operator hasn't overridden. A line
  // with quantityOverridden=true is intentionally tracking a subset
  // of the guest list (the "5 vegetarians of 100" case) and the
  // operator's number is sacred.
  useEffect(() => {
    setMenuItems((prev) =>
      prev.map((it) =>
        it.pricingMode === "per_person" && !it.quantityOverridden && it.quantity !== guestCount
          ? { ...it, quantity: guestCount }
          : it,
      ),
    );
  }, [guestCount]);

  // ── Client typeahead pick ─────────────────────────────────────────
  const handleClientPick = useCallback(async (pick: KnownClientResult) => {
    if (!companyId) return;
    try {
      const snap = await quoteIntelligenceService.getClientSnapshot(companyId, {
        client_id: pick.client_id,
        email: pick.email,
        name: pick.display_name,
      });
      if (!snap) return;
      setClientSnapshot(snap);
      setClientId(snap.client_id);
      setClientName((v) => v || snap.full_name || "");
      setEmail((v) => v || snap.email || "");
      setPhone((v) => v || snap.phone || "");
      if (!eventDate && snap.last_event_date) setEventDate(snap.last_event_date);
      if (!eventName && snap.last_event_type) setEventName(snap.last_event_type);
      if (!guestCount && snap.last_guest_count) setGuestCount(snap.last_guest_count);
      if (!venueAddress && snap.last_venue_address) setVenueAddress(snap.last_venue_address);
      if (!venueLat && snap.last_venue_lat) setVenueLat(snap.last_venue_lat);
      if (!venueLng && snap.last_venue_lng) setVenueLng(snap.last_venue_lng);
      toast({
        title: "Client loaded",
        description: snap.recent_quotes.length
          ? `${snap.recent_quotes.length} previous quote${snap.recent_quotes.length === 1 ? "" : "s"}, use one as a template below.`
          : "Form pre-filled.",
      });
    } catch (e: any) {
      toast({ title: "Could not load client", description: e?.message ?? "", variant: "destructive" });
    }
  }, [companyId, eventDate, eventName, guestCount, venueAddress, venueLat, venueLng, toast]);

  const applyTemplate = useCallback((q: ClientSnapshot["recent_quotes"][number]) => {
    const menu = Array.isArray(q.menu_items) ? q.menu_items : [];
    if (menu.length === 0) {
      toast({ title: "Nothing to copy from that quote", description: "It had no menu items." });
      return;
    }
    setMenuItems(
      menu.map((m: any, i: number) => ({
        id: `L_tpl_${Date.now()}_${i}`,
        menu_item_id: m.menu_item_id ?? null,
        name: m.item_name ?? m.name ?? "",
        category: m.category ?? "main",
        dietary_tags: Array.isArray(m.dietary_tags) ? m.dietary_tags : null,
        pricingMode: "per_person",
        unitPrice: safeNum(m.unit_price ?? m.pricePerPerson),
        quantity: guestCount || safeNum(m.quantity),
        discountPct: 0,
      })),
    );
    toast({ title: "Template applied", description: `${menu.length} lines, tweak prices then save.` });
  }, [guestCount, toast]);

  // ── Line item handlers ────────────────────────────────────────────
  const addLine = () =>
    setMenuItems((prev) => [
      ...prev,
      {
        id: `L_${Date.now()}`,
        menu_item_id: null,
        name: "",
        category: "main",
        dietary_tags: null,
        pricingMode: "per_person",
        unitPrice: 0,
        quantity: guestCount,
        discountPct: 0,
      },
    ]);

  const removeLine = (id: string) =>
    setMenuItems((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));

  const updateLine = (id: string, patch: Partial<LineItem>) =>
    setMenuItems((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const applyMenuItemPick = (lineId: string, pick: MenuItemPick) => {
    updateLine(lineId, {
      menu_item_id: pick.id,
      name: pick.name,
      description: pick.description ?? undefined,
      // pick.category is already the lowercase form-enum value.
      // Our form's LINE_CATEGORIES include extra options (starter,
      // salad, other) that the typeahead doesn't emit, but every
      // value the typeahead returns IS in the form's set.
      category: pick.category || "main",
      dietary_tags: pick.dietaryTags ?? null,
      allergensReviewedAt: pick.allergensReviewedAt ?? null,
      unitPrice: safeNum(pick.pricePerPerson),
      // Cost-per-unit isn't in the typeahead payload; the menu picker
      // doesn't currently surface it. Leaving costPerUnit unset so
      // the future margin tracker reads from menu_items directly.
    });
  };

  const addEquip = () =>
    setEquipment((prev) => [
      ...prev,
      {
        id: `E_${Date.now()}`,
        equipment_id: null,
        name: "",
        category: null,
        // Equipment is almost always 1-per-guest (plate, fork, napkin,
        // glass). Default the new line to the event's guest count;
        // the operator can override for table-level kit (carving
        // station x1, gas burner x2).
        quantity: guestCount > 0 ? guestCount : 1,
        unitPrice: 0,
      },
    ]);
  const removeEquip = (id: string) =>
    setEquipment((prev) => prev.filter((e) => e.id !== id));
  const updateEquip = (id: string, patch: Partial<EquipmentLineItem>) =>
    setEquipment((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const applyEquipmentPick = (lineId: string, pick: EquipmentPick) => {
    updateEquip(lineId, {
      equipment_id: pick.id,
      name: pick.name,
      category: pick.category,
      unitPrice: pick.rentalPrice,
      availableQuantity: pick.availableQuantity,
      hireInCost: (pick as any).hireInCost,
    });
  };

  // Fetch live availability whenever an equipment line gets linked to
  // the catalog AND we have an event date. Stays cheap because we only
  // hit Supabase on (equipment_id, eventDate, quoteId) changes.
  //
  // Wave 16 audit: cache key was line.id alone, so when the operator
  // swapped the linked catalog item on a row (typeahead pick) the
  // line.id stayed the same and the previous equipment's availability
  // (often "0 free" with a hire-in implied) hung around. Combine
  // line.id + equipment_id in the cache key so the swap forces a fresh
  // fetch - and so the rendering code can detect a stale snapshot
  // even when the join in the dependency array misses an edit.
  const availKey = (line: { id: string; equipment_id: string | null }) =>
    `${line.id}::${line.equipment_id || "none"}`;
  useEffect(() => {
    if (!companyId || !eventDate) return;
    let cancelled = false;
    (async () => {
      for (const line of equipment) {
        if (!line.equipment_id) continue;
        const key = availKey(line);
        const cached = availability[key];
        if (cached && cached !== "loading") continue;
        setAvailability((prev) => ({ ...prev, [key]: "loading" }));
        try {
          const av = await getEquipmentAvailability(
            companyId,
            line.equipment_id,
            eventDate,
            { excludeOrderId: quoteId },
          );
          if (cancelled) return;
          setAvailability((prev) => ({ ...prev, [key]: av }));
        } catch {
          if (!cancelled) {
            setAvailability((prev) => ({ ...prev, [key]: undefined }));
          }
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, eventDate, equipment.map((e) => `${e.id}:${e.equipment_id}`).join("|"), quoteId]);

  // Refresh hire_in_cost from the live catalog. The stored quote's
  // equipment_items JSON includes a hire_in_cost_per_unit snapshot from
  // whenever it was last saved. If the operator hadn't entered a
  // hire-in cost back then it stays 0 forever and the "Set hire-in
  // cost on this catalog item" warning fires on every duplicate, even
  // after the catalog row has been priced. Re-resolve the per-line
  // cost from equipment.hire_in_cost so the catalog is the source of
  // truth.
  useEffect(() => {
    if (!companyId) return;
    const stalelines = equipment.filter(
      (e) => e.equipment_id && (e.hireInCost == null || e.hireInCost === 0),
    );
    if (stalelines.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, number> = {};
      for (const line of stalelines) {
        try {
          const meta = await getEquipmentMeta(companyId, line.equipment_id!);
          if (meta && meta.hire_in_cost > 0) updates[line.id] = meta.hire_in_cost;
        } catch {
          // Best-effort - if the catalog read fails the line just
          // keeps whatever it had, which is the same state as before.
        }
      }
      if (cancelled || Object.keys(updates).length === 0) return;
      setEquipment((prev) =>
        prev.map((e) =>
          updates[e.id] != null ? { ...e, hireInCost: updates[e.id] } : e,
        ),
      );
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, equipment.map((e) => `${e.id}:${e.equipment_id}`).join("|")]);

  // When the event date changes, blow the cache so the next render
  // re-fetches every line against the new date.
  useEffect(() => {
    setAvailability({});
  }, [eventDate]);

  // ── Persistence ──────────────────────────────────────────────────
  const buildPayload = useCallback(() => {
    const menuJson = menuItems
      .filter((l) => l.name)
      .map((l) => {
        // Audit (May 2026, Wave 3): the per-person branch previously
        // wrote q = guestCount unconditionally, but the displayed
        // `computed` totals used `line.quantity > 0 ? line.quantity :
        // guestCount`. An operator who set "vegetarian for 5 of 100"
        // saw R12,500 on screen but the row saved R15,000 (5 vs 60).
        // Mirror the same resolution branch here so the persisted
        // quantity matches what was priced.
        const q =
          l.pricingMode === "per_person"
            ? (l.quantity > 0 ? l.quantity : guestCount)
            : l.pricingMode === "flat"
              ? 1
              : l.quantity;
        const gross = l.unitPrice * q;
        const net = gross * (1 - l.discountPct / 100);
        return {
          menu_item_id: l.menu_item_id,
          item_name: l.name,
          name: l.name,
          description: l.description ?? null,
          category: l.category,
          dietary_tags: l.dietary_tags,
          pricing_mode: l.pricingMode,
          unit_price: l.unitPrice,
          pricePerPerson: l.unitPrice,
          quantity: q,
          discount_pct: l.discountPct,
          line_total: net,
        };
      });
    const equipJson = equipment
      .filter((e) => e.name)
      .map((e) => {
        // Compute the from-stock vs hire-in split at save time, using
        // the live availability snapshot if we have one. Persisting
        // the split means kitchen + driver views can render the
        // OWNED / HIRE-IN badges without recomputing availability.
        const av = e.equipment_id ? availability[availKey(e)] : undefined;
        const liveAv = av && av !== "loading" ? av : null;
        const split = liveAv
          ? splitQuantity(e.quantity, liveAv.available)
          : { fromStock: e.quantity, fromHire: 0 };
        const hireCost = split.fromHire * (e.hireInCost ?? 0);
        return {
          equipment_id: e.equipment_id,
          name: e.name,
          category: e.category,
          quantity: e.quantity,
          unit_price: e.unitPrice,
          rentalPrice: e.unitPrice,
          line_total: e.unitPrice * e.quantity,
          // Split metadata - read by the kitchen prep-list and the
          // driver deliveries view to render OWNED / HIRE-IN badges.
          from_stock_qty: split.fromStock,
          from_hire_qty: split.fromHire,
          hire_in_cost_per_unit: e.hireInCost ?? 0,
          hire_in_cost_total: hireCost,
        };
      });
    // Region propagation: a kitchen with source='region' carries a
    // real regions.id; the 'hq' fallback is a virtual origin (no
    // regions row), so we leave region_id null for those quotes.
    const resolvedRegionId =
      selectedKitchen && selectedKitchen.source === "region"
        ? selectedKitchen.id
        : null;
    return {
      company_id: companyId,
      region_id: resolvedRegionId,
      lead_id: typeof leadId === "string" ? leadId : null,
      client_id: clientId,
      client_name: clientName || "Client",
      client_email: email || null,
      client_phone: phone || null,
      // TIGHTEN I.112 (2026-06-02): persist null instead of the literal
      // string "Quote" when the operator left the field blank. The
      // placeholder leaked into customer-facing emails ("Thanks for
      // letting X quote on Quote.") and dashboard tiles. NULL means
      // "no event name set" - downstream renderers fall back to the
      // quote number or a friendly "Untitled" label.
      quote_name: eventName.trim() || "Untitled",
      event_date: eventDate || null,
      event_time: eventTime || null,
      // setup_time defaults to suggestedSetupTime when the operator
      // hasn't typed an explicit value - means a quote with a 5pm
      // start time and a 30 min buffer auto-saves a 16:30 setup
      // even if the operator never touched the field.
      setup_time: setupTime || suggestedSetupTime || null,
      guest_count: guestCount || null,
      venue_address: venueAddress || null,
      venue_lat: venueLat,
      venue_lng: venueLng,
      menu_items: menuJson,
      equipment_items: equipJson,
      delivery_distance_km: deliveryDistance || null,
      delivery_rate_per_km: deliveryCostPerKm || null,
      delivery_fee: deliveryFee,
      subtotal: computed.subtotal,
      discount_amount: computed.pctDiscount + computed.flatDiscount,
      tax_amount: computed.tax,
      tax: computed.tax,
      // Stamp the branch-resolved deposit % so quote -> order -> invoice
      // inherits it. Without this the downstream paymentProcessingService
      // falls back to the hard-coded 30% even when CPT has overridden
      // it to 50% on the regions page.
      deposit_percentage: depositPercent,
      total_amount: computed.total,
      total: computed.total,
      valid_until: validUntil || null,
      notes: internalNotes || null,
      external_source: null,
    } as any;
  }, [
    menuItems, equipment, guestCount, companyId, leadId, clientId, clientName, email, phone,
    selectedKitchen, eventName, eventDate, eventTime, setupTime, suggestedSetupTime,
    venueAddress, venueLat, venueLng,
    deliveryDistance, deliveryCostPerKm, deliveryFee, depositPercent,
    computed.subtotal, computed.pctDiscount, computed.flatDiscount, computed.tax, computed.total,
    validUntil, internalNotes,
  ]);

  // First save = INSERT, all subsequent = UPDATE.
  const persistQuote = useCallback(async (override: { status?: string; sent_at?: string; __skipSentEmail?: boolean } = {}): Promise<string | null> => {
    if (!companyId || !user?.id) return null;
    if (!clientName) return null;          // never save an empty husk
    setSaving(true);
    try {
      const payload = buildPayload();
      // TIGHTEN I.66 followup: strip __skipSentEmail out of the override
      // before Object.assign. It's a control flag for this function,
      // not a column on the quotes table; if it bleeds through, the
      // supabase update errors with "Could not find the '__skipSentEmail'
      // column". Bobby hit this on the first Save & Send after the
      // dialog landed.
      const { __skipSentEmail, ...dbOverride } = override;
      Object.assign(payload, dbOverride);
      // quotes.region_id is NOT NULL since migration 20260521110000.
      // When the operator didn't pick a region-backed kitchen
      // (e.g. selectedKitchen.source === 'hq'), buildPayload leaves
      // region_id null. Fall back to the tenant's default region
      // here so the insert satisfies the constraint. Same fallback
      // is reused for the auto-linked lead row below.
      if (!payload.region_id) {
        payload.region_id = await resolveDefaultRegionId(companyId);
      }
      if (!payload.region_id) {
        toast({
          title: "No region configured",
          description: "Set up at least one region in Settings -> Regions before creating quotes.",
          variant: "destructive",
        });
        setSaving(false);
        return null;
      }
      // DB constraint quote_has_lead_or_client requires lead_id OR
      // client_id to be set. The fromQuoteId duplicate flow can land
      // here with both null when the source quote was a legacy row
      // without proper lifecycle linkage. Find-or-create a lead by
      // email so the constraint always passes.
      //
      // Wave 11 #4: this find-or-create used to run on every save,
      // including UPDATEs. The autosave debounce + email field edits
      // meant a tenant could end up with N orphan lead rows for the
      // same quote - "Jane wedding" lead, "Jane wedding " (typo
      // recovered) lead, etc. Restrict to the INSERT branch only;
      // once the quote has a row, the constraint is already satisfied
      // and the linkage is fixed for the lifetime of the quote.
      if (!quoteId && !payload.lead_id && !payload.client_id) {
        // DB constraint quote_has_lead_or_client requires at least one FK.
        // Previously this only ran when email was set, so quotes created
        // without an email field triggered the constraint violation.
        // Now: always try to satisfy the constraint when we have a name.
        try {
          // Try to find an existing lead by email first (dedup).
          if (email) {
            const { data: existingLead, error: findLeadErr } = await supabase
              .from("leads")
              .select("id")
              .eq("company_id", companyId)
              .eq("email", email.trim().toLowerCase())
              .is("deleted_at", null)
              .maybeSingle();
            if (findLeadErr) {
              console.warn("[quotes/new] lead lookup failed:", findLeadErr.message);
            } else if ((existingLead as any)?.id) {
              payload.lead_id = (existingLead as any).id;
            }
          }
          // Still no lead_id — create a new one with whatever we have.
          if (!payload.lead_id && clientName) {
            const { data: newLead, error: newLeadErr } = await supabase
              .from("leads")
              .insert({
                company_id: companyId,
                region_id: payload.region_id,
                contact_name: clientName,
                email: email || null,
                phone: phone || null,
                status: "new",
                source: "quote_builder",
              } as any)
              .select("id")
              .single();
            if (newLeadErr) {
              console.warn("[quotes/new] lead create failed:", newLeadErr.message);
            } else if ((newLead as any)?.id) {
              payload.lead_id = (newLead as any).id;
            }
          }
        } catch (linkErr) {
          console.warn("[quotes/new] lead auto-link failed:", linkErr);
        }
        // If we still have no lead_id AND no client_id after the link
        // attempt, the DB constraint will fire. Surface a clear message
        // now rather than letting the insert fail with a cryptic error.
        if (!payload.lead_id && !payload.client_id) {
          toast({
            title: "Cannot save quote",
            description: "Could not link this quote to a lead or client. Check that the email is valid and try again.",
            variant: "destructive",
          });
          setSaving(false);
          return null;
        }
      }
      if (quoteId) {
        // Read current status + converted_to_order_id BEFORE the
        // update so we can detect the draft -> sent transition AND
        // the cancel-order cascade for revised-after-acceptance.
        // Lifecycle audit (May 2026) found this page used to write
        // status='sent' directly without ever firing the client
        // email; now we route the side-effect through
        // quoteService._fireQuoteSentEmail.
        //
        // TIGHTEN I.118 (2026-06-02): always read the current row so
        // we can also block any "Save draft" call from downgrading a
        // converted quote to draft. The previous code only read on
        // override.status === "sent", which left handleSaveDraft
        // free to write status='draft' on a quote whose linked order
        // was already confirmed - producing the inconsistent state
        // Bobby flagged on QT-20260503-7N868C (draft quote + live
        // confirmed order). The DB now has a CHECK constraint that
        // would reject that write; this guard catches the same case
        // client-side so the operator sees a clean toast instead of
        // a constraint error.
        let prevStatus: string | null = null;
        let prevConvertedOrderId: string | null = null;
        try {
          const { data: cur } = await supabase
            .from("quotes")
            .select("status, converted_to_order_id")
            .eq("id", quoteId)
            .maybeSingle();
          prevStatus = (cur as any)?.status ?? null;
          prevConvertedOrderId = (cur as any)?.converted_to_order_id ?? null;
        } catch (readErr) {
          console.warn("[quotes/new] pre-update status read failed:", readErr);
        }
        // TIGHTEN I.120 (2026-06-02): "the quote drives the order" is
        // a single coherent rule once the quote has a linked order.
        // The previous code split this into Case A vs Case B based on
        // whether the operator clicked Save & Send vs Save draft, but
        // that split produced two bad behaviours on the Save draft
        // path: (a) the quote silently downgraded to draft (fixed in
        // I.118), and (b) propagation to the linked order never
        // fired, so the order kept showing the pre-edit values
        // (Bobby caught this on ORD-003832 - quote moved to 26
        // guests / 5 Jun, order stayed on 8 / 4 Jun).
        //
        // Unified rule when prevConvertedOrderId IS set:
        //   * preserve prevStatus regardless of override (never move
        //     a converted quote back to draft or down to sent)
        //   * preserve accepted_at + viewed_at (client already
        //     accepted; no re-acceptance needed)
        //   * always propagate to the linked order (the operator
        //     mutated the source of truth; the order must mirror)
        //   * never fire the quote-sent email (client owns the
        //     order page, not the quote view)
        //
        // When prevConvertedOrderId IS NULL:
        //   * pre-acceptance "Revise & resend" flow stays intact.
        //     Save & Send clears accepted_at + viewed_at, fires the
        //     quote-sent email, lets the client re-accept.
        const isConvertedQuote = !!prevConvertedOrderId;
        if (isConvertedQuote && prevStatus) {
          payload.status = prevStatus;
          (dbOverride as any).status = prevStatus;
        } else if (override.status === "sent") {
          // Pre-acceptance revise-and-resend: reset the public view.
          payload.accepted_at = null;
          payload.viewed_at = null;
        } else if (prevStatus === "accepted") {
          // TIGHTEN (2026-06-12): accepted-but-unconverted quote (eg.
          // conversion refused on no_guest_count). The I.118 guard
          // above only protects CONVERTED quotes, so "Save draft" here
          // silently downgraded an accepted quote to draft - it fell
          // out of the Won group and the Convert-to-order button
          // vanished, with the client's acceptance lost. Operators
          // land in this editor precisely to fix the missing field and
          // convert; preserve the acceptance unless they explicitly
          // chose Save & Send (the revise-and-resend branch above).
          payload.status = "accepted";
          (dbOverride as any).status = "accepted";
        }
        // Never null out lead_id / client_id on UPDATE — these FKs are
        // set on INSERT and must satisfy quote_has_lead_or_client for the
        // lifetime of the quote. leadId comes from the URL query param
        // (only present on create-from-lead), so it's null on every edit.
        // Stripping null FKs here preserves whatever the DB already has.
        const updatePayload = { ...payload };
        if (updatePayload.lead_id == null) delete updatePayload.lead_id;
        if (updatePayload.client_id == null) delete updatePayload.client_id;
        const { error } = await supabase.from("quotes").update(updatePayload).eq("id", quoteId);
        if (error) throw error;
        // TIGHTEN I.52 (2026-06-01): explicitly fire the JS-side
        // quote -> order propagation cascade after the quote UPDATE
        // for Case B (admin edited a converted quote). The block
        // above explicitly relied on the Wave 51 Postgres trigger
        // (tg_propagate_quote_edits_to_order) to mirror date / venue /
        // totals to the linked order, but the trigger functions were
        // defined in pg_proc without ever being CREATE TRIGGER'd onto
        // the table. Net: every admin-edit-of-converted-quote
        // silently desynced the order (and every downstream surface
        // that reads event_date - kitchen prep, driver assignments,
        // pre-event reminders, cleaning handovers). Bobby caught this
        // when an order kept showing 29 May after the quote was moved
        // to 4 June.
        //
        // propagateQuoteEditToOrder rereads the freshly-updated quote,
        // compares the relevant fields against the linked order, and
        // mirrors changes including:
        //   - the 20 booking fields (date, time, venue, client, totals)
        //   - balance_due_date recompute
        //   - kitchen_prep_tasks force-replan
        //   - equipment_bookings re-sync
        //   - collection driver_assignment re-stamp
        //   - pending pre_event reminder rows re-stamp
        //   - audit row in order_amendment_requests
        //
        // Post-dispatch refusal is built into the propagator - if the
        // order is already in_transit/delivered/completed/cancelled
        // it returns ok:false and opens an amendment_request row
        // instead of mutating the live in-flight order.
        // TIGHTEN I.120 (2026-06-02): propagate on EVERY save of a
        // converted quote, not just Save & Send. Previously the
        // propagation was gated on isAdminEditOfConvertedQuote which
        // required override.status==='sent', so Save draft + autosave
        // both skipped propagation - the operator changed guest count
        // on the quote and the order silently stayed on the old
        // count, breaking kitchen prep, deposit/balance math, and the
        // client's order page.
        if (isConvertedQuote && prevConvertedOrderId) {
          // TIGHTEN I.127 (2026-06-03): defensive double-fire. The
          // browser-side propagator runs first (richer cascade -
          // prep tasks, driver assignments, balance due date) but
          // historically it could silently skip the menu_items
          // rebuild and equipment qty resync. The server endpoint
          // /api/quotes/{id}/resync-order runs under SERVICE ROLE
          // so it can't be blocked by RLS, and it focuses on the
          // single thing the JS propagator missed: line items +
          // equipment booking quantities matching the quote.
          let propReceipt: any = null;
          try {
            propReceipt = await propagateQuoteEditToOrder(quoteId, null);
            if (propReceipt?.refusedPostDispatch) {
              toast({
                title: "Edit blocked",
                description: "The order is already in dispatch / delivered. We've opened an amendment request for dispatch review.",
                variant: "destructive",
              });
            }
          } catch (propErr) {
            console.error("[quotes/new] propagateQuoteEditToOrder failed:", propErr);
          }
          // Server-side resync ALWAYS fires - if the JS propagator
          // succeeded the server call is a no-op cleanup; if it
          // failed silently this catches the gap. Both paths post-
          // process through audit_logs so we can trace which save
          // touched the order.
          try {
            const res = await fetch(`/api/quotes/${quoteId}/resync-order`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            });
            const json = await res.json();
            if (!res.ok || json?.ok === false) {
              if (json?.refusedPostDispatch) {
                // Already toasted above by propagateQuoteEditToOrder.
              } else {
                console.warn("[quotes/new] server resync returned non-ok:", json);
              }
            }
          } catch (e) {
            console.warn("[quotes/new] server resync threw:", e);
            // Only surface a hard toast if BOTH propagators failed.
            if (!propReceipt) {
              toast({
                title: "Order not yet mirrored",
                description: "Quote saved but the linked order didn't pick up the change. Refresh, then click Save once more.",
                variant: "destructive",
              });
            }
          }
        }
        setSavedAt(new Date());
        // Refresh the persisted-total snapshot so the stale-totals
        // banner clears now that the public view is back in sync.
        setPersistedTotalAtLoad(Number(payload.total ?? payload.total_amount ?? 0));
        if (override.status) setStatus((dbOverride as any).status ?? override.status as any);
        // Fire the quote-sent email only on pre-acceptance Save &
        // Send. Converted quotes skip the email - the client already
        // accepted and owns the order page; firing the quote-ready
        // email would confuse them.
        if (override.status === "sent" && prevStatus !== "sent" && !isConvertedQuote && !override.__skipSentEmail) {
          void quoteService._fireQuoteSentEmail(quoteId).catch((e) =>
            console.warn("[quotes/new] sent-email fire failed:", e),
          );
        }
        // Wave 14 audit: pending change requests auto-address on
        // every Save & Send - whether the quote is being resent or
        // just admin-edited, the operator has effectively responded.
        if (override.status === "sent") {
          void (async () => {
            try {
              await (supabase as any)
                .from("quote_change_requests")
                .update({
                  status: "addressed",
                  addressed_at: new Date().toISOString(),
                })
                .eq("quote_id", quoteId)
                .eq("status", "pending");
            } catch (crErr) {
              console.warn("[quotes/new] change-request auto-address failed:", crErr);
            }
          })();
        }
        // Surface a clear "order updated" toast so the operator
        // knows the edit mirrored to the existing order rather than
        // spawning a fresh one. Runs on every save of a converted
        // quote (Save draft, Save & Send, autosave - they all
        // propagate via the block above).
        if (isConvertedQuote && prevConvertedOrderId) {
          void (async () => {
            try {
              const { data: linkedOrd } = await (supabase as any)
                .from("orders")
                .select("order_number")
                .eq("id", prevConvertedOrderId)
                .maybeSingle();
              const ordNum = (linkedOrd as any)?.order_number || "the existing order";
              toast({
                title: "Order updated",
                description: `Changes mirrored to ${ordNum}. No new order or invoice was created; the deposit / balance carry over.`,
              });
            } catch (descErr) {
              console.warn("[quotes/new] propagation-summary fetch failed:", descErr);
            }
          })();
        }
        return quoteId;
      } else {
        // Wave 11 #9: route the INSERT through quoteService.createQuote
        // so per-tenant numbering, lead-status atomic advance and any
        // future logic added to createQuote benefit this builder
        // automatically. skipClientNotification keeps the
        // "we received your request" template (intended for the
        // client-initiated flow) from firing on every admin draft.
        // Lead-status guard for empty / R0 saves stays here - the
        // builder has more context about whether the operator has
        // actually priced something.
        const insert: any = {
          ...payload,
          status: override.status || "draft",
          prepared_by: user.id,
          user_id: user.id,
        };
        const computedTotal = Number(insert.total || insert.total_amount || 0);
        const hasPricedContent =
          computedTotal > 0 ||
          (Array.isArray(insert.menu_items) && insert.menu_items.length > 0);
        const operatorPressedSend = override.status === "sent";
        const created: any = await quoteService.createQuote(insert, {
          skipClientNotification: true,
          // Don't auto-advance the lead to 'quoted' on an empty / R0
          // autosave - linkage stays, status doesn't move until the
          // operator has actually priced something OR hit Send.
          skipLeadAdvance: !hasPricedContent && !operatorPressedSend,
        });
        if (!created?.id) throw new Error("Quote create returned no id");
        setQuoteId(created.id);
        setQuoteNumber(created.quote_number);
        setStatus(created.status as any);
        setSavedAt(new Date());
        // First save with status='sent' (Save & Send on a brand-new
        // quote) - fire the client email through the existing
        // _fireQuoteSentEmail path. NULL prev-status acts like a
        // transition from draft.
        if (operatorPressedSend && !override.__skipSentEmail) {
          void quoteService._fireQuoteSentEmail(created.id).catch((e) =>
            console.warn("[quotes/new] sent-email fire failed:", e),
          );
        }
        // Update the URL silently so a refresh doesn't create a duplicate.
        try {
          router.replace(
            { pathname: "/admin/quotes/new", query: { fromQuoteId: created.id } },
            undefined,
            { shallow: true },
          );
        } catch { /* ignore router edge cases */ }
        return created.id;
      }
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message || "Try again",
        variant: "destructive",
      });
      return null;
    } finally {
      setSaving(false);
    }
  }, [buildPayload, clientName, companyId, leadId, quoteId, router, toast, user?.id]);

  // Auto-save: 1.5s debounced, only for active drafts with a name AND
  // an email. Audit (May 2026): the email check was on handleSaveDraft
  // only, so autosave silently created quote rows without an email
  // that then failed convertQuoteToOrder's gate later. Mirror the same
  // "no deal without email" rule here so we never persist a row the
  // pipeline can't process.
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = true; }, [menuItems, equipment, guestCount, surgePct, discountPct, discountFlat, deliveryFee, validUntil, eventName, eventDate, venueAddress, clientName, email]);
  useEffect(() => {
    if (status !== "draft") return;
    if (!clientName) return;
    if (!email || !email.trim()) return;
    if (!dirtyRef.current) return;
    const handle = setTimeout(() => {
      dirtyRef.current = false;
      persistQuote();
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(handle);
  }, [status, clientName, menuItems, equipment, guestCount, surgePct, discountPct, discountFlat, deliveryFee, validUntil, eventName, eventDate, venueAddress, email, persistQuote]);

  const handleSaveDraft = async () => {
    // No deal without email - the follow-up engine, invoice flow,
    // amendment + cancellation workflows all assume an addressable
    // client. Gate Save draft on it too so we never persist a row
    // that fails the DB NOT NULL the moment it goes out.
    if (!email || !email.trim()) {
      toast({
        title: "Client email required",
        description: "Every quote needs a client email. The follow-up + invoice flows depend on it. No deal without one.",
        variant: "destructive",
      });
      return;
    }
    const id = await persistQuote({ status: "draft" });
    // persistQuote refuses to downgrade an accepted quote, so don't
    // tell the operator it became a draft when it didn't.
    if (id) toast({ title: status === "accepted" ? "Saved - quote stays accepted" : "Saved as draft" });
  };

  // Phase 3 #1: allergen gate. Sending a quote with menu items whose
  // allergens have never been reviewed sends the kitchen blind;
  // there's no signed-off statement of what's in each dish. We block
  // the send until either the staffer goes back and reviews the
  // flagged items, or explicitly accepts the risk. The detection
  // (line.menu_item_id set + line.allergensReviewedAt null) reuses
  // the data threaded through from Phase 2 #7.
  const unreviewedAllergenLines = useMemo(() => {
    return menuItems.filter(
      (l) => !!l.menu_item_id && !l.allergensReviewedAt,
    );
  }, [menuItems]);

  // TIGHTEN I.66 (2026-06-01): Save & Send now goes through a
  // preview dialog so the operator sees and can edit the email body
  // BEFORE it goes to the client. Bobby flagged that "this popup
  // dialogue is cool, but I have no idea what I'm sending to the
  // client. I need to see and be able to edit." Previously the flow
  // was: click Save & Send -> allergens check -> instant email fire
  // (no chance to review or edit). Now: click Save & Send ->
  // allergens check -> persist quote WITHOUT auto-firing the email
  // -> open QuoteSendDialog (existing component that's used on
  // /admin/quotes index but wasn't wired to the edit page) ->
  // operator reviews + edits subject + body -> dialog confirms +
  // sends + stamps sent_at + status='sent'.
  const [sendDialogQuote, setSendDialogQuote] = useState<any | null>(null);

  const handleSend = async (opts: { bypassAllergenGate?: boolean } = {}) => {
    if (!email || !email.trim()) {
      toast({
        title: "Client email required",
        description: "No deal without an email. The follow-up + invoice + reminder flows depend on it.",
        variant: "destructive",
      });
      return;
    }
    if (computed.total <= 0) {
      toast({ title: "Add at least one priced line", variant: "destructive" });
      return;
    }
    if (!opts.bypassAllergenGate && unreviewedAllergenLines.length > 0) {
      setAllergenGateOpen(true);
      return;
    }
    setSending(true);
    try {
      // Persist the latest edits but DON'T auto-fire the email -
      // the preview dialog will fire it when the operator confirms.
      const id = await persistQuote({
        status: "sent",
        sent_at: new Date().toISOString(),
        __skipSentEmail: true,
      });
      if (id) {
        // Open the preview-and-edit dialog with the current quote
        // state. The dialog resolves the template, lets the operator
        // edit subject + body, and posts to /api/send-email with the
        // operator's content verbatim on confirm.
        // TIGHTEN I.111: also pull the persisted public_token so the
        // dialog can embed the /q/{token} client view link in the
        // email body. Previously omitted, so the email had no clickable
        // link - just a PDF attachment.
        let publicToken: string | null = null;
        try {
          const { data: row } = await supabase
            .from("quotes")
            .select("public_token")
            .eq("id", id)
            .maybeSingle();
          publicToken = (row as any)?.public_token ?? null;
        } catch {
          /* leave null - dialog will render fallback body without link */
        }
        setSendDialogQuote({
          id,
          quote_number: quoteNumber || id,
          client_name: clientName || null,
          client_email: email,
          total: computed.total,
          total_amount: computed.total,
          currency: tenantCurrency.code,
          event_name: eventName || null,
          quote_name: eventName || "Untitled",
          user_id: user?.id || null,
          public_token: publicToken,
          // TIGHTEN I.128 (2026-06-03): pass the live guest count +
          // event date so the email body can render "30 guests on
          // 6 June" rather than the stale figure the template alone
          // would carry. Also forward is_converted so the body copy
          // switches to "I've updated your booking" when the quote
          // already has a linked order.
          guest_count: guestCount,
          event_date: eventDate || null,
          is_converted: isConvertedQuote,
        });
      }
    } finally {
      setSending(false);
    }
  };

  // ── UI helpers ────────────────────────────────────────────────────
  const validityDays = useMemo(() => {
    if (!validUntil) return null;
    const ms = new Date(validUntil).getTime() - new Date().getTime();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }, [validUntil]);

  const dirty = !savedAt || dirtyRef.current;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>{quoteNumber ? `${quoteNumber} - Quote` : "New quote"} - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-full">
          <Link href={withSlug("/admin/quotes")}>
            <Button variant="ghost" className="mb-4 text-sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Quotes
            </Button>
          </Link>

          {/* Header */}
          <div className="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl shadow-lg flex-shrink-0">
                <DollarSign className="w-7 h-7 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl lg:text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  {quoteId ? "Edit Quote" : "Create Quote"}
                </h1>
                <p className="text-sm text-slate-600 mt-0.5 flex items-center gap-2 flex-wrap">
                  {quoteNumber && (
                    <span className="font-mono text-slate-700">{quoteNumber}</span>
                  )}
                  {status !== "draft" && (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200">{status}</Badge>
                  )}
                  {savedAt && (
                    <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Saved {savedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  {saving && (
                    <span className="inline-flex items-center gap-1 text-slate-500 text-xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                    </span>
                  )}
                  {dirty && !saving && status === "draft" && (
                    <span className="text-xs text-amber-600">Unsaved changes</span>
                  )}
                </p>
                {/* Wave 14 audit + TIGHTEN I.120: banner copy reflects
                    what actually happens. Pre-acceptance revisions
                    reset the public lifecycle and email the client.
                    Converted quotes (linked order live) mirror to the
                    order without re-acceptance - the client already
                    accepted and owns the order page now. */}
                {isRevisingNonDraft && (
                  <div className="mt-2 p-2.5 rounded-md border border-blue-200 bg-blue-50 text-xs text-blue-900 max-w-xl">
                    {isConvertedQuote ? (
                      <>
                        <strong className="font-semibold">Editing the booking behind {linkedOrderNumber ? `order ${linkedOrderNumber}` : "the linked order"}.</strong>{" "}
                        Save mirrors your changes (date, guests, menu, totals) straight to the order, re-plans kitchen prep, re-syncs equipment bookings, and updates the client's order page. No re-acceptance, no new invoice, no fresh email unless you tick Notify client.
                      </>
                    ) : (
                      <>
                        <strong className="font-semibold">Revising a {status === "accepted" ? "previously-accepted" : "sent"} quote.</strong>{" "}
                        Save &amp; Send will email the updated version to {email || "the client"}, reset the public link to "awaiting your response", and mark any pending change requests as addressed.
                      </>
                    )}
                  </div>
                )}
                {/* Wave 12 audit: stale-totals warning. Customer-facing
                    /q/[token] reads quote.subtotal / tax_amount / total
                    directly from the row. If the live recompute drifts
                    away from the persisted figure (e.g. the items were
                    edited under a different VAT mode, or pricing
                    convention flipped on the company), the public view
                    keeps showing the stale number until the operator
                    saves. Surface it inline so the operator knows. */}
                {quoteId && persistedTotalAtLoad !== null && Math.abs((computed.total || 0) - persistedTotalAtLoad) > 0.01 && (
                  <div className="mt-2 p-2.5 rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-900 max-w-xl">
                    <strong className="font-semibold">Totals out of sync.</strong>{" "}
                    The live total is <span className="font-mono">{tenantCurrency.symbol}{computed.total.toFixed(2)}</span>,
                    but the customer-facing quote still shows the saved <span className="font-mono">{tenantCurrency.symbol}{persistedTotalAtLoad.toFixed(2)}</span>.
                    {/* Wave 15 audit: when revising a non-draft quote,
                        Save draft alone leaves accepted_at intact and
                        the customer would see "accepted" with new
                        higher numbers - broken state. Steer the
                        operator to Save & Send so the public
                        lifecycle resets in step with the totals. */}
                    {isRevisingNonDraft
                      ? <> Hit <em>Save &amp; Send</em> to push the new numbers and email the client.</>
                      : <> Hit <em>Save draft</em> to refresh the public view.</>}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Button variant="outline" onClick={() => setPreviewOpen((v) => !v)}>
                  <Eye className="w-4 h-4 mr-2" />
                  {previewOpen ? "Hide preview" : "Preview"}
                </Button>
                <InfoTooltip content={"Toggle the live preview of what the client will see: the public quote page, with your branding, totals and setup time.\n\nDoesn't save or send anything. Use this to sanity-check before hitting Save & Send."} />
              </div>
              {/* TIGHTEN I.120: when the quote already has a linked
                  order, the operator's intent is "update the order".
                  Save = mirror without notifying; Save & Notify =
                  mirror + send a "your booking has been updated"
                  email. Original Save draft / Save & Send labels stay
                  for non-converted quotes. */}
              {isConvertedQuote ? (
                <>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" onClick={handleSaveDraft} disabled={saving || !clientName}>
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                    <InfoTooltip content={"Save your changes to the quote and mirror them straight to the linked order. Re-plans kitchen prep, re-syncs equipment bookings, recalculates balance due. No email goes out - use Save & Notify for that."} />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      onClick={() => handleSend()}
                      disabled={sending || saving || computed.total <= 0 || !email}
                      className="bg-gradient-to-r from-green-600 to-emerald-600"
                    >
                      {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                      Save &amp; Notify
                    </Button>
                    <InfoTooltip content={"Save + mirror to the order AND email the client a 'your booking has been updated' message with a link to the live order page.\n\nThe client doesn't need to re-accept - the booking is already confirmed."} />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" onClick={handleSaveDraft} disabled={saving || !clientName}>
                      <Save className="w-4 h-4 mr-2" />
                      {status === "accepted" ? "Save" : "Save draft"}
                    </Button>
                    {/* Accepted-but-unconverted: Save keeps the
                        acceptance (the operator is usually here to fix
                        a missing field like guest count before
                        converting). Save & Send is the explicit
                        "revise and ask the client to re-accept" path. */}
                    <InfoTooltip content={status === "accepted"
                      ? "Save your changes and keep the quote accepted - the client does not need to re-accept. Use this to fill in a missing field (e.g. guest count) before converting to an order.\n\nUse Save & Send instead if the pricing changed and the client must re-accept."
                      : "Save current state of the quote with status = 'draft'. The client doesn't get an email and the quote doesn't appear on their portal. It's parked privately for you to come back to.\n\nGreat when you're partway through and need to step away."} />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      onClick={() => handleSend()}
                      disabled={sending || saving || computed.total <= 0 || !email}
                      className="bg-gradient-to-r from-green-600 to-emerald-600"
                    >
                      {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                      Save &amp; Send
                    </Button>
                    <InfoTooltip content={"Save the quote with status = 'sent', generate a public link, and email the client a branded message with a 'View Quote' button.\n\nThe quote shows up on their portal too. Disabled until the client has an email + the total is greater than zero.\n\nResending an already-sent quote sends a fresh email. The client gets a 'we've updated your quote' message."} />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column: form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Client + Event */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    Client + event
                  </CardTitle>
                  <CardDescription>
                    Start typing, we'll match against existing clients, leads and past quotes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs">Client name</Label>
                    <ClientTypeahead
                      companyId={companyId}
                      value={clientName}
                      onChange={setClientName}
                      onPick={handleClientPick}
                      placeholder="Search clients, or type a new name"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs flex items-center gap-1"><Mail className="w-3 h-3" /> Email</Label>
                      <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</Label>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 ..." />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">
                        Event name / type
                        <span className="ml-1 text-[10px] text-slate-500 font-normal">- shows up in the client's email subject + dashboards</span>
                      </Label>
                      <Input
                        value={eventName}
                        onChange={(e) => setEventName(e.target.value)}
                        placeholder="e.g. Bobby's 40th braai, Q2 strategy lunch, Sarah & James wedding"
                      />
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" /> Event date</Label>
                      <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1">
                        Start time (optional)
                        <InfoTooltip content={"Time the event begins for guests, e.g. 17:00 for an evening function.\n\nThis is the moment the food + service has to be ready. Setup time below is when the team arrives to set up. Different from start time so morning setup of an evening event is supported."} />
                      </Label>
                      <Input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1">
                        Setup / delivery time
                        <InfoTooltip content={"When the team arrives at the venue to set up. Defaults to the event start time minus your delivery buffer (settings > Operations > Delivery Buffer, currently " + deliveryBufferMins + " min).\n\nOverride for big events that need a morning setup, or when the venue requires an earlier arrival."} />
                      </Label>
                      <Input
                        type="time"
                        value={setupTime}
                        onChange={(e) => setSetupTime(e.target.value)}
                        placeholder={suggestedSetupTime || "--:--"}
                      />
                      {!setupTime && suggestedSetupTime && (
                        <button
                          type="button"
                          onClick={() => setSetupTime(suggestedSetupTime)}
                          className="text-[11px] text-emerald-700 hover:text-emerald-800 underline mt-1"
                        >
                          Use suggested {suggestedSetupTime} ({deliveryBufferMins} min before start)
                        </button>
                      )}
                      {setupTime && eventTime && setupTime !== suggestedSetupTime && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          Custom setup time · {setupTime} arrival for {eventTime} start
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1"><Users className="w-3 h-3" /> Guest count</Label>
                      <Input
                        type="number"
                        min={0}
                        value={guestCount || ""}
                        onChange={(e) => setGuestCount(safeNum(e.target.value))}
                        placeholder="60"
                      />
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Valid until</Label>
                      <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                      {validityDays !== null && (
                        <p className={`text-[11px] mt-1 ${validityDays < 0 ? "text-rose-600" : validityDays <= 7 ? "text-amber-600" : "text-slate-500"}`}>
                          {validityDays < 0
                            ? `Expired ${Math.abs(validityDays)}d ago`
                            : `Expires in ${validityDays}d`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" /> Venue address</Label>
                    <AddressAutocomplete
                      value={venueAddress}
                      placeholder="Start typing the venue..."
                      countryCode="za"
                      onChange={(pick) => {
                        setVenueAddress(pick.address);
                        setVenueLat(pick.lat);
                        setVenueLng(pick.lng);
                      }}
                    />
                  </div>

                  {/* Distance + delivery fee. Auto-calculated from
                      kitchen -> venue once both lat/lng are set; the
                      operator can override either field manually. The
                      override flag stops auto-recalc from clobbering
                      a manual fee until they pick a fresh address. */}
                  {(venueLat || deliveryDistance > 0) && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs text-blue-900 gap-2">
                        <span className="font-semibold flex-shrink-0">Delivery distance + fee</span>
                        {selectedKitchen && kitchens.length === 1 && (
                          // Prefer the full address over the kitchen's
                          // display name - "From Cape Town" is too
                          // vague when the operator wants to see the
                          // actual departure point. Falls back to name
                          // only if address isn't set.
                          <span className="text-blue-700/80 text-right">
                            From {selectedKitchen.address || selectedKitchen.name}
                          </span>
                        )}
                      </div>
                      {/* Kitchen picker only renders when there are
                          multiple branches with coords. Single-branch
                          tenants get the silent "From {name}" badge
                          above instead. */}
                      {kitchens.length > 1 && selectedKitchen && (
                        <div>
                          <Label className="text-[11px] text-blue-900">From kitchen / branch</Label>
                          <select
                            value={selectedKitchen.id}
                            onChange={(e) => setKitchenId(e.target.value)}
                            className="w-full h-9 px-2 rounded-md border border-blue-200 bg-white text-sm"
                          >
                            {kitchens.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.name}{k.address ? ` · ${k.address}` : ""}
                              </option>
                            ))}
                          </select>
                          <p className="text-[11px] text-blue-700/80 mt-1">
                            Picking a different kitchen recalculates distance + fee.
                          </p>
                          {capacitySuggestion?.meaningful
                            && capacitySuggestion.leastLoadedRegionId
                            && capacitySuggestion.leastLoadedRegionId !== selectedKitchen.id && (() => {
                              const lighterKitchen = kitchens.find(
                                (k) => k.id === capacitySuggestion.leastLoadedRegionId,
                              );
                              const currentLoad = capacitySuggestion.loads.find(
                                (l) => l.regionId === selectedKitchen.id,
                              );
                              const lighterLoad = capacitySuggestion.loads.find(
                                (l) => l.regionId === capacitySuggestion.leastLoadedRegionId,
                              );
                              if (!lighterKitchen) return null;
                              return (
                                <button
                                  type="button"
                                  onClick={() => setKitchenId(lighterKitchen.id)}
                                  className="mt-2 w-full text-left rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 hover:border-amber-400 hover:bg-amber-100"
                                  title="Switch to the lighter branch"
                                >
                                  💡 {selectedKitchen.name} has {currentLoad?.orderCount ?? 0} order{(currentLoad?.orderCount ?? 0) === 1 ? "" : "s"} + {currentLoad?.openQuoteCount ?? 0} open quote{(currentLoad?.openQuoteCount ?? 0) === 1 ? "" : "s"} on this date.{" "}
                                  {lighterKitchen.name} is lighter ({lighterLoad?.orderCount ?? 0} order{(lighterLoad?.orderCount ?? 0) === 1 ? "" : "s"} + {lighterLoad?.openQuoteCount ?? 0} quote{(lighterLoad?.openQuoteCount ?? 0) === 1 ? "" : "s"}).{" "}
                                  <span className="font-medium underline">Switch to {lighterKitchen.name}</span>
                                </button>
                              );
                            })()}
                        </div>
                      )}
                      {kitchens.length === 0 && (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                          No kitchen with coordinates set up. Open Company profile and pin your HQ address (or add a Region with lat/lng) so distance auto-calculates.
                        </p>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[11px] text-blue-900">Distance (km)</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.1"
                            value={deliveryDistance || ""}
                            onChange={(e) => {
                              setDeliveryDistance(safeNum(e.target.value));
                              setDeliveryFeeOverridden(false);
                            }}
                            className="bg-white"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-blue-900">R per km</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.5"
                            value={deliveryCostPerKm || ""}
                            onChange={(e) => {
                              setDeliveryCostPerKm(safeNum(e.target.value));
                              setDeliveryFeeOverridden(false);
                            }}
                            className="bg-white"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-blue-900 flex items-center gap-1">
                            Fee (R)
                            {deliveryFeeOverridden && (
                              <span className="text-[10px] text-rose-700 font-normal">(flat fee)</span>
                            )}
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={deliveryFee || ""}
                            onChange={(e) => {
                              setDeliveryFee(safeNum(e.target.value));
                              setDeliveryFeeOverridden(true);
                            }}
                            className="bg-white"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-blue-700/80">
                        {deliveryFeeOverridden
                          ? `Flat fee active. Fee = R${deliveryFee.toFixed(2)}. Clear the box and re-enter distance to switch back to auto.`
                          : deliveryDistance > 0
                            ? `Auto: ${deliveryDistance.toFixed(1)}km × 2 (round-trip) × R${deliveryCostPerKm}/km${minDeliveryFee > 0 ? `, floor R${minDeliveryFee}` : ""} = R${deliveryFee.toFixed(2)}`
                            : `Pick a venue or type a distance to auto-calculate; or type a flat fee directly into the Fee box.`}
                      </p>
                    </div>
                  )}

                  {/* Recent-quote templates from the picked client. */}
                  {clientSnapshot && clientSnapshot.recent_quotes.length > 0 && (
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                      <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                        <Wand2 className="w-3.5 h-3.5 text-purple-600" />
                        Use a previous quote as the starting point
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {clientSnapshot.recent_quotes.slice(0, 4).map((q, i) => (
                          <Button
                            key={(q as any).id || i}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="bg-white"
                            onClick={() => applyTemplate(q)}
                          >
                            {(q as any).quote_name || (q as any).quote_number || `Quote ${i + 1}`}
                            {(q as any).total != null && (
                              <span className="ml-2 text-emerald-600">{fmtR(safeNum((q as any).total))}</span>
                            )}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Menu lines */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-base">Menu items</CardTitle>
                      <CardDescription>Each line picks a pricing mode, qty + per-line discount.</CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={addLine}>
                      <Plus className="w-4 h-4 mr-1" /> Add line
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {menuItems.map((line, idx) => {
                    const computedQty =
                      line.pricingMode === "per_person"
                        ? (typeof line.quantity === "number" && line.quantity > 0 ? line.quantity : guestCount)
                        : line.pricingMode === "flat"
                          ? 1
                          : line.quantity;
                    const gross = line.unitPrice * computedQty;
                    const net = gross * (1 - line.discountPct / 100);
                    return (
                      <div key={line.id} className="p-3 sm:p-4 border border-slate-200 rounded-lg bg-slate-50">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Line {idx + 1}</span>
                            {/* Phase 2 #7: surface unreviewed allergen state
                                inline so the staffer building the quote knows
                                this menu item still needs a sign-off. */}
                            {line.menu_item_id && (
                              <AllergenReviewBadge
                                reviewedAt={line.allergensReviewedAt}
                                compact
                                hideWhenReviewed
                              />
                            )}
                          </div>
                          {menuItems.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(line.id)}>
                              <Trash2 className="w-4 h-4 text-rose-600" />
                            </Button>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs">Item</Label>
                            <MenuItemTypeahead
                              companyId={companyId}
                              value={line.name}
                              onChange={(v) => updateLine(line.id, { name: v })}
                              onPick={(pick) => applyMenuItemPick(line.id, pick)}
                              placeholder="Search the menu..."
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                            <div className="sm:col-span-3">
                              <Label className="text-xs">Category</Label>
                              <select
                                value={line.category || "main"}
                                onChange={(e) => updateLine(line.id, { category: e.target.value })}
                                className="w-full h-10 px-2 rounded-md border border-slate-200 bg-white text-sm"
                              >
                                {LINE_CATEGORIES.map((c) => (
                                  <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="sm:col-span-3">
                              <Label className="text-xs">Pricing mode</Label>
                              <select
                                value={line.pricingMode}
                                onChange={(e) => updateLine(line.id, { pricingMode: e.target.value as PricingMode })}
                                className="w-full h-10 px-2 rounded-md border border-slate-200 bg-white text-sm"
                              >
                                <option value="per_person">Per guest</option>
                                <option value="per_portion">Per portion</option>
                                <option value="flat">Flat fee</option>
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <Label className="text-xs">Unit price (R)</Label>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={line.unitPrice || ""}
                                onChange={(e) => updateLine(line.id, { unitPrice: safeNum(e.target.value) })}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <Label className="text-xs">Qty</Label>
                              <Input
                                type="number"
                                min={0}
                                disabled={line.pricingMode === "flat"}
                                placeholder={
                                  line.pricingMode === "per_person"
                                    ? `${guestCount || 0} (default)`
                                    : ""
                                }
                                value={
                                  line.pricingMode === "flat"
                                    ? 1
                                    : line.quantity || ""
                                }
                                onChange={(e) => updateLine(line.id, {
                                  quantity: safeNum(e.target.value),
                                  // Mark sticky - the guestCount cascade now
                                  // leaves this row alone for the lifetime of
                                  // the quote.
                                  quantityOverridden: true,
                                })}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <Label className="text-xs flex items-center gap-1"><Percent className="w-3 h-3" /> Discount</Label>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={line.discountPct || ""}
                                onChange={(e) => updateLine(line.id, { discountPct: Math.min(100, Math.max(0, safeNum(e.target.value))) })}
                              />
                            </div>
                          </div>
                          <div className="text-xs text-slate-500 flex justify-between flex-wrap gap-2 pt-1">
                            <span>
                              {fmtR(line.unitPrice)} {PRICING_LABEL[line.pricingMode]} × {computedQty}
                              {line.discountPct > 0 && <> &nbsp;-&nbsp; {line.discountPct}% off</>}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {line.discountPct > 0 ? (
                                <>
                                  <span className="line-through text-slate-400 mr-1.5">{fmtR(gross)}</span>
                                  <span className="text-emerald-600">{fmtR(net)}</span>
                                </>
                              ) : (
                                fmtR(net)
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Equipment */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-base">Equipment</CardTitle>
                      <CardDescription>Chafing dishes, serving ware, hire add-ons.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* TIGHTEN I.127 (2026-06-03): bulk-match guests
                          on equipment lines. Most events scale cutlery
                          + crockery 1:1 with guests, but the operator
                          shouldn't have to retype Qty on every line
                          when guests move. The button is only shown
                          when there's at least one equipment row AND
                          at least one row's quantity doesn't already
                          match the guest count, so it never nags. */}
                      {guestCount > 0
                        && equipment.length > 0
                        && equipment.some((e) => e.name && e.quantity !== guestCount) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => {
                            setEquipment((prev) =>
                              prev.map((e) => (e.name ? { ...e, quantity: guestCount } : e)),
                            );
                            toast({
                              title: `Equipment set to ${guestCount}`,
                              description: "All equipment lines now match the guest count. Edit any line if it shouldn't scale.",
                            });
                          }}
                          title={`Set every equipment line's Qty to ${guestCount} so cutlery / crockery / drinkware matches the guest count.`}
                        >
                          <Users className="w-3.5 h-3.5 mr-1" />
                          Match {guestCount} guests
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={addEquip}>
                        <Plus className="w-4 h-4 mr-1" /> Add equipment
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {equipment.length === 0 && (
                    <p className="text-sm text-slate-500 italic">No equipment lines.</p>
                  )}
                  {equipment.map((e, idx) => {
                    // Live availability for this line at the current
                    // event date. "loading" while we're fetching;
                    // undefined if the line isn't linked to the catalog
                    // OR there's no event date yet.
                    const liveAvail = e.equipment_id ? availability[availKey(e)] : undefined;
                    const av =
                      liveAvail && liveAvail !== "loading" ? liveAvail : null;
                    const split = av
                      ? splitQuantity(e.quantity, av.available)
                      : { fromStock: e.quantity, fromHire: 0 };
                    const hireCost = split.fromHire * (e.hireInCost ?? 0);
                    return (
                      <div key={e.id} className="p-3 border border-slate-200 rounded-lg bg-slate-50">
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-xs text-slate-500">Item {idx + 1}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeEquip(e.id)}>
                            <Trash2 className="w-4 h-4 text-rose-600" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs">Equipment</Label>
                            <EquipmentTypeahead
                              companyId={companyId}
                              value={e.name}
                              onChange={(v) => updateEquip(e.id, { name: v })}
                              onPick={(pick) => applyEquipmentPick(e.id, pick)}
                              placeholder="Search your catalog, chafing dish, table, chair..."
                            />
                            {e.equipment_id && (
                              <div className="mt-1 text-[11px] text-blue-600 flex items-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
                                Linked to your catalog.
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                            <div className="sm:col-span-4">
                              <Label className="text-xs">Category</Label>
                              <Input
                                value={e.category || ""}
                                onChange={(ev) => updateEquip(e.id, { category: ev.target.value })}
                                placeholder="e.g. chafing, tables, lighting"
                              />
                            </div>
                            <div className="sm:col-span-4">
                              <Label className="text-xs">Qty</Label>
                              <Input
                                type="number"
                                min={0}
                                value={e.quantity || ""}
                                onChange={(ev) => updateEquip(e.id, { quantity: safeNum(ev.target.value) })}
                              />
                            </div>
                            <div className="sm:col-span-4">
                              <Label className="text-xs">Unit price client pays (R)</Label>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={e.unitPrice || ""}
                                onChange={(ev) => updateEquip(e.id, { unitPrice: safeNum(ev.target.value) })}
                              />
                            </div>
                          </div>

                          {/*
                            Live availability + split. Only renders when
                            the line is linked to the catalog AND we have
                            an event date. Otherwise the team is in custom-
                            line territory and we don't pretend to know
                            what's in stock.
                          */}
                          {e.equipment_id && eventDate && (
                            <div className="rounded-md bg-white border border-slate-200 px-3 py-2 text-xs">
                              {liveAvail === "loading" ? (
                                <span className="text-slate-500 inline-flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Checking stock for {new Date(eventDate).toLocaleDateString("en-ZA")}...
                                </span>
                              ) : !av ? (
                                <span className="text-slate-500">Stock check unavailable.</span>
                              ) : (
                                <div className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span className="text-slate-700">
                                      <span className="font-semibold text-slate-900">{av.owned}</span> owned
                                    </span>
                                    <span className="text-slate-500">·</span>
                                    <span className="text-slate-700">
                                      <span className="font-semibold text-amber-700">{av.reserved}</span> reserved on this date
                                    </span>
                                    <span className="text-slate-500">·</span>
                                    <span className="text-emerald-700">
                                      <span className="font-semibold">{av.available}</span> free
                                    </span>
                                  </div>
                                  {/* Split display when we have a quantity.
                                      Wave 16 audit: Bobby's brief,
                                      "if I have 200 and need 8 it should
                                      say 'you have enough', not push
                                      hire-in messaging". When the requested
                                      qty fits in stock with room to spare,
                                      collapse to a clear green confirmation
                                      and skip the noise. Hire-in only
                                      surfaces when actually needed. */}
                                  {e.quantity > 0 && (
                                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                                      {split.fromHire === 0 && split.fromStock > 0 ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                                          <span aria-hidden>✓</span>
                                          You have enough: {split.fromStock} from stock ({av.available - split.fromStock} still free after this run)
                                        </span>
                                      ) : (
                                        <>
                                          {split.fromStock > 0 && (
                                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                              {split.fromStock} from stock
                                            </Badge>
                                          )}
                                          {split.fromHire > 0 && (
                                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-300">
                                              {split.fromHire} hire-in
                                            </Badge>
                                          )}
                                          {split.fromHire > 0 && (e.hireInCost ?? 0) > 0 && (
                                            <span className="text-[11px] text-amber-700">
                                              Extra cost to you: {fmtR(hireCost)}
                                              <span className="text-slate-400 ml-1">(R{(e.hireInCost ?? 0).toFixed(2)} × {split.fromHire})</span>
                                            </span>
                                          )}
                                          {split.fromHire > 0 && (e.hireInCost ?? 0) === 0 && (
                                            <span className="text-[11px] text-amber-700">
                                              Set hire-in cost on this catalog item to track the margin hit.
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  )}
                                  {av.conflicts.length > 0 && (
                                    <div className="text-[11px] text-slate-500 pt-1">
                                      Reserved by: {av.conflicts.slice(0, 3).map((c) => c.client_name || "Order").join(", ")}
                                      {av.conflicts.length > 3 && ` +${av.conflicts.length - 3} more`}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 mt-1.5 text-right">
                          {fmtR(e.unitPrice * e.quantity)}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Adjustments */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-600" />
                    Pricing adjustments
                  </CardTitle>
                  <CardDescription>Surge / weekend uplift, quote-level discounts.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs flex items-center gap-1">Surge / uplift (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={surgePct || ""}
                      onChange={(e) => setSurgePct(Math.max(0, safeNum(e.target.value)))}
                      placeholder="0"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Weekend / public-holiday uplift, applied to items.</p>
                  </div>
                  <div>
                    <Label className="text-xs">Discount (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={discountPct || ""}
                      onChange={(e) => setDiscountPct(Math.min(100, Math.max(0, safeNum(e.target.value))))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Discount (R)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={discountFlat || ""}
                      onChange={(e) => setDiscountFlat(Math.max(0, safeNum(e.target.value)))}
                      placeholder="0.00"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-base">Notes</CardTitle>
                  <CardDescription>Internal notes never go to the client.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">Internal note</Label>
                    <Textarea
                      rows={3}
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      placeholder="Kitchen prep, allergens, account context..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Note for client (shown on the quote email)</Label>
                    <Textarea
                      rows={3}
                      value={clientNotes}
                      onChange={(e) => setClientNotes(e.target.value)}
                      placeholder="Optional message that goes out with the quote."
                    />
                  </div>
                  {/* Phase 16 #1: chronological notes thread for the
                      quote - only renders once the quote has been
                      saved (we need a quoteId to thread off). Mirrors
                      the order notes thread for cross-team context. */}
                  {quoteId && companyId && (
                    <div className="pt-2 border-t border-slate-200">
                      <EntityNotesThread
                        entityType="quote"
                        entityId={quoteId}
                        companyId={companyId}
                        placeholder="Add an internal note for this quote - audit logged."
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right column: sticky summary + preview */}
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-6 space-y-4">
                <Card className="border-0 shadow-xl">
                  <CardHeader>
                    <CardTitle className="text-base">Running total</CardTitle>
                  </CardHeader>
                  {/* Wave 15 audit: under inc-VAT mode the previous layout
                      ("Items net" + "Subtotal" + "VAT" + "Total") buried
                      a confusing ex-VAT extraction line between the line
                      items and the gross total - e.g. Items 2100 +
                      Delivery 99.71 = 2199.71, but Subtotal showed
                      1912.79. Align with the public quote view + the
                      [id] editor: under inc-VAT show gross items +
                      delivery + Subtotal (incl VAT) + Total with a
                      "Includes VAT of R X" footnote. ex-VAT keeps the
                      legacy "Items net + Delivery + Subtotal + VAT
                      added on top + Total" layout. Also collapse the
                      "Items (gross)" + "Items net" duplicate row into
                      one "Items" line when there are no per-line
                      discounts (the typical case) - two identical
                      R-figures one under the other was visual noise. */}
                  <CardContent className="space-y-1.5 text-sm">
                    {(() => {
                      const incVat = pricingIncludesVat;
                      const hasLineDiscounts = computed.lineDiscounts > 0;
                      const itemsLabel = incVat ? "Items (incl VAT)" : "Items";
                      return (
                        <>
                          {hasLineDiscounts ? (
                            <>
                              <Row label={`${itemsLabel} (gross)`} value={fmtR(computed.itemsGross)} />
                              <Row label="Line discounts" value={`- ${fmtR(computed.lineDiscounts)}`} tone="discount" />
                              <Row label={`${itemsLabel} (net of line discount)`} value={fmtR(computed.itemsNet)} muted />
                            </>
                          ) : (
                            <Row label={itemsLabel} value={fmtR(computed.itemsNet)} />
                          )}
                          {computed.surge !== 0 && (
                            <Row label={`Surge (+${surgePct}%)`} value={`+ ${fmtR(computed.surge)}`} tone="warm" />
                          )}
                          {computed.pctDiscount > 0 && (
                            <Row label={`Discount (-${discountPct}%)`} value={`- ${fmtR(computed.pctDiscount)}`} tone="discount" />
                          )}
                          {computed.flatDiscount > 0 && (
                            <Row label="Flat discount" value={`- ${fmtR(computed.flatDiscount)}`} tone="discount" />
                          )}
                          <Row
                            label={
                              deliveryFeeOverridden || deliveryDistance === 0
                                ? "Delivery"
                                : `Delivery (${deliveryDistance.toFixed(1)}km × 2 @ R${deliveryCostPerKm}/km)`
                            }
                            value={fmtR(deliveryFee)}
                            muted
                          />
                          <div className="my-1 border-t border-slate-200" />
                          {incVat ? (
                            <Row label="Subtotal (incl VAT)" value={fmtR(computed.total)} />
                          ) : (
                            <>
                              <Row label="Subtotal" value={fmtR(computed.subtotal)} />
                              <Row label={`VAT (${(taxRate * 100).toFixed(0)}%)`} value={fmtR(computed.tax)} muted />
                            </>
                          )}
                          <div className="my-1 border-t border-slate-200" />
                          <Row label={`Total${pricingIncludesVat || taxRate > 0 ? " incl. VAT" : ""}`} value={fmtR(computed.total)} tone="bold" />
                          {incVat && computed.tax > 0 && (
                            <p className="text-[11px] text-slate-500 text-right pt-1">
                              Includes VAT ({(taxRate * 100).toFixed(0)}%) of {fmtR(computed.tax)}
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>

                {previewOpen && (
                  <Card className="border-0 shadow-xl">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Eye className="w-4 h-4" /> Client preview
                      </CardTitle>
                      <CardDescription>What goes out in the quote email.</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div className="rounded-lg border border-slate-200 p-3 bg-white">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-semibold">{eventName || "Untitled quote"}</p>
                          {quoteNumber && <span className="text-[11px] text-slate-500">{quoteNumber}</span>}
                        </div>
                        <p className="text-xs text-slate-500 mb-3">
                          {eventDate ? new Date(eventDate).toLocaleDateString("en-ZA") : "-"}
                          {guestCount ? ` • ${guestCount} guests` : ""}
                        </p>
                        <ul className="space-y-1 mb-3">
                          {menuItems.filter((l) => l.name).map((l, i) => {
                            const q =
                              l.pricingMode === "per_person" ? guestCount :
                              l.pricingMode === "flat" ? 1 : l.quantity;
                            const net = l.unitPrice * q * (1 - l.discountPct / 100);
                            return (
                              <li key={i} className="flex justify-between text-xs">
                                <span className="text-slate-700">{l.name} × {q}</span>
                                <span className="text-slate-900 font-medium">{fmtR(net)}</span>
                              </li>
                            );
                          })}
                          {equipment.filter((e) => e.name).map((e, i) => (
                            <li key={`e${i}`} className="flex justify-between text-xs">
                              <span className="text-slate-700">{e.name} × {e.quantity}</span>
                              <span className="text-slate-900 font-medium">{fmtR(e.unitPrice * e.quantity)}</span>
                            </li>
                          ))}
                          {/* Delivery line mirrors what shows on the
                              public quote PDF + email. Hidden when
                              there's no fee so on-site / collection
                              quotes stay clean. */}
                          {computed.deliveryFee > 0 && (
                            // Distance intentionally omitted from the
                            // client-facing line. The kitchen-to-venue
                            // km is internal context the operator uses
                            // to validate the fee, not something the
                            // client needs to see (and it can prompt
                            // unnecessary back-and-forth on quotes).
                            <li className="flex justify-between text-xs">
                              <span className="text-slate-700">Delivery</span>
                              <span className="text-slate-900 font-medium">{fmtR(computed.deliveryFee)}</span>
                            </li>
                          )}
                        </ul>
                        <div className="flex justify-between font-semibold border-t pt-2">
                          <span>Total (incl. VAT)</span>
                          <span className="text-emerald-600">{fmtR(computed.total)}</span>
                        </div>
                        {clientNotes && (
                          <p className="mt-3 text-xs text-slate-600 italic whitespace-pre-wrap border-t pt-2">{clientNotes}</p>
                        )}
                      </div>
                      {validityDays !== null && validityDays >= 0 && (
                        <p className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Quote valid for {validityDays} day{validityDays === 1 ? "" : "s"}.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {!email && clientName && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>Add a client email so we can send the branded quote when you hit Save & Send.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={companyId || undefined} />

      {/* Phase 3 #1: allergen gate. Triggered from handleSend when one
       *  or more picked menu items has allergens_reviewed_at = NULL.
       *  The staffer can either go back and review (Cancel) or accept
       *  the risk (Send anyway). The bypass path also stamps a console
       *  warning so the action is at least observable in dev. */}
      <AlertDialog open={allergenGateOpen} onOpenChange={setAllergenGateOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              Allergens not reviewed
            </AlertDialogTitle>
            <AlertDialogDescription>
              {unreviewedAllergenLines.length === 1 ? "1 item" : `${unreviewedAllergenLines.length} items`}{" "}
              on this quote haven't had their allergen declaration signed off:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="text-sm text-slate-700 list-disc pl-6 space-y-1 max-h-40 overflow-y-auto">
            {unreviewedAllergenLines.map((l) => (
              <li key={l.id}>{l.name || "(unnamed line)"}</li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">
            Sending now puts the client and kitchen on the hook without a signed allergen statement. Open each item on{" "}
            <Link href={withSlug("/admin/menu")} className="underline" target="_blank">/admin/menu</Link>{" "}
            and save it to mark it reviewed, or send anyway if the risk is accepted.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAllergenGateOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAllergenGateOpen(false);
                console.warn(
                  "[quotes/new] allergen gate bypassed - send with unreviewed items:",
                  unreviewedAllergenLines.map((l) => ({ id: l.menu_item_id, name: l.name })),
                );
                void handleSend({ bypassAllergenGate: true });
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Review email next
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* TIGHTEN I.66: preview-and-edit dialog. Opens after Save & Send
          + the allergens check passes. Operator sees the resolved
          template, edits the subject and body if they want, then
          clicks Send to actually email the client. If they Cancel,
          the quote is already persisted (so their content edits
          aren't lost) but the email doesn't fire. */}
      {companyId && (
        <QuoteSendDialog
          open={!!sendDialogQuote}
          onOpenChange={(open) => {
            if (!open) setSendDialogQuote(null);
          }}
          companyId={companyId}
          quote={sendDialogQuote}
          tenantName={null}
          onSent={() => {
            setSendDialogQuote(null);
            router.push(withSlug("/admin/quotes"));
          }}
        />
      )}
    </>
  );
}

// Small summary-row component used in the running-total card.
function Row({ label, value, muted, tone }: { label: string; value: string; muted?: boolean; tone?: "warm" | "discount" | "bold" }) {
  const valueClass =
    tone === "warm" ? "text-amber-600 font-medium" :
    tone === "discount" ? "text-rose-600 font-medium" :
    tone === "bold" ? "text-emerald-600 font-bold text-lg" :
    "text-slate-900 font-medium";
  return (
    <div className="flex items-baseline justify-between">
      <span className={`text-xs ${muted ? "text-slate-500" : "text-slate-600"}`}>{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}
