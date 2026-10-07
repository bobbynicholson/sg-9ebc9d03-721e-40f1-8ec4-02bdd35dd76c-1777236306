/**
 * "AI models and prices" section of /admin/platform/tech-costs.
 *
 * For every AI feature: the providers the server tries, in order, the
 * model each would use, its price per 1M tokens, the cost of one typical
 * call, and whether that provider's key is set in this environment. The
 * first step with a key is the one in use; later ones are fallbacks.
 * OpenRouter prices come from OpenRouter's live price list when available.
 */
import { ExternalLink, Bot } from "lucide-react";
import { PortalCard, PortalCardHeader } from "@/components/portal/ui";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  AI_MODEL_PRICES,
  FEATURE_TOKEN_PROFILE,
  PRICING_LINKS,
  priceForModel,
  resolvePrice,
  type LivePrices,
  type PricingLink,
  type ResolvedPrice,
} from "@/lib/techCosts/model";
import type { AiRoute } from "@/server/ai/routes";

const PROVIDER_NAMES: Record<string, string> = {
  openrouter: "OpenRouter",
  groq: "Groq",
  openai: "OpenAI",
  anthropic: "Anthropic",
  none: "Not set up",
};
const PROVIDER_LINKS: Record<string, PricingLink> = {
  openrouter: PRICING_LINKS.openrouterOss20b,
  groq: PRICING_LINKS.groq,
  openai: PRICING_LINKS.openai,
  anthropic: PRICING_LINKS.anthropic,
};

/** Exact US$ price: up to 6 decimals, never fewer than 2 ($0.30, $0.018, $0.6525). */
const exact = (n: number) => {
  const [whole, frac = ""] = Number(n.toFixed(6)).toString().split(".");
  return `$${whole}.${frac.padEnd(2, "0")}`;
};
const perCallUsd = (feature: string, price: ResolvedPrice) => {
  const t = FEATURE_TOKEN_PROFILE[feature] ?? { input: 0, output: 0 };
  return (t.input / 1_000_000) * price.input_usd_per_m + (t.output / 1_000_000) * price.output_usd_per_m;
};
const linkFor = (provider: string, model: string): PricingLink | undefined =>
  (provider === "openrouter" ? AI_MODEL_PRICES.find((m) => m.id === model && m.provider === "OpenRouter")?.link : undefined)
  ?? (provider === "openrouter" ? { label: "OpenRouter model page", url: `https://openrouter.ai/${model}` } : PROVIDER_LINKS[provider]);

