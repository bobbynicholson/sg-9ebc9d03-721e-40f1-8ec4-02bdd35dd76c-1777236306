import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { useRouter } from "next/router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, ChevronRight as ChevronRightIcon, Clock, ShieldCheck, ListChecks, Package, RefreshCw } from "lucide-react";
import { CleaningPageShell, CLEANING_HERO_CHIP } from "@/components/cleaning/CleaningPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalCard } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/app";

interface Equipment {
  id: string;
  name: string | null;
  category: string | null;
  cleaning_time_hours: number | null;
  condition: string | null;
}

const SOPS_BY_CATEGORY: Record<string, string[]> = {
  default: [
    "Pre-rinse: scrape food residue into the bin, rinse with cold water",
    "Wash: hot water + degreaser, scrub all surfaces with soft brush",
    "Sanitise: food-safe sanitiser, contact time per label (typically 60-90 sec)",
    "Rinse: clean potable water, ensure no chemical residue remains",
    "Dry: air-dry on rack, or microfibre cloth, no shared towels",
    "Inspect: check for chips/cracks/damage; flag broken items",
    "Store: rack or shelf for that category, lid up so water drains",
  ],
  chafing: [
    "Empty fuel canister, dispose safely",
    "Disassemble: pan, water tray, frame, lid",
    "Pre-rinse and wash each piece in hot water + degreaser",
    "Sanitise water tray and pan, soak 60s",
    "Rinse all pieces in clean water",
    "Dry, inspect for dents and rust",
    "Reassemble and stack on chafing-dish shelf",
  ],
  glassware: [
    "Pre-rinse: cold water only, hot water cracks chilled glass",
    "Wash: glass-detergent at 50C in dishwasher (not pot wash)",
    "Polish: lint-free microfibre, hold by base only, never push fingers in",
    "Inspect under light: chips on rim = bin",
    "Stack rim-down on the glass shelf, no nesting",
  ],
  spit: [
    "Cool spit completely before disassembly",
    "Remove cooking grates, soak in degreaser bath 30 min",
    "Scrape carbon buildup from inside drum with grill brick",
    "Wash exterior: hot water + degreaser",
    "Inspect motor seals, check rotisserie shaft alignment",
    "Refit grates, stow in spit storage area",
  ],
  cutlery: [
    "Pre-rinse cold to remove food",
    "Wash in dishwasher cutlery basket, handles down",
    "Hot rinse cycle minimum 82C",
    "Air-dry on cutlery rack, polish with lint-free cloth",
    "Sort by type into compartments",
    "Inspect: bent prongs / loose handles get binned",
  ],
  serving: [
    "Pre-rinse and wash with hot water + degreaser",
    "Sanitise: food-safe sanitiser + 60s contact",
    "Rinse and inspect for chips on rims and seams",
    "Dry on rack, store stacked rim up",
  ],
  fridge: [
    "Power down and empty (move stock to backup)",
    "Wipe shelves and walls with hot water + sanitiser, rinse",
    "Clean drip tray and door seals with detergent",
    "Inspect seals for tears, replace if compromised",
    "Test temperature with calibrated probe at 4 corners (target 1-4C)",
    "Restock and label restart time",
  ],
};

function pickSops(category: string | null): string[] {
  const c = (category ?? "").toLowerCase();
  if (c.includes("chafing") || c.includes("chafer")) return SOPS_BY_CATEGORY.chafing;
  if (c.includes("glass")) return SOPS_BY_CATEGORY.glassware;
  if (c.includes("spit") || c.includes("braai") || c.includes("grill")) return SOPS_BY_CATEGORY.spit;
  if (c.includes("cutlery") || c.includes("flatware")) return SOPS_BY_CATEGORY.cutlery;
  if (c.includes("plate") || c.includes("bowl") || c.includes("serving") || c.includes("crockery")) return SOPS_BY_CATEGORY.serving;
  if (c.includes("fridge") || c.includes("refrigerator") || c.includes("cold")) return SOPS_BY_CATEGORY.fridge;
  return SOPS_BY_CATEGORY.default;
}

