/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Per-form analytics block shown at the bottom of the customiser sidebar.
 * Sparkline of submissions/day, top referrers, conversion trend, and a
 * deep link into /admin/leads filtered by source=embed&form_id=...
 *
 * The chart is a plain SVG - no chart lib in package.json and we don't
 * need one for a 30-point line.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, ExternalLink } from "lucide-react";

interface Daily { date: string; count: number }
interface Ref   { referrer: string; count: number }

interface Props {
  formId: string;
}

export function AnalyticsBlock({ formId }: Props) {
  const [data, setData] = useState<{
    daily: Daily[]; topReferrers: Ref[]; last30: number; prev30: number;
    views: number; submissions: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const resp = await fetch(`/api/admin/embed/analytics?form_id=${formId}`);
        const json = await resp.json();
        if (!cancelled && resp.ok) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [formId]);

  if (loading) {
    return <div className="h-32 rounded-lg bg-slate-100 animate-pulse" />;
  }
  if (!data) {
    return <p className="text-xs text-slate-500">Analytics unavailable.</p>;
  }

  const trendUp = data.last30 >= data.prev30;
  const trendPct = data.prev30 > 0
    ? Math.round(((data.last30 - data.prev30) / data.prev30) * 100)
    : (data.last30 > 0 ? 100 : 0);

  const conversion = data.views > 0
    ? +(data.submissions / data.views * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-4">
      <Sparkline daily={data.daily} />

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-bold text-slate-900 tabular-nums">{data.last30}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">30d submits</div>
        </div>
        <div>
          <div className="text-lg font-bold text-emerald-600 tabular-nums">{conversion}%</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Conv rate</div>
        </div>
        <div>
          <div className={`text-lg font-bold tabular-nums flex items-center justify-center gap-1 ${trendUp ? "text-emerald-600" : "text-red-600"}`}>
            {trendUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {Math.abs(trendPct)}%
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">vs prev 30d</div>
        </div>
      </div>

      {data.topReferrers.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5 font-semibold">
            Top referrers
          </div>
          <ul className="space-y-1 text-xs">
            {data.topReferrers.map((r) => (
              <li key={r.referrer} className="flex justify-between gap-2">
                <span className="truncate text-slate-700" title={r.referrer}>{prettyRef(r.referrer)}</span>
                <span className="font-mono tabular-nums text-slate-500">{r.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href={`/admin/leads?source=embed&form_id=${formId}`}
        className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
      >
        View all submissions <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  );
}

function prettyRef(ref: string): string {
  if (ref === "(direct)") return "Direct / no referrer";
  try {
    const u = new URL(ref);
    return u.hostname.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return ref;
  }
}

function Sparkline({ daily }: { daily: Daily[] }) {
  const w = 220;
  const h = 60;
  const padding = 4;
  const max = Math.max(1, ...daily.map((d) => d.count));
  const stepX = (w - padding * 2) / Math.max(1, daily.length - 1);

  const points = daily.map((d, i) => {
    const x = padding + i * stepX;
    const y = h - padding - (d.count / max) * (h - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const lastPoint = points.split(" ").pop();
  const [lastX, lastY] = (lastPoint || "0,0").split(",").map(Number);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16">
        <defs>
          <linearGradient id="sparkGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`${padding},${h - padding} ${points} ${w - padding},${h - padding}`}
          fill="url(#sparkGrad)"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#6366f1"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {!Number.isNaN(lastX) && (
          <circle cx={lastX} cy={lastY} r="2.5" fill="#6366f1" />
        )}
      </svg>
      <p className="text-[10px] text-slate-500 mt-1">Submissions per day, last 30 days</p>
    </div>
  );
}