export function AiModelPrices({
  routes,
  livePrices,
  liveFetchedAt,
  featureLabel,
  usdToZar,
}: {
  routes: AiRoute[];
  livePrices: LivePrices;
  liveFetchedAt: string | null;
  featureLabel: (key: string) => string;
  usdToZar: number;
}) {
  // Tiny per-call costs (embeddings) keep enough decimals to stay non-zero.
  const zarCall = (usd: number) => {
    const zar = usd * usdToZar;
    const digits = zar === 0 || zar >= 0.0001 ? 4 : 7;
    return `ZAR ${zar.toLocaleString("en-ZA", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  };

  // Every distinct provider + model the routes can use, for the price list.
  const models = new Map<string, { provider: string; model: string }>();
  for (const r of routes) for (const s of r.steps) {
    models.set(`${s.provider}|${s.model}`, { provider: s.provider, model: s.model });
    if (s.retryModel) models.set(`${s.provider}|${s.retryModel}`, { provider: s.provider, model: s.retryModel });
  }

  return (
    <PortalCard className="mb-6">
      <PortalCardHeader
        title={
          <>
            <Bot className="w-4 h-4 text-brand-primary" />
            AI models and prices
            <InfoTooltip content={"For each AI feature, the providers the server tries in order. The first one with a key set is in use; the rest are fallbacks if it fails. Cost per call uses typical token counts; the live spend above records the real ones."} />
          </>
        }
      />
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Prices are US$ per 1 million tokens (input · output).
        {liveFetchedAt
          ? ` OpenRouter prices are live from OpenRouter (checked ${new Date(liveFetchedAt).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}).`
          : " OpenRouter's live price list could not be reached, so its published rates are shown."}
      </p>

      <div className="space-y-3">
        {routes.map((route) => {
          const activeIndex = route.steps.findIndex((s) => s.configured);
          return (
            <div key={route.feature} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{featureLabel(route.feature)}</p>
                {activeIndex >= 0 ? (
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    In use: <span className="font-semibold">{PROVIDER_NAMES[route.steps[activeIndex].provider] ?? route.steps[activeIndex].provider} · {route.steps[activeIndex].model}</span>
                    {" · "}
                    <span className="font-mono">{zarCall(perCallUsd(route.feature, resolvePrice(route.steps[activeIndex].provider, route.steps[activeIndex].model, livePrices)))}</span> per call
                  </p>
                ) : (
                  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">No provider key set - this feature is off</p>
                )}
              </div>
              <ol className="space-y-1">
                {route.steps.map((step, i) => {
                  const price = resolvePrice(step.provider, step.model, livePrices);
                  const retry = step.retryModel ? resolvePrice(step.provider, step.retryModel, livePrices) : null;
                  const status = !step.configured ? "Not set up" : i === activeIndex ? "In use" : "Fallback";
                  return (
                    <li key={`${step.provider}-${i}`} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs ${step.configured ? "" : "opacity-50"}`}>
                      <span className="w-4 text-slate-400">{i + 1}.</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300 w-24">{PROVIDER_NAMES[step.provider] ?? step.provider}</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300 break-all">{step.model}</span>
                      <span className="font-mono text-slate-500 dark:text-slate-400">
                        {price.source === "unknown" ? "price unknown" : `${exact(price.input_usd_per_m)} · ${exact(price.output_usd_per_m)}`}
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400">{zarCall(perCallUsd(route.feature, price))}/call</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status === "In use" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : status === "Fallback" ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                        {status}
                      </span>
                      {retry && (
                        <span className="basis-full pl-[7.5rem] text-[11px] text-slate-500 dark:text-slate-400">
                          Retry if nothing is read: <span className="font-mono">{step.retryModel}</span> ({exact(retry.input_usd_per_m)} · {exact(retry.output_usd_per_m)})
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              {route.note && <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{route.note}</p>}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] uppercase font-bold tracking-wide text-slate-500 dark:text-slate-400 mt-6 mb-2">Price list</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <th className="py-1.5 pr-3">Provider</th>
              <th className="py-1.5 pr-3">Model</th>
              <th className="py-1.5 pr-3 text-right">Input / 1M</th>
              <th className="py-1.5 pr-3 text-right">Output / 1M</th>
              <th className="py-1.5 pr-3">Source</th>
              <th className="py-1.5">Pricing page</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {[...models.values()].map(({ provider, model }) => {
              const price = resolvePrice(provider, model, livePrices);
              const published = priceForModel(model, provider);
              const differs = price.source === "openrouter-live" && published
                && (Math.abs(published.input_usd_per_m - price.input_usd_per_m) > 1e-9 || Math.abs(published.output_usd_per_m - price.output_usd_per_m) > 1e-9);
              const link = linkFor(provider, model);
              return (
                <tr key={`${provider}|${model}`}>
                  <td className="py-1.5 pr-3">{PROVIDER_NAMES[provider] ?? provider}</td>
                  <td className="py-1.5 pr-3 font-mono break-all">{model}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{price.source === "unknown" ? "-" : exact(price.input_usd_per_m)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{price.source === "unknown" ? "-" : exact(price.output_usd_per_m)}</td>
                  <td className="py-1.5 pr-3">
                    {price.source === "openrouter-live" ? "OpenRouter live" : price.source === "published" ? "Published rate" : "Unknown"}
                    {differs && <span className="ml-1 text-amber-700 dark:text-amber-400">(changed from {exact(published!.input_usd_per_m)} · {exact(published!.output_usd_per_m)})</span>}
                  </td>
                  <td className="py-1.5">
                    {link && (
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-primary hover:underline">
                        {link.label} <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PortalCard>
  );
}
