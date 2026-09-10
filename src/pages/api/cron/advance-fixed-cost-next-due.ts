/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";


const CRON_NAME = "advance-fixed-cost-next-due";

/**
 * FXC-B (fixed costs deferred follow-ups, 2026-05-23): nightly job
 * that walks active fixed_costs rows whose next_due_date is in the
 * past and advances the column forward by cadence until it's
 * >= today.
 *
 * Pre-FXC-B the page walked this forward client-side every render
 * (FXC-A) and surfaced a "Date drifted" amber chip when the stored
 * value was stale, but the database column itself kept drifting -
 * which meant any external consumer (analytics export, accounting
 * sync, a future RPC) saw the wrong date. This cron makes the
 * stored value authoritative again.
 *
 * Idempotent: a row that's already at-or-after today is skipped.
 * Each row's advance is wrapped in its own try so one bad cadence
 * doesn't unwind the batch. Cap of 200 iterations per row matches
 * the client-side walk's safety bound.
 *
 * Auth: Vercel cron bearer OR super_admin session, via
 * requireCronAuth.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  const startedAt = Date.now();
  let advanced = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // Date-only "today" in UTC. fixed_costs.next_due_date is a
    // postgres `date` column - no time-of-day, no TZ. UTC-today is
    // safe: a tenant in SAST (UTC+2) at 02:00 local has rolled into
    // tomorrow UTC already, so we'd advance their row a couple of
    // hours late at worst. That's an acceptable trade for not
    // having to join companies + iterate by timezone.
    const todayIso = new Date().toISOString().slice(0, 10);

    const { data: stale, error: selErr } = await sb
      .from("fixed_costs")
      .select("id, next_due_date, cadence, company_id")
      .lt("next_due_date", todayIso)
      .eq("active", true)
      .is("deleted_at", null)
      .limit(5000);

    if (selErr) {
      console.error("[advance-fixed-cost-next-due] select failed:", selErr);
      await recordCronHeartbeat(sb, CRON_NAME, "error", {
        source: auth.source,
        elapsed_ms: Date.now() - startedAt,
        error_message: selErr.message,
      });
      return res.status(500).json({ ok: false, error: selErr.message });
    }

    const rows = (stale || []) as Array<{ id: string; next_due_date: string; cadence: string; company_id: string }>;

    for (const r of rows) {
      try {
        const today = new Date(todayIso);
        const cur = new Date(r.next_due_date);
        if (isNaN(cur.getTime())) {
          failed += 1;
          continue;
        }
        let safety = 0;
        while (cur < today && safety < 200) {
          if (r.cadence === "weekly") cur.setDate(cur.getDate() + 7);
          else if (r.cadence === "monthly") cur.setMonth(cur.getMonth() + 1);
          else if (r.cadence === "quarterly") cur.setMonth(cur.getMonth() + 3);
          else if (r.cadence === "annual") cur.setFullYear(cur.getFullYear() + 1);
          else break;
          safety += 1;
        }
        if (cur < today) {
          // Hit the safety bound or unknown cadence - leave it for
          // an operator to look at via the "Date drifted" chip.
          skipped += 1;
          continue;
        }
        const nextIso = cur.toISOString().slice(0, 10);
        if (nextIso === r.next_due_date) {
          skipped += 1;
          continue;
        }
        const { error: updErr } = await sb
          .from("fixed_costs")
          .update({ next_due_date: nextIso })
          .eq("id", r.id);
        if (updErr) {
          console.error("[advance-fixed-cost-next-due] update failed:", r.id, updErr);
          failed += 1;
        } else {
          advanced += 1;
        }
      } catch (rowErr: any) {
        console.error("[advance-fixed-cost-next-due] row crashed:", r.id, rowErr?.message);
        failed += 1;
      }
    }

    await recordCronHeartbeat(sb, CRON_NAME, "ok", {
      source: auth.source,
      elapsed_ms: Date.now() - startedAt,
      processed: rows.length,
      advanced,
      skipped,
      failed,
    });

    return res.status(200).json({
      ok: true,
      total: rows.length,
      advanced,
      skipped,
      failed,
    });
  } catch (err: any) {
    console.error("[advance-fixed-cost-next-due] crashed:", err);
    await recordCronHeartbeat(sb, CRON_NAME, "error", {
      source: auth.source,
      elapsed_ms: Date.now() - startedAt,
      error_message: err?.message,
    });
    return res.status(500).json({ ok: false, error: err?.message || "crashed" });
  }
}

export default withApiLogging(handler);