function CleaningWorkflowsPageInner() {
  const { user } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  // First successful load done: skeleton only before it, and realtime
  // refreshes swap data in place instead of blanking the list.
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user?.company_id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  useEffect(() => {
    if (!router.isReady) return;
    const category = typeof router.query.category === "string" ? router.query.category.trim() : "";
    if (category) setSearch(category);
  }, [router.isReady, router.query.category]);

  useEffect(() => {
    if (!user?.company_id) return;
    // Unique per-mount suffix: a fixed channel name collides when the
    // page remounts fast (recurring realtime bug class in this repo).
    const channel = supabase
      .channel(`cleaning-workflows-${user.company_id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipment", filter: `company_id=eq.${user.company_id}` },
        () => void load(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    if (!loaded) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("equipment")
        .select("id, name, category, cleaning_time_hours, condition")
        .eq("company_id", user.company_id)
        .order("category", { ascending: true })
        .order("name", { ascending: true })
        .returns<Equipment[]>();
      if (error) throw error;
      setItems(data || []);
      setLoadError(null);
      setLoaded(true);
    } catch (e: any) {
      // Recovery card owns this state; never show "no equipment" for a
      // failed load.
      setLoadError(e?.message || "We couldn't reach the server. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  const fuzzyFiltered = useFuzzyItems(
    items,
    search,
    [
      { key: "name" as any, weight: 3 },
      { key: "category" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  const grouped = useMemo(() => {
    const map: Record<string, Equipment[]> = {};
    fuzzyFiltered.forEach((i) => {
      const k = i.category ?? "Uncategorised";
      if (!map[k]) map[k] = [];
      map[k].push(i);
    });
    return map;
  }, [fuzzyFiltered]);

  const categoryCount = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => s.add(i.category ?? "Uncategorised"));
    return s.size;
  }, [items]);

  const showSkeleton = loading && !loaded;
  const chipsReady = loaded && !loadError;

  return (
    <CleaningPageShell
      pageTitle="Cleaning workflows - CateringMS"
      heading="Cleaning workflows"
      subheading={
        chipsReady && items.length > 0
          ? `Step-by-step SOPs across ${categoryCount} equipment categor${categoryCount === 1 ? "y" : "ies"}, food-safety compliant.`
          : "Step-by-step SOPs per equipment category, food-safety compliant."
      }
      icon={ShieldCheck}
      meta={
        chipsReady ? (
          <>
            <span className={CLEANING_HERO_CHIP}>
              <ListChecks className="h-3 w-3" />
              {categoryCount} categor{categoryCount === 1 ? "y" : "ies"}
            </span>
            <span className={CLEANING_HERO_CHIP}>
              <Package className="h-3 w-3" />
              {items.length} item{items.length === 1 ? "" : "s"}
            </span>
          </>
        ) : undefined
      }
    >
      {/* Recovery card: the load failed. Never dress a failed load up
          as an empty workflows list. */}
      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40">
          <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Couldn&apos;t load the workflows</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{loadError}</p>
          <Button
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="bg-brand-primary hover:opacity-90 text-white"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin motion-reduce:animate-none")} />
            Retry
          </Button>
        </div>
      )}

      <PortalCard className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <Input
            className="pl-9 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="Search equipment..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </PortalCard>

      {showSkeleton ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading workflows">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 p-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 rounded bg-slate-100 dark:bg-slate-800 animate-pulse motion-reduce:animate-none" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-slate-100 dark:bg-slate-800 animate-pulse motion-reduce:animate-none" />
                  <div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-800 animate-pulse motion-reduce:animate-none" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : loadError && items.length === 0 ? (
        <PortalCard padded={false}>
          <div className="py-10 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
            The workflows are unavailable right now. Use Retry above to reload them.
          </div>
        </PortalCard>
      ) : Object.keys(grouped).length === 0 ? (
        <PortalCard padded={false}>
          <div className="py-16 px-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-slate-300 dark:text-slate-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">
              {items.length === 0 ? "No equipment to show workflows for" : "No equipment matches the search"}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              {items.length === 0
                ? "Add equipment in Admin then return to see SOPs per category"
                : "Clear the search to see SOPs for every category"}
            </p>
            {items.length > 0 && search && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setSearch("")}>
                Clear search
              </Button>
            )}
          </div>
        </PortalCard>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([cat, list]) => {
            const isOpen = open[cat] ?? true;
            const sops = pickSops(cat);
            return (
              <div key={cat} className="rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-16px_rgba(15,23,42,0.12)]">
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [cat]: !isOpen }))}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <ShieldCheck className="h-5 w-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                    <div className="min-w-0 text-left">
                      <div className="font-semibold text-slate-900 dark:text-white capitalize">{cat}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{list.length} items, {sops.length} SOP step{sops.length === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                  {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500" /> : <ChevronRightIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />}
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sops.map((step, idx) => (
                        <li key={idx} className="p-3 flex items-start gap-3 text-sm">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 font-semibold flex items-center justify-center text-xs tabular-nums">{idx + 1}</span>
                          <span className="text-slate-700 dark:text-slate-300">{step}</span>
                        </li>
                      ))}
                    </ol>
                    {list.length > 0 && (
                      <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Items in this category</div>
                        <div className="flex flex-wrap gap-1.5">
                          {list.map((i) => (
                            <Badge key={i.id} variant="outline" className="bg-white text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 text-xs">
                              {i.name}
                              {i.cleaning_time_hours != null && (
                                <span className="ml-1.5 text-slate-400 dark:text-slate-500 flex items-center gap-0.5 tabular-nums">
                                  <Clock className="h-3 w-3" />{Number(i.cleaning_time_hours)}h
                                </span>
                              )}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </CleaningPageShell>
  );
}

export default function CleaningWorkflowsPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.CLEANING_MANAGER,
        UserRole.CLEANING_STAFF,
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.REGION_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <CleaningWorkflowsPageInner />
    </ProtectedRoute>
  );
}
