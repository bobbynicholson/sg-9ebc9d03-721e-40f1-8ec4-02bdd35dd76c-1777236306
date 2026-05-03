/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Branch settings resolver.
 *
 * Single source of truth for "what tax / deposit / delivery / cancellation
 * rules apply to this quote / order?" given a company + an optional
 * region. Every override on regions is nullable; NULL means inherit
 * from the company-level default. This helper does the composition so
 * pricing, invoicing and policy logic don't have to.
 *
 * Why a service and not inline logic in each caller:
 *   * The fall-through chain has to be applied identically everywhere
 *     (quote builder, order workflow, invoice generation, refund
 *     calculator). Inlining means each spot reinvents it and they
 *     drift.
 *   * The shape returned here is what the rest of the codebase wants
 *     to see -- numbers and booleans, not "look up region + maybe
 *     fall back, but mind the dispatch_settings.deliveryCostPerKm
 *     case which lives on a jsonb on companies".
 */
import { supabase } from "@/integrations/supabase/client";

export interface ResolvedBranchSettings {
  /** Source of each value, for "Override" / "Inherited" UI badges. */
  source: {
    vatRate: "region" | "company" | "default";
    vatRegistered: "region" | "company" | "default";
    depositPercent: "region" | "company" | "default";
    deliveryCostPerKm: "region" | "company" | "default";
    minDeliveryFee: "region" | "company" | "default";
    cancellationPolicy: "region" | "company" | "default";
  };
  /** VAT rate as a decimal (0.15 = 15%). */
  vatRate: number;
  vatRegistered: boolean;
  /** Deposit percentage of the quote / order total, 0-100. */
  depositPercent: number;
  /** Rand per kilometre. */
  deliveryCostPerKm: number;
  /** Floor delivery fee. */
  minDeliveryFee: number;
  /** Tenant-defined refund / cancellation buckets. */
  cancellationPolicy: any | null;
  /** Currency code resolved at the company level (regions inherit). */
  currency: string;
  /** Timezone code resolved at the company level. */
  timezone: string;
}

const HARD_DEFAULTS = {
  vatRate: 0.15,
  vatRegistered: false,
  depositPercent: 30,
  deliveryCostPerKm: 8.5,
  minDeliveryFee: 0,
  currency: "ZAR",
  timezone: "Africa/Johannesburg",
};

/**
 * Resolve effective settings for a (company, region) pair.
 *
 * Pass null for regionId when you have a company-wide artifact (e.g. a
 * legacy order with no branch stamped). The resolver gracefully falls
 * through to company defaults in that case.
 *
 * Errors are non-fatal: if either lookup fails, hard defaults from the
 * top of this file are used. Callers can rely on the return shape
 * being fully populated.
 */
export async function resolveBranchSettings(
  companyId: string,
  regionId: string | null,
): Promise<ResolvedBranchSettings> {
  // Fire both reads in parallel.
  const [companyRes, regionRes] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "vat_rate, vat_registered, deposit_percent, dispatch_settings, cancellation_policy, currency, timezone",
      )
      .eq("id", companyId)
      .maybeSingle(),
    regionId
      ? supabase
          .from("regions")
          .select(
            "vat_rate, vat_registered, deposit_percent, delivery_cost_per_km, min_delivery_fee, cancellation_policy",
          )
          .eq("id", regionId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
  ]);

  const company = (companyRes?.data as any) || {};
  const region = (regionRes?.data as any) || {};
  const dispatch = (company.dispatch_settings as any) || {};

  const pick = <T,>(
    regionVal: T | null | undefined,
    companyVal: T | null | undefined,
    fallback: T,
  ): { value: T; source: "region" | "company" | "default" } => {
    if (regionVal !== null && regionVal !== undefined) {
      return { value: regionVal, source: "region" };
    }
    if (companyVal !== null && companyVal !== undefined) {
      return { value: companyVal, source: "company" };
    }
    return { value: fallback, source: "default" };
  };

  // Unit reconciliation: region.vat_rate is stored as a decimal
  // (0.15 = 15%) per the regions_vat_rate_chk constraint, but the
  // legacy companies.vat_rate column stores percentage points (15.00).
  // Normalise the company side here so callers always receive a
  // decimal -- otherwise a tenant that uses the company default
  // would multiply the bill by 15× instead of by 1.15.
  const normalisedCompanyVat: number | null =
    typeof company.vat_rate === "number"
      ? (company.vat_rate > 1 ? company.vat_rate / 100 : company.vat_rate)
      : null;
  const vat = pick<number>(region.vat_rate, normalisedCompanyVat, HARD_DEFAULTS.vatRate);
  const vatReg = pick<boolean>(region.vat_registered, company.vat_registered, HARD_DEFAULTS.vatRegistered);
  const dep = pick<number>(region.deposit_percent, company.deposit_percent, HARD_DEFAULTS.depositPercent);
  const perKm = pick<number>(
    region.delivery_cost_per_km,
    typeof dispatch.deliveryCostPerKm === "number" ? dispatch.deliveryCostPerKm : null,
    HARD_DEFAULTS.deliveryCostPerKm,
  );
  const minFee = pick<number>(
    region.min_delivery_fee,
    typeof dispatch.minDeliveryFee === "number" ? dispatch.minDeliveryFee : null,
    HARD_DEFAULTS.minDeliveryFee,
  );
  const cancel = pick<any>(region.cancellation_policy, company.cancellation_policy, null);

  return {
    source: {
      vatRate: vat.source,
      vatRegistered: vatReg.source,
      depositPercent: dep.source,
      deliveryCostPerKm: perKm.source,
      minDeliveryFee: minFee.source,
      cancellationPolicy: cancel.source,
    },
    vatRate: Number(vat.value),
    vatRegistered: Boolean(vatReg.value),
    depositPercent: Number(dep.value),
    deliveryCostPerKm: Number(perKm.value),
    minDeliveryFee: Number(minFee.value),
    cancellationPolicy: cancel.value,
    currency: company.currency || HARD_DEFAULTS.currency,
    timezone: company.timezone || HARD_DEFAULTS.timezone,
  };
}
