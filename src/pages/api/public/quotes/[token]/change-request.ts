/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getRequestSupabase } from "@/lib/supabase/service";
import { emailService } from "@/services/emailService";
import {
  applyCorsHeaders,
  checkAndIncrementRateLimit,
  getClientIp,
  hashIp,
  isUuid,
  verifyTurnstile,
} from "@/lib/embedFormApi";
import { withApiLogging } from "@/lib/withApiLogging";
import {
  buildQuoteChangeEditorPath,
  isPastCalendarDate,
} from "@/lib/quotes/revisionLifecycle";


/**
 * POST /api/public/quotes/[token]/change-request
 *
 * Public, unauthenticated. Records a tweak request from the client on
 * the public quote view.
 *
 * Hardening:
 *   - 16KB body cap (the form has one freeform message + a few short
 *     structured fields)
 *   - Honeypot: silent 200 if filled
 *   - Token-scoped rate limit (5/hour/ip per quote, 20/hour/ip total)
 *   - Per-quote lifetime cap of 10 requests so a malicious forwarder
 *     can't weaponise the form into a notification flood
 *   - company_id derived server-side from quote, never trusted from body
 */

const MAX_MESSAGE = 4000;
const MIN_MESSAGE = 10;
const MAX_NAME = 200;
const MAX_PER_QUOTE_LIFETIME = 10;

