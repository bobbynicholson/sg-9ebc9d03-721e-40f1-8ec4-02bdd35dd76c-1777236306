/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ClientTypeahead -- search-as-you-type for the New Quote page.
 *
 * Drops onto the form where the staff member would otherwise re-type a
 * client name from scratch. As they type, we hit clients/leads/quotes/
 * orders in parallel via quoteIntelligenceService and surface ranked
 * matches with source badges. Picking a row hydrates the rest of the
 * form via getClientSnapshot in the parent.
 *
 * Why this is a controlled input + dropdown rather than the shadcn
 * Combobox / Command pattern:
 *   - We want the typed value to keep flowing into formData.clientName
 *     even when nothing is picked yet (so creating a brand-new client
 *     is just "type the name and submit").
 *   - The dropdown items aren't a closed list -- they're suggestions
 *     pulled live from the DB. The Command component assumes a fixed
 *     option set.
 */
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, User, Sparkles } from "lucide-react";
import { quoteIntelligenceService, KnownClientResult } from "@/services/quoteIntelligenceService";

export interface ClientTypeaheadProps {
  companyId: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  /** Fired when the user picks a result -- parent should hydrate the form */
  onPick: (pick: KnownClientResult) => void;
  placeholder?: string;
  className?: string;
}

const SOURCE_TONE: Record<string, string> = {
  client: "bg-emerald-100 text-emerald-700 border-emerald-200",
  lead: "bg-blue-100 text-blue-700 border-blue-200",
  quote: "bg-purple-100 text-purple-700 border-purple-200",
  order: "bg-amber-100 text-amber-700 border-amber-200",
};

const SOURCE_LABEL: Record<string, string> = {
  client: "Client",
  lead: "Lead",
  quote: "Quoted",
  order: "Ordered",
};

export function ClientTypeahead({
  companyId,
  value,
  onChange,
  onPick,
  placeholder = "Start typing the client name, email or phone...",
  className,
}: ClientTypeaheadProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<KnownClientResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click -- standard typeahead behaviour
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Debounce the search to avoid hammering Supabase on every keystroke
  useEffect(() => {
    if (!companyId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value || value.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const rows = await quoteIntelligenceService.searchKnownClients(companyId, value, 8);
        setResults(rows);
        setHighlight(0);
      } catch (e) {
        // Silent fail -- typeahead is optional sugar, we never block the
        // form on a search outage. Console for the dev only.
        // eslint-disable-next-line no-console
        console.warn("Client typeahead search failed:", e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, companyId]);

  const handlePick = (r: KnownClientResult) => {
    onPick(r);
    onChange(r.display_name);
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
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="text-sm h-10 pl-9"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
        )}
      </div>

      {open && (results.length > 0 || (value.trim().length >= 2 && !loading)) && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              No match in your records yet, this will create a new client.
            </div>
          ) : (
            <>
              <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500 border-b bg-slate-50">
                {results.length} match{results.length === 1 ? "" : "es"} from your history
              </div>
              {results.map((r, i) => (
                <button
                  type="button"
                  key={r.key}
                  onClick={() => handlePick(r)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 transition-colors ${
                    i === highlight ? "bg-emerald-50" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <User className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-slate-900 truncate">
                          {r.display_name}
                        </span>
                        {r.sources.map((s) => (
                          <Badge
                            key={s}
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 h-4 border ${SOURCE_TONE[s] ?? ""}`}
                          >
                            {SOURCE_LABEL[s] ?? s}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 truncate">
                        {r.email || r.phone || "No contact details on file"}
                      </div>
                      {(r.last_seen_label || r.last_venue_address) && (
                        <div className="mt-0.5 text-[11px] text-slate-400 truncate">
                          {[r.last_seen_label, r.last_venue_address].filter(Boolean).join(" • ")}
                        </div>
                      )}
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
