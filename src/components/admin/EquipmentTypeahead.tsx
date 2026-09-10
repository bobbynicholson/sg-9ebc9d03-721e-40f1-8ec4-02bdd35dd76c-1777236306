/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * EquipmentTypeahead - per-line search-as-you-type on the New Quote
 * page's Equipment section.
 *
 * Mirror of MenuItemTypeahead but keyed off the company's `equipment`
 * catalog (chafing dishes, tables, chairs, gas burners, urns, etc).
 *
 * Picking a row hydrates the line:
 *   - name           <- equipment.name
 *   - category       <- equipment.category (e.g. "chafing", "tables")
 *   - rentalPrice    <- equipment.rental_price (the company's listed price)
 *   - id             <- equipment.id (preserved on the quote so the
 *                       kitchen + driver views can deep-link back to
 *                       the catalog if needed)
 *
 * Tenant-scoped: the search is gated by company_id; RLS on equipment
 * blocks cross-tenant reads even if the caller fudges the param.
 */
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Package, AlertTriangle } from "lucide-react";
import { equipmentManagementService } from "@/services/equipmentManagementService";

type SearchHit = Awaited<
  ReturnType<typeof equipmentManagementService.searchForQuote>
>[number];

/** Picked event payload - the parent wires this into its line state */
export interface EquipmentPick {
  id: string;
  name: string;
  category: string | null;
  rentalPrice: number;
  description: string | null;
  imageUrl: string | null;
  /** What the company has on the books in total. */
  totalQuantity: number | null;
  /** What's available right now - useful for the warning when 0. */
  availableQuantity: number | null;
  condition: string | null;
}

export interface EquipmentTypeaheadProps {
  companyId: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  onPick: (pick: EquipmentPick) => void;
  placeholder?: string;
  className?: string;
}

export function EquipmentTypeahead({
  companyId,
  value,
  onChange,
  onPick,
  placeholder = "Search your equipment, 'chafing', 'table', 'chair'...",
  className,
}: EquipmentTypeaheadProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Click outside -> close.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Debounced search - 200ms feels native without spamming Supabase.
  useEffect(() => {
    if (!companyId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value || value.trim().length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const rows = await equipmentManagementService.searchForQuote(
          companyId,
          value,
          12,
        );
        setResults(rows);
        setHighlight(0);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Equipment typeahead search failed:", e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, companyId]);

  // Seed top items when the user focuses without typing first.
  const seedTopItems = async () => {
    if (!companyId || results.length > 0) return;
    setLoading(true);
    try {
      const rows = await equipmentManagementService.searchForQuote(companyId, "", 12);
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
      name: r.name,
      category: r.category,
      rentalPrice: Number(r.rental_price ?? 0),
      description: r.description,
      imageUrl: r.image_url,
      totalQuantity: r.quantity ?? null,
      availableQuantity: r.available_quantity ?? null,
      condition: r.condition ?? null,
    });
    onChange(r.name);
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
              <Package className="w-3.5 h-3.5" />
              No match in your equipment catalog, this will save as a custom line.
            </div>
          ) : (
            <>
              <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500 border-b bg-slate-50 flex items-center justify-between">
                <span>{results.length} match{results.length === 1 ? "" : "es"} in your catalog</span>
                <span className="text-slate-400 normal-case tracking-normal">↑↓ to nav, Enter to pick</span>
              </div>
              {results.map((r, i) => {
                const lowStock = (r.available_quantity ?? 0) === 0;
                return (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => handlePick(r)}
                    onMouseEnter={() => setHighlight(i)}
                    className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 transition-colors ${
                      i === highlight ? "bg-blue-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Package className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                          <span className="text-sm font-medium text-slate-900 truncate">
                            {r.name}
                          </span>
                          {r.category && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                              {r.category}
                            </Badge>
                          )}
                          {lowStock && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-amber-50 text-amber-700 border-amber-200">
                              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                              none free
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                          {r.description && <span className="line-clamp-1">{r.description}</span>}
                          {(r.available_quantity != null || r.quantity != null) && (
                            <span className="text-slate-400">
                              {r.available_quantity ?? "-"} / {r.quantity ?? "-"} available
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-semibold text-blue-700">
                          R{Number(r.rental_price ?? 0).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400">per booking</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