export const config = {
  api: { bodyParser: { sizeLimit: "16kb" } },
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  applyCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false });
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) return res.status(404).json({ ok: false, error: "Not found" });

  const body = (req.body || {}) as Record<string, any>;

  // Honeypot - silent success to avoid signalling bots.
  const honeypot = typeof body.honeypot === "string" ? body.honeypot : "";
  if (honeypot.trim().length > 0) return res.status(200).json({ ok: true });

  const message =
    typeof body.message === "string"
      ? body.message.trim().slice(0, MAX_MESSAGE)
      : "";
  if (message.length < MIN_MESSAGE) {
    return res.status(400).json({
      ok: false,
      error: `Please give us at least ${MIN_MESSAGE} characters so we know what to change.`,
    });
  }

  const submitterName =
    typeof body.submitterName === "string"
      ? body.submitterName.trim().slice(0, MAX_NAME)
      : null;

  // Optional structured tweaks. Whitelist keys so a bad client can't
  // pollute the jsonb column with arbitrary data.
  const rawChanges =
    body.requestedChanges && typeof body.requestedChanges === "object"
      ? body.requestedChanges
      : {};
  const requestedChanges: Record<string, any> = {};
  if (typeof rawChanges.event_date === "string" && rawChanges.event_date) {
    requestedChanges.event_date = rawChanges.event_date.slice(0, 64);
  }
  if (typeof rawChanges.guest_count === "number" && Number.isFinite(rawChanges.guest_count)) {
    requestedChanges.guest_count = Math.max(0, Math.min(99999, Math.round(rawChanges.guest_count)));
  } else if (typeof rawChanges.guest_count === "string" && rawChanges.guest_count.trim()) {
    const n = parseInt(rawChanges.guest_count, 10);
    if (Number.isFinite(n)) requestedChanges.guest_count = Math.max(0, Math.min(99999, n));
  }
  if (typeof rawChanges.menu_changes === "string" && rawChanges.menu_changes.trim()) {
    requestedChanges.menu_changes = rawChanges.menu_changes.trim().slice(0, 2000);
  }
  if (typeof rawChanges.venue_address === "string" && rawChanges.venue_address.trim()) {
    requestedChanges.venue_address = rawChanges.venue_address.trim().slice(0, 500);
  }
  if (typeof rawChanges.logistics_changes === "string" && rawChanges.logistics_changes.trim()) {
    requestedChanges.logistics_changes = rawChanges.logistics_changes.trim().slice(0, 2000);
  }
  if (rawChanges.waiter_service === true) {
    requestedChanges.waiter_service = true;
  }
  // Structured item picks from the in-form editor. Sanitise hard: cap the
  // array, keep only known fields, coerce types, clamp quantities. A line
  // with no name is dropped. Empty arrays are kept (they mean "remove
  // everything of this kind"), but absent / non-array stays absent.
  const MAX_LINES = 100;
  const sanitiseMenu = (arr: any[]) =>
    arr.slice(0, MAX_LINES).map((it) => ({
      menu_item_id: typeof it?.menu_item_id === "string" ? it.menu_item_id.slice(0, 64) : null,
      item_name: typeof it?.item_name === "string" ? it.item_name.trim().slice(0, 200) : "",
      unit_price: Math.max(0, Math.min(1e7, Number(it?.unit_price) || 0)),
      quantity: Math.max(0, Math.min(99999, Math.round(Number(it?.quantity) || 0))),
    })).filter((l) => l.item_name);
  const sanitiseEquip = (arr: any[]) =>
    arr.slice(0, MAX_LINES).map((it) => ({
      equipment_id: typeof it?.equipment_id === "string" ? it.equipment_id.slice(0, 64) : null,
      name: typeof it?.name === "string" ? it.name.trim().slice(0, 200) : "",
      unit_price: Math.max(0, Math.min(1e7, Number(it?.unit_price) || 0)),
      quantity: Math.max(0, Math.min(99999, Math.round(Number(it?.quantity) || 0))),
    })).filter((l) => l.name);
  if (Array.isArray(rawChanges.menu_items)) {
    requestedChanges.menu_items = sanitiseMenu(rawChanges.menu_items);
  }
  if (Array.isArray(rawChanges.equipment_items)) {
    requestedChanges.equipment_items = sanitiseEquip(rawChanges.equipment_items);
  }

  const supabase = await getRequestSupabase();
  const ip = getClientIp(req as any);
  const ipHash = hashIp(ip);
  const userAgent =
    typeof req.headers["user-agent"] === "string"
      ? (req.headers["user-agent"] as string).slice(0, 500)
      : null;

  // Turnstile - only enforced when TURNSTILE_SECRET_KEY is set in the
  // environment. Mirrors the embed-form pattern so dev / test envs
  // (without the secret) keep working unchanged. When configured, a
  // failed challenge returns 200 ok:false rather than 4xx so bots get
  // no signal about which check tripped them.
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const turnstileToken =
      typeof body.turnstileToken === "string" ? body.turnstileToken : "";
    const result = await verifyTurnstile(turnstileToken, turnstileSecret, ip);
    if (!result.ok) {
      return res.status(200).json({
        ok: false,
        error: "Challenge failed, please refresh and try again.",
      });
    }
  }

  // Rate limit - tighter than view since this fans out to admin
  // notifications.
  const rl = await checkAndIncrementRateLimit(token, ipHash, supabase, {
    limit: 10,
    bucket: "hour",
  });
  if (!rl.allowed) {
    return res.status(429).json({
      ok: false,
      error: "Too many requests, please wait a bit before sending another.",
    });
  }

  // Resolve quote.
  const { data: quote, error: quoteErr } = await (supabase as any)
    .from("quotes")
    // Wave 12 follow-up: currency lives on companies, not quotes.
    // Selecting it here used to throw "column quotes.currency does
    // not exist" and 500 every public change-request submission.
    .select("id, company_id, user_id, lead_id, client_name, quote_number, total, event_date, deleted_at")
    .eq("public_token", token)
    .maybeSingle();
  if (quoteErr) {
    console.error("[public/quotes/[token]/change-request] quotes fetch failed:", quoteErr);
  }

  if (!quote || quote.deleted_at) return res.status(404).json({ ok: false, error: "Quote not found" });

  if (
    requestedChanges.event_date
    && isPastCalendarDate(requestedChanges.event_date, new Date().toISOString().slice(0, 10))
  ) {
    return res.status(400).json({
      ok: false,
      error: "The new event date cannot be in the past.",
    });
  }

  // Per-quote lifetime cap.
  const { count } = await (supabase as any)
    .from("quote_change_requests")
    .select("id", { count: "exact", head: true })
    .eq("quote_id", quote.id);
  if (typeof count === "number" && count >= MAX_PER_QUOTE_LIFETIME) {
    return res.status(429).json({
      ok: false,
      error: `You've sent ${MAX_PER_QUOTE_LIFETIME} change requests on this quote. Please contact us directly for further changes.`,
    });
  }

  // Insert - company_id always derived from the quote, never from
  // body, so a token holder can't pollute another tenant.
  const { data: inserted, error: insertErr } = await (supabase as any)
    .from("quote_change_requests")
    .insert([{
      company_id: quote.company_id,
      quote_id: quote.id,
      lead_id: quote.lead_id || null,
      message,
      requested_changes: Object.keys(requestedChanges).length > 0 ? requestedChanges : null,
      submitter_name: submitterName,
      submitter_ip_hash: ipHash,
      submitter_user_agent: userAgent,
    }])
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("[public/quotes/change-request] insert failed", insertErr);
    return res.status(500).json({ ok: false, error: "Could not send your message, please try again." });
  }

  // ---- Auto-apply the requested changes onto the quote ----
  // The operator should open the quote and see the CLIENT'S numbers, not
  // the old ones. We write the requested date / guests / venue / items
  // straight onto the quote, recompute the total so the figure stays
  // internally consistent (lines + fees - discount = total), and flip the
  // quote to 'draft' so the operator reprices + re-sends. The client can't
  // accept in the meantime: the public page hides Accept/Decline whenever a
  // pending change request exists. The operator's Save & Send finalises the
  // exact price and marks the request addressed. Best-effort: a failure
  // here must not break the client's 200 (the request row is already saved).
  try {
    const { data: full } = await (supabase as any)
      .from("quotes")
      .select("guest_count, menu_items, equipment_items, delivery_fee, collection_fee, discount_amount, waiter_service_required, waiter_total_fee")
      .eq("id", quote.id)
      .maybeSingle();

    const quoteUpdate: Record<string, any> = {};
    if (requestedChanges.waiter_service === true) {
      // The client can request waiter service, but only the authenticated
      // operator may set the staffing, hours, and rate that become billable.
      // Mark the quote for review without inventing a price on the client's
      // behalf; the admin quote editor will price and resend it.
      quoteUpdate.waiter_service_required = true;
    }
    if (requestedChanges.event_date) quoteUpdate.event_date = requestedChanges.event_date;
    const requestedGuestCount =
      typeof requestedChanges.guest_count === "number"
        ? Math.max(0, Number(requestedChanges.guest_count) || 0)
        : null;
    const previousGuestCount = Math.max(0, Number((full as any)?.guest_count) || 0);
    const guestCountChanged =
      requestedGuestCount != null && requestedGuestCount !== previousGuestCount;
    if (requestedGuestCount != null) quoteUpdate.guest_count = requestedGuestCount;
    if (requestedChanges.venue_address) quoteUpdate.venue_address = requestedChanges.venue_address;

    let newMenu: any[] | null = null;
    let newEquip: any[] | null = null;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const recalcLineTotal = (item: any, quantity: number) => {
      const unit = [
        item.unit_price,
        item.unitPrice,
        item.pricePerPerson,
        item.price_per_person,
        item.base_price,
      ]
        .map((v) => Number(v))
        .find((n) => Number.isFinite(n)) || 0;
      const discountPct = Number(item.discount_pct ?? item.discountPct ?? 0) || 0;
      return round2(Math.max(0, quantity * unit * (1 - discountPct / 100)));
    };
    const normaliseMode = (item: any) =>
      String(item?.pricing_mode ?? item?.pricingMode ?? item?.pricingModeLabel ?? "")
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    const shouldFollowGuestCount = (item: any) => {
      const mode = normaliseMode(item);
      const qty = Number(item?.quantity);
      if (["per_person", "per_guest", "per_head"].includes(mode)) return true;
      return ["per_portion", "per_portions"].includes(mode)
        && previousGuestCount > 0
        && Number.isFinite(qty)
        && Math.abs(qty - previousGuestCount) < 0.001;
    };
    const existingMenu = Array.isArray((full as any)?.menu_items) ? (full as any).menu_items : [];
    const existingByKey = new Map<string, any>();
    for (const item of existingMenu) {
      const id = typeof item?.menu_item_id === "string" ? item.menu_item_id : "";
      const name = String(item?.item_name || item?.name || "").trim().toLowerCase();
      if (id) existingByKey.set(`id:${id}`, item);
      if (name) existingByKey.set(`name:${name}`, item);
    }
    const findExistingLine = (incoming: any) => {
      const id = typeof incoming?.menu_item_id === "string" ? incoming.menu_item_id : "";
      const name = String(incoming?.item_name || incoming?.name || "").trim().toLowerCase();
      return (id ? existingByKey.get(`id:${id}`) : null) || (name ? existingByKey.get(`name:${name}`) : null) || null;
    };

    if (Array.isArray(requestedChanges.menu_items)) {
      newMenu = requestedChanges.menu_items.map((m: any) => {
        const existingLine = findExistingLine(m);
        const base = existingLine ? { ...existingLine } : {};
        const shouldScale = guestCountChanged && shouldFollowGuestCount(existingLine || m);
        const quantity = shouldScale
          ? (requestedGuestCount || 0)
          : (Number(m.quantity) || 0);
        const merged = {
          ...base,
          menu_item_id: m.menu_item_id ?? base.menu_item_id ?? null,
          item_name: m.item_name || base.item_name || base.name,
          name: m.item_name || base.name || base.item_name,
          quantity,
          unit_price: Number(m.unit_price ?? base.unit_price ?? base.unitPrice ?? base.pricePerPerson) || 0,
          pricing_mode: base.pricing_mode ?? base.pricingMode ?? "per_portion",
        };
        return {
          ...merged,
          line_total: recalcLineTotal(merged, quantity),
        };
      });
      quoteUpdate.menu_items = newMenu;
    }
    if (Array.isArray(requestedChanges.equipment_items)) {
      newEquip = requestedChanges.equipment_items.map((e: any) => ({
        equipment_id: e.equipment_id ?? null,
        name: e.name,
        quantity: Number(e.quantity) || 0,
        unit_price: Number(e.unit_price) || 0,
        line_total: Math.round((Number(e.quantity) || 0) * (Number(e.unit_price) || 0) * 100) / 100,
      }));
      quoteUpdate.equipment_items = newEquip;
    }

    if (guestCountChanged && !Array.isArray(requestedChanges.menu_items)) {
      const adjustedMenu = existingMenu.map((item: any) => {
        if (!shouldFollowGuestCount(item)) return item;
        const quantity = requestedGuestCount || 0;
        return {
          ...item,
          quantity,
          line_total: recalcLineTotal(item, quantity),
        };
      });
      if (adjustedMenu.some((item: any, index: number) => item !== existingMenu[index])) {
        newMenu = adjustedMenu;
        quoteUpdate.menu_items = adjustedMenu;
      }
    }

    // Recompute totals when the item set or guest-driven quantities changed.
    if (newMenu || newEquip) {
      const menuArr = newMenu || (Array.isArray((full as any)?.menu_items) ? (full as any).menu_items : []);
      const equipArr = newEquip || (Array.isArray((full as any)?.equipment_items) ? (full as any).equipment_items : []);
      const lineSum = (arr: any[], priceKeys: string[]) =>
        arr.reduce((s, x) => {
          const explicitTotal = Number(x.line_total ?? x.lineTotal ?? x.total);
          if (Number.isFinite(explicitTotal)) return s + Math.max(0, explicitTotal);
          const qty = Number(x.quantity) || 0;
          const price = priceKeys.map((k) => Number(x[k])).find((n) => Number.isFinite(n) && n > 0) || 0;
          return s + qty * price;
        }, 0);
      const menuSum = lineSum(menuArr, ["unit_price", "pricePerPerson", "base_price"]);
      const equipSum = lineSum(equipArr, ["unit_price", "rentalPrice", "rental_price"]);
      const delivery = Number((full as any)?.delivery_fee) || 0;
      const collection = Number((full as any)?.collection_fee) || 0;
      const discount = Number((full as any)?.discount_amount) || 0;
      const itemsAndFees = Math.max(0, menuSum + equipSum + delivery + collection - discount);

      // Resolve the tenant's VAT convention so the stored subtotal/tax/total
      // agree with how the public quote renders them.
      let incVat = false;
      let vatReg = false;
      let rate = 0.15;
      try {
        const { data: co } = await (supabase as any)
          .from("companies")
          .select("vat_registered, vat_rate, pricing_includes_vat")
          .eq("id", quote.company_id)
          .maybeSingle();
        incVat = (co as any)?.pricing_includes_vat === true;
        vatReg = !!(co as any)?.vat_registered;
        const r = Number((co as any)?.vat_rate);
        if (Number.isFinite(r) && r > 0) rate = r > 1 ? r / 100 : r;
      } catch { /* defaults */ }

      if (incVat) {
        // Prices are gross. total == items+fees; VAT is the embedded portion.
        quoteUpdate.total = round2(itemsAndFees);
        quoteUpdate.total_amount = round2(itemsAndFees);
        quoteUpdate.subtotal = round2(itemsAndFees);
        quoteUpdate.tax_amount = vatReg ? round2(itemsAndFees - itemsAndFees / (1 + rate)) : 0;
      } else {
        // Prices are net. VAT adds on top.
        const tax = vatReg ? round2(itemsAndFees * rate) : 0;
        quoteUpdate.subtotal = round2(itemsAndFees);
        quoteUpdate.tax_amount = tax;
        quoteUpdate.total = round2(itemsAndFees + tax);
        quoteUpdate.total_amount = round2(itemsAndFees + tax);
      }
    }

    if (Object.keys(quoteUpdate).length > 0) {
      const { error: applyErr } = await (supabase as any)
        .from("quotes")
        .update(quoteUpdate)
        .eq("id", quote.id);
      if (applyErr) {
        console.error("[public/quotes/change-request] auto-apply failed:", applyErr);
      }
    }
  } catch (e) {
    console.warn("[public/quotes/change-request] auto-apply threw:", e);
  }

  // Notify admin (best-effort). Fan out to every operator who can
  // act on the change request - the previous single-row insert only
  // hit quote.user_id, which often doesn't match the actual sales
  // owner. related_entity powers the contextual CTA on the
  // notifications page; #change-requests anchor lands the operator on
  // the right card on /admin/quotes/{id}.
  //
  // AWAITED, not fire-and-forget: on Vercel the lambda freezes as soon
  // as the response is sent, which silently killed the operator email
  // (Pic 43 - client requested changes, nothing landed in the inbox).
  // The inner try/catches keep a notification failure from breaking
  // the client's 200.
  await (async () => {
    try {
      // Resolve currency + contact email from the company.
      let currencyCode = "ZAR";
      let companyEmail: string | null = null;
      let companyName: string | null = null;
      let companySlug: string | null = null;
      try {
        const { data: companyRow, error: companyRowErr } = await (supabase as any)
          .from("companies")
          .select("currency, email, company_name, slug")
          .eq("id", quote.company_id)
          .maybeSingle();
        if (companyRowErr) {
          console.error("[public/quotes/[token]/change-request] companies fetch failed:", companyRowErr);
        }
        if ((companyRow as any)?.currency) currencyCode = (companyRow as any).currency;
        if ((companyRow as any)?.email) companyEmail = (companyRow as any).email;
        if ((companyRow as any)?.company_name) companyName = (companyRow as any).company_name;
        if ((companyRow as any)?.slug) companySlug = String((companyRow as any).slug);
      } catch { /* fall back to ZAR */ }
      const totalLabel = `${currencyCode} ${Number(quote.total || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
      const eventLabel = quote.event_date
        ? new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
        : "TBD";
      const summary = message.length > 140 ? message.slice(0, 137) + "..." : message;

      // Notify the MAIN operator only, not every admin-level account.
      // Fanning out to company_admin + admin + sales_admin + region_admin +
      // owner meant a tenant with two admin logins (e.g. hello@ and admin@)
      // got two notifications for one change request, which reads as a
      // duplicate. We resolve the company's main-operator profiles
      // (company_admin / owner) for the email fallback, and target the
      // single most-relevant in-app recipient: the quote owner if set,
      // otherwise those operator profiles.
      const { data: operators, error: operatorsErr } = await (supabase as any)
        .from("profiles")
        .select("id, role, email")
        .eq("company_id", quote.company_id)
        .in("role", ["company_admin", "owner"]);
      if (operatorsErr) {
        console.error("[public/quotes/[token]/change-request] profiles fetch failed:", operatorsErr);
      }
      const operatorList = ((operators as any[]) || []);

      const recipientIds = Array.from(
        new Set(
          (quote.user_id ? [quote.user_id] : operatorList.map((r) => r.id)).filter(Boolean) as string[],
        ),
      );
      if (recipientIds.length === 0) return;

      const editorPath = buildQuoteChangeEditorPath(quote.id, inserted.id);
      const rows = recipientIds.map((rid: string) => ({
        company_id: quote.company_id,
        user_id: rid,
        recipient_id: rid,
        notification_type: "quote_change_request",
        title: "✏️ Client wants changes to a quote",
        message: `${submitterName || quote.client_name || "Client"} requested changes (${totalLabel}, ${eventLabel}): "${summary}"`,
        priority: "high",
        link: editorPath,
        related_entity_type: "quote",
        related_entity_id: quote.id,
      }));
      await (supabase as any).from("notifications").insert(rows);

      // Email the operator inbox so they don't miss it. companies.email
      // is the preferred target, but plenty of tenants never fill it in
      // - in that case fall back to the operator profile emails so the
      // alert isn't silently dropped.
      const emailTargets: string[] = companyEmail
        ? [companyEmail]
        : Array.from(
            new Set(
              (operatorList
                .map((r) => (typeof r.email === "string" ? r.email.trim() : ""))
                .filter(Boolean)) as string[]
            )
          );
      if (emailTargets.length > 0) {
        const quoteRef = (quote as any).quote_number || quote.id;
        const clientLabel = submitterName || quote.client_name || "Client";
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com").replace(/\/$/, "");
        // Slug-prefix so the admin link lands in the operator's existing
        // tenant URL space (/{slug}/admin/...) - a bare /admin/... opens a
        // fresh tab with no company/session context (Pic 65).
        const quoteLink = `${appUrl}${companySlug ? `/${companySlug}` : ""}${editorPath}`;

        const bodyHtml = `
          <p>Hi,</p>
          <p><strong>${clientLabel}</strong> has requested changes to quote <strong>${quoteRef}</strong> (${eventLabel} &mdash; ${totalLabel}).</p>
          <blockquote style="border-left:3px solid #e2e8f0;margin:16px 0;padding:8px 16px;color:#475569;font-style:italic">
            ${message.replace(/\n/g, "<br/>")}
          </blockquote>
          <p><a href="${quoteLink}" style="color:#4f46e5">View change request &rarr;</a></p>
          <p style="font-size:12px;color:#94a3b8">${companyName || "CateringMS"} &mdash; automated notification</p>
        `;

        for (const target of emailTargets) {
          try {
            await emailService.sendEmail({
              companyId: quote.company_id,
              to: target,
              subject: `Client change request - ${quoteRef} (${clientLabel})`,
              body: bodyHtml,
              quoteId: quote.id,
              skipUnsubscribeFooter: true,
              _client: supabase,
            } as any);
          } catch (emailErr) {
            console.warn(`[public/quotes/change-request] operator email to ${target} failed`, emailErr);
          }
        }
      } else {
        console.warn(
          `[public/quotes/change-request] no operator email target for company ${quote.company_id} - set companies.email in Settings`
        );
      }
    } catch (err) {
      console.warn("[public/quotes/change-request] notification failed", err);
    }
  })();

  return res.status(200).json({ ok: true });
}

export default withApiLogging(handler);
