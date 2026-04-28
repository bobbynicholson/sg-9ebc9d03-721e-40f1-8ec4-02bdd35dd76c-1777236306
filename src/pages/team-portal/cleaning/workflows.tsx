import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sparkles, Search, ChevronDown, ChevronRight as ChevronRightIcon, Clock, ShieldCheck } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
    "Dry: air-dry on rack, or microfibre cloth -- no shared towels",
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
    "Pre-rinse: cold water only -- hot water cracks chilled glass",
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
    "Inspect seals for tears -- replace if compromised",
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

export default function CleaningWorkflowsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
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
    } catch (e) {
      toast({ title: "Could not load equipment", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (!term) return true;
      return `${i.name ?? ""} ${i.category ?? ""}`.toLowerCase().includes(term);
    });
    const map: Record<string, Equipment[]> = {};
    filtered.forEach((i) => {
      const k = i.category ?? "Uncategorised";
      if (!map[k]) map[k] = [];
      map[k].push(i);
    });
    return map;
  }, [items, search]);

  return (
    <>
      <Head><title>Cleaning Workflows - CateringMS</title></Head>
      <NoIndexMeta />
      <CleaningNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent flex items-center gap-3">
              <Sparkles className="h-7 w-7 text-cyan-600" />
              Cleaning Workflows
              <InfoTooltip content="Cleaning steps grouped by the type of equipment you have on file.\n\nEach card lists what to do before the item goes back into stock." />
            </h1>
            <p className="text-sm text-slate-600 mt-1">Step-by-step SOPs per equipment category -- food-safety compliant</p>
          </div>

          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input className="pl-9" placeholder="Search equipment..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">Loading workflows...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <Card>
              <CardContent className="text-center py-16 text-slate-500">
                <Sparkles className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No equipment to show workflows for</p>
                <p className="text-xs mt-1">Add equipment in Admin then return to see SOPs per category</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {Object.entries(grouped).map(([cat, list]) => {
                const isOpen = open[cat] ?? true;
                const sops = pickSops(cat);
                return (
                  <div key={cat} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpen((o) => ({ ...o, [cat]: !isOpen }))}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <ShieldCheck className="h-5 w-5 text-cyan-600 flex-shrink-0" />
                        <div className="min-w-0 text-left">
                          <div className="font-semibold text-slate-900 capitalize">{cat}</div>
                          <div className="text-xs text-slate-500">{list.length} items -- {sops.length} SOP step{sops.length === 1 ? "" : "s"}</div>
                        </div>
                      </div>
                      {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRightIcon className="h-4 w-4 text-slate-400" />}
                    </button>
                    {isOpen && (
                      <div className="border-t border-slate-100">
                        <ol className="divide-y divide-slate-100">
                          {sops.map((step, idx) => (
                            <li key={idx} className="p-3 flex items-start gap-3 text-sm">
                              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-100 text-cyan-700 font-semibold flex items-center justify-center text-xs">{idx + 1}</span>
                              <span className="text-slate-700">{step}</span>
                            </li>
                          ))}
                        </ol>
                        {list.length > 0 && (
                          <div className="p-3 border-t border-slate-100 bg-slate-50">
                            <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Items in this category</div>
                            <div className="flex flex-wrap gap-1.5">
                              {list.map((i) => (
                                <Badge key={i.id} variant="outline" className="bg-white text-slate-700 border-slate-200 text-xs">
                                  {i.name}
                                  {i.cleaning_time_hours != null && (
                                    <span className="ml-1.5 text-slate-400 flex items-center gap-0.5">
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
        </div>
      </main>
    </>
  );
}
