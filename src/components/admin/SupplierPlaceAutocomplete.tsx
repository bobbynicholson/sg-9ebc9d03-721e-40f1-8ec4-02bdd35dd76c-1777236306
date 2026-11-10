import { useEffect, useRef, useState } from "react";
import { Building2, Loader2, MapPin, Search, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { googleMapsService, type AddressAutocompleteResult } from "@/services/googleMapsService";

export interface SupplierPlacePick {
  name: string;
  address: string;
  placeId: string | null;
}

interface SupplierPlaceAutocompleteProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: SupplierPlacePick) => void;
  placeholder?: string;
}

export function SupplierPlaceAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  placeholder = "Search a supplier or business",
}: SupplierPlaceAutocompleteProps) {
  const [input, setInput] = useState(value || "");
  const [predictions, setPredictions] = useState<AddressAutocompleteResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [open, setOpen] = useState(false);
  const [lastSearch, setLastSearch] = useState("");
  const keyAvailable = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingRef = useRef(false);
  const latestQueryRef = useRef("");

  useEffect(() => {
    if (!editingRef.current) setInput(value || "");
  }, [value]);

  useEffect(() => {
    const onClickAway = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClickAway);
    return () => window.removeEventListener("mousedown", onClickAway);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const search = async (query: string) => {
    if (!keyAvailable || query.trim().length < 3) {
      setPredictions([]);
      setLastSearch("");
      return;
    }
    setLoading(true);
    setLastSearch(query);
    try {
      const results = await googleMapsService.searchPlaces(query, "za");
      if (latestQueryRef.current === query) setPredictions(results);
    } catch (error) {
      console.warn("supplier place search failed", error);
      if (latestQueryRef.current === query) setPredictions([]);
    } finally {
      if (latestQueryRef.current === query) setLoading(false);
    }
  };

  const handleType = (query: string) => {
    editingRef.current = true;
    latestQueryRef.current = query;
    setInput(query);
    setPredictions([]);
    setOpen(true);
    onChange(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 3) {
      setLastSearch("");
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => void search(query), 250);
  };

  const selectPlace = async (prediction: AddressAutocompleteResult) => {
    latestQueryRef.current = "";
    setLoading(false);
    setSelecting(true);
    setInput(prediction.mainText);
    setOpen(false);
    try {
      const details = await googleMapsService.getPlaceDetails(prediction.placeId);
      onSelect({
        name: details?.name || prediction.mainText,
        address: details?.address || prediction.description,
        placeId: prediction.placeId,
      });
    } finally {
      editingRef.current = false;
      setSelecting(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          id={id}
          value={input}
          onChange={(event) => handleType(event.target.value)}
          onFocus={() => { editingRef.current = true; setOpen(true); }}
          onBlur={() => window.setTimeout(() => { setOpen(false); editingRef.current = false; }, 160)}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && keyAvailable && predictions.length > 0}
          aria-controls={`${id}-places-list`}
          className="h-11 w-full pl-9 pr-9"
        />
        {(loading || selecting) && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
        {!loading && !selecting && <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
      </div>

      <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">Type at least 3 characters to find a business in Google Places. Selecting one fills in its address.</p>

      {open && keyAvailable && predictions.length > 0 && (
        <div id={`${id}-places-list`} role="listbox" className="absolute z-[70] mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950">
          {predictions.map((prediction) => (
            <button
              key={prediction.placeId}
              type="button"
              role="option"
              aria-selected="false"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void selectPlace(prediction)}
              className="flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:border-slate-800 dark:hover:bg-slate-900 dark:focus-visible:bg-slate-900"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{prediction.mainText}</span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{prediction.secondaryText}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {open && keyAvailable && !loading && input.trim().length >= 3 && lastSearch === input && predictions.length === 0 && (
        <p className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">No Google Places matches yet. Keep typing or enter the supplier manually.</p>
      )}

      {!keyAvailable && (
        <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-4 text-amber-700 dark:text-amber-300">
          <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
          Google Places suggestions need NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Manual supplier and address entry still works.
        </p>
      )}
    </div>
  );
}
