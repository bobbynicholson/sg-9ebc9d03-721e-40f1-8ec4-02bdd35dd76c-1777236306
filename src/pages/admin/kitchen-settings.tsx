/**
 * /admin/kitchen-settings - standalone page wrapper.
 *
 * Wave 70.8 originally moved the form here from /team-portal/kitchen.
 * TIGHTEN I.30 (admin.md section 7 follow-up #5) factored the form
 * out into <KitchenRulesPanel /> so the same component can mount as
 * a tab on /admin/teams/kitchen. This page keeps the standalone URL
 * for deep-links + Settings nav muscle memory, but renders the
 * extracted panel.
 *
 * Nav note: DynamicNav (not AdminNav) is deliberate here. The page
 * admits KITCHEN_MANAGER alongside the admin tier, and DynamicNav
 * resolves KitchenNav for that role so a kitchen manager isn't
 * dropped into admin chrome full of links they can't open.
 */
import { useEffect, useState } from "react";
import Head from "next/head";
import { Settings } from "lucide-react";
import { DynamicNav } from "@/components/DynamicNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { KitchenRulesPanel, KITCHEN_RULES_DEFAULTS } from "@/components/admin/KitchenRulesPanel";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/** The three headline values the hero chips read. Loaded from the
 *  same companies.kitchen_settings JSON the panel edits so the band
 *  always shows real saved state, never hardcoded numbers. */
interface HeroRules {
  autoPrepTasks: boolean;
  bufferMin: number;
  overtimeAfterHours: number;
}

function KitchenSettingsAdminPage() {
  const { user } = useAuth() as any;
  const userRole = (user?.active_role || user?.role || UserRole.ADMIN).toString();
  const companyId: string | undefined = user?.company_id;

  // Command-centre standard: live meta chips computed from loaded
  // state. Kept in sync with the panel below via a realtime
  // subscription on the tenant's companies row, so a save in the
  // panel (or on the /admin/teams/kitchen tab in another tab)
  // refreshes the chips instead of leaving them contradicting the
  // form. Chips stay hidden until the read lands - we never render
  // defaults as if they were the tenant's saved values.
  const [heroRules, setHeroRules] = useState<HeroRules | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("kitchen_settings")
        .eq("id", companyId)
        .maybeSingle();
      if (cancelled || error) return; // panel surfaces its own load errors; chips just stay hidden
      const raw = (data as any)?.kitchen_settings || {};
      setHeroRules({
        autoPrepTasks: Boolean(raw.auto_generate_prep_tasks ?? KITCHEN_RULES_DEFAULTS.auto_generate_prep_tasks),
        bufferMin: Number(raw.prep_safety_buffer_min ?? KITCHEN_RULES_DEFAULTS.prep_safety_buffer_min),
        overtimeAfterHours: Number(raw.overtime_after_hours ?? KITCHEN_RULES_DEFAULTS.overtime_after_hours),
      });
    };
    load();
    const channel = (supabase as any)
      .channel(`admin-kitchen-settings-hero:${companyId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "companies", filter: `id=eq.${companyId}` },
        () => { load(); },
      )
      .subscribe();
    return () => {
      cancelled = true;
      (supabase as any).removeChannel(channel);
    };
  }, [companyId]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>Kitchen rules - CateringMS</title></Head>
      <DynamicNav userRole={userRole} />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            variant="hero"
            title="Kitchen rules"
            icon={Settings}
            subtitle="Prep timing, BCEA shift thresholds and dietary alert policy for this kitchen."
            meta={
              heroRules ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {/* Amber stays semantic: auto-generation off means
                        someone has to hand-create prep tasks. */}
                    <span className={`h-1.5 w-1.5 rounded-full ${heroRules.autoPrepTasks ? "bg-emerald-400" : "bg-amber-400"}`} />
                    Auto prep tasks {heroRules.autoPrepTasks ? "on" : "off"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {heroRules.bufferMin} min safety buffer
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    Overtime warning after {heroRules.overtimeAfterHours}h
                  </span>
                </>
              ) : undefined
            }
          />
          <PageWorkbench />

          <KitchenRulesPanel
            contextNote="These rules also surface as the 'Kitchen rules' tab inside the Kitchen team landing page (/admin/teams/kitchen) - either entry point edits the same companies.kitchen_settings JSON."
          />
        </PortalShell>
      </div>
    </>
  );
}

export default function ProtectedKitchenSettingsAdminPage() {
  // KS-B + I.30 preserved role gate. The intro copy says
  // admin-managed rules - allowlist mirrors the original page's
  // four-role set so the OWNER persona doesn't 403 here.
  // KITCHEN_MANAGER is deliberately admitted (they run these rules).
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN,
      UserRole.OWNER,
      UserRole.COMPANY_ADMIN,
      UserRole.ADMIN,
      UserRole.KITCHEN_MANAGER,
    ]}>
      <KitchenSettingsAdminPage />
    </ProtectedRoute>
  );
}
