/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Platform pricing plans API.
 *
 *   GET  /api/platform/pricing-plans
 *     Public read. Returns active plans ordered by sort_order.
 *
 *   PUT  /api/platform/pricing-plans
 *     Super-admin only. Body: { plans: PricingPlanInput[] }.
 *     Bulk upsert. Each input is matched by slug.
 *
 * The /pricing public page reads from this endpoint. The
 * /admin/platform/pricing-management page writes here.
 *
 * Used to be hard-coded in pricingCalculator.ts -- updates in the
 * admin UI never reached the marketing page. This endpoint is now
 * the single source of truth.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export interface PricingPlanRow {
  slug: string;
  name: string;
  sort_order: number;
  zar_price: number;
  usd_price: number;
  gbp_price: number;
  eur_price: number;
  features: string[];
  active_clients_limit: number | null;
  orders_per_quarter_limit: number | null;
  is_recommended: boolean;
  is_active: boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      // Public read -- service client so anonymous visitors on /pricing
      // can fetch without an auth session. RLS policy already grants
      // public select; we use service to avoid RLS overhead and the
      // anon-key cookie dance.
      const supabase: any = getServiceSupabase();
      const { data, error } = await supabase
        .from("platform_pricing_plans")
        .select("slug, name, sort_order, zar_price, usd_price, gbp_price, eur_price, features, active_clients_limit, orders_per_quarter_limit, is_recommended, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ plans: (data || []) as PricingPlanRow[] });
    }

    if (req.method === "PUT") {
      const ssr = createPagesServerClient({ req, res });
      const { data: { user } } = await ssr.auth.getUser();
      if (!user) return res.status(401).json({ error: "Not signed in" });

      const { data: profile } = await ssr
        .from("profiles")
        .select("role, active_role")
        .eq("id", user.id)
        .single();
      const role = (profile?.active_role || profile?.role || "") as string;
      if (role !== "super_admin") {
        return res.status(403).json({ error: "Super admin only" });
      }

      const plans = (req.body?.plans || []) as Array<Partial<PricingPlanRow>>;
      if (!Array.isArray(plans) || plans.length === 0) {
        return res.status(400).json({ error: "plans[] is required" });
      }

      const supabase: any = getServiceSupabase();
      const now = new Date().toISOString();
      const errors: string[] = [];

      for (const p of plans) {
        if (!p.slug) {
          errors.push("Plan missing slug");
          continue;
        }
        const update: Record<string, any> = {
          updated_by: user.id,
          updated_at: now,
        };
        if (p.name != null) update.name = p.name;
        if (p.sort_order != null) update.sort_order = p.sort_order;
        if (p.zar_price != null) update.zar_price = p.zar_price;
        if (p.usd_price != null) update.usd_price = p.usd_price;
        if (p.gbp_price != null) update.gbp_price = p.gbp_price;
        if (p.eur_price != null) update.eur_price = p.eur_price;
        if (p.features != null) update.features = p.features;
        if (p.active_clients_limit !== undefined) update.active_clients_limit = p.active_clients_limit;
        if (p.orders_per_quarter_limit !== undefined) update.orders_per_quarter_limit = p.orders_per_quarter_limit;
        if (p.is_recommended != null) update.is_recommended = p.is_recommended;
        if (p.is_active != null) update.is_active = p.is_active;

        const { error } = await supabase
          .from("platform_pricing_plans")
          .update(update)
          .eq("slug", p.slug);
        if (error) errors.push(`${p.slug}: ${error.message}`);
      }

      if (errors.length) return res.status(500).json({ error: errors.join("; ") });
      return res.status(200).json({ ok: true, updated: plans.length });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: any) {
    console.error("/api/platform/pricing-plans crashed:", e);
    return res.status(500).json({ error: e?.message || "Pricing endpoint failed" });
  }
}
