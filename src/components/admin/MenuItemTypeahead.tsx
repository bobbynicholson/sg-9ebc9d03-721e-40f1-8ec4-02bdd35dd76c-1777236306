/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MenuItemTypeahead - per-line search-as-you-type on the New Quote page.
 *
 * Drops onto each menu line in the quote form so the staff member can
 * type "lamb" and pick from the company's actual menu (created on
 * /admin/menu) instead of re-keying every dish from scratch.
 *
 * Picking a row hydrates the line:
 *   - name        <- menu_items.item_name
 *   - category    <- mapped from menu_items.category (DB uses "Mains",
 *                    quote form uses "main" - mapper in this file)
 *   - pricePerPerson <- menu_items.base_price (the company's listed price)
 *
 * Multi-tenant: the search is gated by company_id passed in. Each
 * tenant's menu stays isolated.
 *
 * Same UX shape as ClientTypeahead so it feels native to the page --
 * arrow-key nav, debounced search, dietary/allergen badges per row.
 */
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, UtensilsCrossed, Sparkles } from "lucide-react";
import { menuService } from "@/services/menuService";

type SearchHit = Awaited<ReturnType<typeof menuService.searchForQuote>>[number];

/** Picked event payload - the parent wires this into its line state */
export interface MenuItemPick {
  id: string;
  name: string;
  /** Already mapped to the quote form's lower-case enum.
   *  Wave 30.3: widened to include 'starter' and 'salad' so picking
   *  a salad item from the typeahead no longer collapses to
   *  'appetizer' - the quote line was being persisted with the
   *  wrong category and the order viewer displayed salads grouped
   *  under Appetizers. Mirrors the LINE_CATEGORIES list on the
   *  quote builder. */
  category:
    | "starter"
    | "appetizer"
    | "main"
    | "side"
    | "salad"
    | "dessert"
    | "beverage"
    | "other";
  pricePerPerson: number;
  /** True when the catalogue price is for one complete recipe/package. */
  soldAsPackage: boolean;
  description: string | null;
  imageUrl: string | null;
  dietaryTags: string[];
  allergenCodes: string[];
  /** Phase 2 #7: timestamp from menu_items.allergens_reviewed_at.
   *  NULL means the kitchen lead never signed off on the allergen
   *  declaration - the quote builder should warn before accepting. */
  allergensReviewedAt: string | null;
}

export interface MenuItemTypeaheadProps {
  companyId: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  onPick: (pick: MenuItemPick) => void;
  placeholder?: string;
  className?: string;
}

/**
 * The DB stores categories in their pretty form ("Mains", "Sides",
 * "Desserts", "Salads", "Starters"). The quote form's MenuItem type
 * was built earlier with a tighter enum that lacked 'salad' and
 * 'starter' - so picking a salad item from the typeahead used to
 * collapse it into 'appetizer' and the wrong category got persisted
 * on the quote line + the order viewer rendered salads under
 * Appetizers (Wave 30.3 bug Callum reported).
 *
 * Now we map forgivingly AND preserve the meaningful buckets the DB
 * actually carries. Unknown future categories like "Cocktails" still
 * fall back to "other" so the form doesn't crash.
 */
function mapCategory(raw: string | null | undefined): MenuItemPick["category"] {
  const c = (raw || "").toLowerCase().trim();
  if (!c) return "main";
  if (c.startsWith("salad")) return "salad";
  if (c.startsWith("starter")) return "starter";
  if (c.startsWith("appet")) return "appetizer";
  if (c.startsWith("side")) return "side";
  if (c.startsWith("dessert")) return "dessert";
  if (c.startsWith("drink") || c.startsWith("bever")) return "beverage";
  if (c.startsWith("main")) return "main";
  return "other";
}

export function MenuItemTypeahead({
  companyId,
  value,
  onChange,
  onPick,
  placeholder = "Search your menu, type 'lamb', 'salad', 'main'...",
  className,
}: MenuItemTypeaheadProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Click outside -> close. Standard typeahead UX.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Debounce so we don't hit Supabase on every keystroke
  useEffect(() => {
    if (!companyId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value || value.trim().length < 1) {
      // Even an empty term should let us preview the top of the menu
      // when the input is focused, so the staffer can browse without
      // typing. We pull on first focus rather than every keystroke.
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const rows = await menuService.searchForQuote(companyId, value, 10);
        setResults(rows);
        setHighlight(0);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Menu typeahead search failed:", e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, companyId]);

  // First focus -> seed with top items so the dropdown isn't empty
  // when the user opens it without typing first.
  const seedTopItems = async () => {
    if (!companyId || results.length > 0) return;
    setLoading(true);
    try {
      const rows = await menuService.searchForQuote(companyId, "", 10);
      setResults(rows);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  const handlePick = (r: SearchHit) => {
    onPick({
      id: r.id,
      name: r.item_name,
      category: mapCategory(r.category),
      pricePerPerson: Number(r.base_price ?? 0),
      soldAsPackage: r.sold_as_package === true,
      description: r.description,
      imageUrl: r.image_url,
      dietaryTags: r.dietary_tags ?? [],
      allergenCodes: r.allergen_codes ?? [],
      allergensReviewedAt: (r as any).allergens_reviewed_at ?? null,
    });
    onChange(r.item_name);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handlePick(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            seedTopItems();
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="text-sm h-10 pl-9"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
        )}
      </div>

      {open && (results.length > 0 || (value.trim().length >= 1 && !loading)) && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              No match on your menu yet, this will save as a custom line.
            </div>
          ) : (
            <>
              <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500 border-b bg-slate-50 flex items-center justify-between">
                <span>{results.length} match{results.length === 1 ? "" : "es"} from your menu</span>
                <span className="text-slate-400 normal-case tracking-normal">↑↓ to nav, Enter to pick</span>
              </div>
              {results.map((r, i) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => handlePick(r)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 transition-colors ${
                    i === highlight ? "bg-brand-primary/10" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <UtensilsCrossed className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-slate-900 truncate">
                          {r.item_name}
                        </span>
                        {r.category && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                            {r.category}
                          </Badge>
                        )}
                        {(r.dietary_tags ?? []).slice(0, 3).map((tag: string) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-4 bg-brand-primary/10 text-brand-primary border-brand-primary/20"
                          >
                            {tag.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                      {r.description && (
                        <div className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                          {r.description}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-semibold text-brand-primary">
                        R{Number(r.base_price ?? 0).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">per person</div>
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
