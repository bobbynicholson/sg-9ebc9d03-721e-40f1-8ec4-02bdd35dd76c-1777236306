/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Address input with Google Places autocomplete + lat/lng auto-fill.
 *
 * Degrades gracefully: if NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set,
 * falls back to a plain text Input -- the catering company can still
 * enter the address manually, just without auto-fill of lat/lng.
 *
 * Calls onChange with:
 *   { address, lat, lng, placeId, components }
 * components is best-effort parsed from address_components so the
 * caller can populate city / state / postal_code separately.
 */
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Search, ShieldAlert } from "lucide-react";
import { googleMapsService } from "@/services/googleMapsService";

interface ParsedComponents {
  street_number?: string;
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface AddressPick {
  address: string;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  components: ParsedComponents;
}

interface Props {
  value: string;
  onChange: (pick: AddressPick) => void;
  placeholder?: string;
  countryCode?: string;     // default "za"
  disabled?: boolean;
  hint?: string;
  id?: string;
  className?: string;
}

export function AddressAutocomplete({
  value, onChange, placeholder = "Search address...", countryCode = "za",
  disabled, hint, id, className,
}: Props) {
  const [input, setInput] = useState(value || "");
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [open, setOpen] = useState(false);
  const [keyAvailable, setKeyAvailable] = useState<boolean | null>(null);
  const debounceRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect whether the API key is configured (kicked off lazily on first
  // open so we don't spam fetches).
  useEffect(() => {
    setKeyAvailable(Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY));
  }, []);

  // Sync external value -> input
  useEffect(() => { setInput(value || ""); }, [value]);

  // Click outside closes dropdown
  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as any)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClickAway);
    return () => window.removeEventListener("mousedown", onClickAway);
  }, []);

  const search = async (q: string) => {
    if (!q || q.trim().length < 3) {
      setPredictions([]);
      return;
    }
    if (!keyAvailable) return;
    setLoading(true);
    try {
      const results = await googleMapsService.searchAddresses(q);
      setPredictions(results);
    } catch (e) {
      console.warn("address search failed", e);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  };

  const onType = (q: string) => {
    setInput(q);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 220);
  };

  const pickPrediction = async (p: any) => {
    setSelecting(true);
    setInput(p.description);
    setOpen(false);
    try {
      const details = await googleMapsService.getPlaceDetails(p.placeId);
      if (!details) {
        onChange({ address: p.description, lat: null, lng: null, placeId: p.placeId, components: {} });
        return;
      }
      const components = parseAddressComponents((details as any).addressComponents || []);
      onChange({
        address: details.address,
        lat: details.coordinates.lat,
        lng: details.coordinates.lng,
        placeId: p.placeId,
        components,
      });
    } finally {
      setSelecting(false);
    }
  };

  const onBlur = () => {
    // After a short delay so click on a prediction still registers
    setTimeout(() => setOpen(false), 150);
    // If the user typed but didn't pick a prediction, still emit raw
    if (input !== value) {
      onChange({ address: input, lat: null, lng: null, placeId: null, components: {} });
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          id={id}
          value={input}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9"
        />
        {(loading || selecting) && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
        )}
      </div>

      {open && keyAvailable && predictions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-72 overflow-y-auto">
          {predictions.map((p) => (
            <button
              key={p.placeId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickPrediction(p)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
            >
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{p.mainText}</p>
                  <p className="text-xs text-slate-500 truncate">{p.secondaryText}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {keyAvailable === false && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-700">
          <ShieldAlert className="w-3 h-3 flex-shrink-0" />
          <span>Manual entry only, ask the platform owner to enable Google Maps for autocomplete + lat/lng.</span>
        </div>
      )}
      {hint && !keyAvailable && false && (
        <p className="text-[11px] text-slate-500 mt-1">{hint}</p>
      )}
    </div>
  );
}

function parseAddressComponents(raw: any[]): ParsedComponents {
  const out: ParsedComponents = {};
  raw.forEach((c) => {
    const types = c.types || [];
    if (types.includes("street_number")) out.street_number = c.long_name;
    else if (types.includes("route"))     out.street       = c.long_name;
    else if (types.includes("locality") || types.includes("sublocality") || types.includes("postal_town")) out.city = c.long_name;
    else if (types.includes("administrative_area_level_1")) out.state = c.long_name;
    else if (types.includes("postal_code")) out.postal_code = c.long_name;
    else if (types.includes("country"))     out.country     = c.long_name;
  });
  return out;
}
