import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { googleMapsService, AddressAutocompleteResult } from "@/services/googleMapsService";
import { MapPin, Loader2 } from "lucide-react";

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string, coordinates?: { lat: number; lng: number }) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Enter address...",
  className = "",
  label
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<AddressAutocompleteResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (newValue.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await googleMapsService.searchAddresses(newValue);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch (error) {
        console.error("Error searching addresses:", error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  };

  const handleSelectSuggestion = async (suggestion: AddressAutocompleteResult) => {
    setInputValue(suggestion.description);
    setShowSuggestions(false);
    setSuggestions([]);

    try {
      const placeDetails = await googleMapsService.getPlaceDetails(suggestion.placeId);
      if (placeDetails) {
        onChange(placeDetails.address, placeDetails.coordinates);
      } else {
        onChange(suggestion.description);
      }
    } catch (error) {
      console.error("Error getting place details:", error);
      onChange(suggestion.description);
    }
  };

  return (
    <div className={className} ref={wrapperRef}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => {
              if (suggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
            placeholder={placeholder}
            className="pl-10 pr-10"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-600 animate-spin" />
          )}
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <Card className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto border-2 border-purple-200 shadow-lg">
            <div className="py-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.placeId}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="w-full px-4 py-3 text-left hover:bg-purple-50 transition-colors flex items-start gap-3 border-b border-slate-100 last:border-0"
                >
                  <MapPin className="w-4 h-4 text-purple-600 shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {suggestion.mainText}
                    </div>
                    <div className="text-sm text-slate-600 truncate">
                      {suggestion.secondaryText}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}