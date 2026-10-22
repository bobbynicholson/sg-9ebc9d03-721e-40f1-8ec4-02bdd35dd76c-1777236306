import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenantHref } from "@/lib/tenantUrl";

export type ImportGap = { message: string; href: string; kind: string };
export function ImportReadinessBanner({ quoteId, orderId, menuIds = [] }: { quoteId?: string; orderId?: string; menuIds?: string[] }) {
  const { withSlug } = useTenantHref();
  const [gaps, setGaps] = useState<ImportGap[]>([]);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const menuKey = menuIds.filter((v) => /^[\da-f-]{36}$/i.test(v || "")).sort().join(",");
  useEffect(() => {
    if (!quoteId && !orderId && !menuKey) { setGaps([]); setError(""); return; }
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (quoteId) query.set("quoteId", quoteId);
    if (orderId) query.set("orderId", orderId);
    if (menuKey) query.set("menuIds", menuKey);
    fetch(`/api/document-imports/readiness?${query}`, { signal: controller.signal }).then(async (r) => {
      const body = await r.json(); if (!r.ok) throw new Error(body.error || "Could not check imported details.");
      setGaps(body.gaps || []); setError("");
    }).catch((e) => { if (e.name !== "AbortError") setError("Could not check imported details. Refresh before starting work."); });
    return () => controller.abort();
  }, [quoteId, orderId, menuKey, tick]);
  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  if (!gaps.length && !error) return null;
  return <section role="alert" aria-label="Imported details need attention" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><h2 className="flex items-center gap-2 text-base font-semibold"><AlertTriangle className="h-5 w-5 shrink-0" />Complete imported details first</h2>
        <p className="mt-1 text-sm">{error || "Save and review this booking now. Complete these details before sending, confirming or starting production."}</p>
      </div>
      {gaps[0] && <Button asChild size="sm"><Link href={withSlug(gaps.find((g) => g.kind === "review")?.href || gaps[0].href)}>Complete setup<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>}
      <Button type="button" size="sm" variant="outline" onClick={() => setTick((n) => n + 1)} aria-label="Recheck imported details"><RefreshCw className="h-4 w-4" /></Button>
    </div>
    {!!gaps.length && <ul className="mt-3 space-y-2 text-sm">{gaps.map((gap, i) => <li key={`${gap.href}-${i}`}><Link href={withSlug(gap.href)} className="underline underline-offset-2">{gap.message}</Link></li>)}</ul>}
  </section>;
}
