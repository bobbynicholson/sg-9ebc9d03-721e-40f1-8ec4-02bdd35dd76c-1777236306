/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";

const CRON_NAME = "stale-shopping-list-alert";
const STALE_AFTER_DAYS = 7;
const TEMPLATE_TYPE = "stale_shopping_list_digest";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "owner", "admin", "region_admin"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  const cutoffIso = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const dedupSinceIso = new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString();

  try {
    const { data: lists, error } = await sb
      .from("shopping_lists")
      .select("id, company_id, user_id, shopper_id, list_date, title, notes, estimated_total, created_at, status")
      .in("status", ["in_progress", "shopping"])
      .lte("created_at", cutoffIso)
      .limit(5000);

    if (error) {
      await recordCronHeartbeat(sb, CRON_NAME, "error", {
        source: auth.source,
        error_message: error.message,
      });
      return res.status(500).json({ error: error.message });
    }

    if (!lists?.length) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", {
        source: auth.source,
        considered: 0,
        tenants: 0,
        emails: 0,
        notifications: 0,
      });
      return res.status(200).json({ ok: true, considered: 0, tenants: 0, emails: 0, notifications: 0 });
    }

    const byCompany = new Map<string, any[]>();
    for (const list of lists as any[]) {
      if (!list.company_id) continue;
      const arr = byCompany.get(list.company_id) || [];
      arr.push(list);
      byCompany.set(list.company_id, arr);
    }

    const { emailService } = await import("@/services/emailService");
    const { notificationService } = await import("@/services/notificationService");

    let emails = 0;
    let notifications = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [companyId, companyLists] of byCompany.entries()) {
      try {
        const { count: recentCount } = await sb
          .from("email_automation_log")
          .select("id", { count: "exact", head: true })
          .eq("user_id", companyId)
          .eq("template_type", TEMPLATE_TYPE)
          // created_at, not sent_at: logEmailSent leaves sent_at NULL.
          .gte("created_at", dedupSinceIso);

        if (recentCount && recentCount > 0) {
          skipped += 1;
          continue;
        }

        const { data: profiles } = await sb
          .from("profiles")
          .select("id, email, full_name, role, active_role")
          .eq("company_id", companyId)
          .not("email", "is", null)
          .order("created_at", { ascending: true });
        const adminProfile = ((profiles || []) as any[]).find((p) => {
          const role = String(p.active_role || p.role || "");
          return ADMIN_ROLES.has(role) && p.email;
        });

        const sorted = [...companyLists].sort((a, b) =>
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
        );
        const oldest = sorted[0];
        const rows = sorted.slice(0, 12).map((l) => {
          const started = l.created_at ? new Date(l.created_at).toLocaleDateString("en-ZA") : "unknown date";
          return `- ${l.title || "Shopping list"} (${l.status}) started ${started}, id ${String(l.id).slice(0, 8)}`;
        }).join("\n");

        const message = `${companyLists.length} shopping list${companyLists.length === 1 ? "" : "s"} have been in progress for more than ${STALE_AFTER_DAYS} days.`;

        const sent = await notificationService.broadcastNotification({
          companyId,
          targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
          type: "shopping_list_stale",
          title: "Stale shopping lists need cleanup",
          message,
          priority: "normal",
          link: "/admin/shopping?status=in_progress",
          relatedEntityType: "shopping_list",
          relatedEntityId: oldest?.id || null,
          dedup: true,
          dedupWindowMinutes: 22 * 60,
        }, sb);
        if ((sent || 0) > 0) notifications += 1;

        if (adminProfile?.email) {
          const body =
            `${message}\n\n` +
            `Oldest list: ${oldest?.title || oldest?.id || "unknown"}\n\n` +
            `${rows}\n\n` +
            "Open the admin shopping board and either complete, cancel, or reassign these runs.";

          const ok = await emailService.sendEmail({
            companyId,
            to: adminProfile.email,
            subject: "Stale shopping lists need cleanup",
            body,
            templateType: TEMPLATE_TYPE,
            allowPlatformFallback: true,
            _client: sb,
          } as any);
          if (ok) emails += 1;
        }
      } catch (err: any) {
        errors.push(`${companyId}: ${err?.message || err}`);
      }
    }

    await recordCronHeartbeat(sb, CRON_NAME, errors.length ? "error" : "ok", {
      source: auth.source,
      considered: lists.length,
      tenants: byCompany.size,
      emails,
      notifications,
      skipped,
      errors_count: errors.length,
    });

    return res.status(200).json({
      ok: true,
      considered: lists.length,
      tenants: byCompany.size,
      emails,
      notifications,
      skipped,
      errors,
    });
  } catch (err: any) {
    await recordCronHeartbeat(sb, CRON_NAME, "error", {
      source: auth.source,
      error_message: err?.message || String(err),
    });
    return res.status(500).json({ error: err?.message || "Stale shopping list alert failed" });
  }
}

export default withApiLogging(handler);
