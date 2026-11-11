import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AddressAutocomplete } from "@/components/admin/AddressAutocomplete";
import type { ServiceSittingInput } from "@/lib/serviceSittings";

export function AdminServicePlanEditor({ value, totalGuests, onChange, disabled = false, defaultVenueName = "", defaultVenueAddress = "", defaultVenueLat = null, defaultVenueLng = null }: {
  value: ServiceSittingInput[]; totalGuests: number;
  onChange: (value: ServiceSittingInput[]) => void; disabled?: boolean;
  defaultVenueName?: string; defaultVenueAddress?: string; defaultVenueLat?: number | null; defaultVenueLng?: number | null;
}) {
  const uid = useId();
  const allocated = value.reduce((total, s) => total + (Number(s.guestCount) || 0), 0);
  const edit = (index: number, patch: Partial<ServiceSittingInput>) => onChange(value.map((s, n) => n === index ? { ...s, ...patch } : s));
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 border-t border-slate-200 pt-4" aria-describedby={`${uid}-hint`}>
    <legend className="text-base font-semibold text-slate-950">Serving times &amp; guest split</legend>
    <p id={`${uid}-hint`} className="text-sm text-slate-600">Your team controls each location, guest split and service time. A sitting can use the main venue address or its own delivery address. Assign drivers and collections on the booked order.</p>
    {value.map((s, index) => <div key={index} className="min-w-0 space-y-3 rounded-lg border border-slate-200 p-3">
      <div className="grid min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="min-w-0 text-sm text-slate-700">Sitting {index + 1} guests<Input type="number" min={1} step={1} value={s.guestCount || ""} onChange={e => edit(index, { guestCount: Number(e.target.value) })} className="mt-1 text-base" /></label>
        <label className="min-w-0 text-sm text-slate-700">Sitting {index + 1} service time<Input type="time" value={s.serviceTime} onChange={e => edit(index, { serviceTime: e.target.value })} className="mt-1 min-w-0 text-base" /></label>
        {value.length > 1 && <Button type="button" variant="outline" onClick={() => onChange(value.filter((_, n) => n !== index))}>Remove sitting {index + 1}</Button>}
      </div>
      <label className="block min-w-0 text-sm text-slate-700">Sitting {index + 1} office / venue name (optional)
        <Input maxLength={200} value={s.venueName ?? ""} placeholder={defaultVenueName || "e.g. Cape Town office"} onChange={e => edit(index, { venueName: e.target.value || null })} className="mt-1 text-base" />
      </label>
      <div className="min-w-0 text-sm text-slate-700">
        <label htmlFor={`${uid}-venue-${index}`} className="mb-1 block">Sitting {index + 1} delivery address</label>
        <AddressAutocomplete
          id={`${uid}-venue-${index}`}
          value={s.venueAddress ?? defaultVenueAddress}
          placeholder="Search for this office address..."
          countryCode="za"
          disabled={disabled}
          onChange={pick => edit(index, { venueAddress: pick.address || null, venueLat: pick.lat, venueLng: pick.lng })}
          hint="Leave the shared address unchanged to use the main quote venue."
        />
        {s.venueLat == null && defaultVenueLat != null && defaultVenueLng != null && (s.venueAddress == null || s.venueAddress === defaultVenueAddress) && <p className="mt-1 text-xs text-slate-500">Using the main quote venue map location.</p>}
      </div>
    </div>)}
    <div className="flex flex-wrap items-center gap-3">
      {value.length < 12 && <Button type="button" variant="outline" onClick={() => {
        const first = value.length === 1 ? Math.ceil(totalGuests / 2) : value[0].guestCount;
        const existing = value.map((s, n) => n === 0 && value.length === 1 ? { ...s, guestCount: first } : s);
        onChange([...existing, { guestCount: Math.max(1, totalGuests - existing.reduce((n, s) => n + s.guestCount, 0)), serviceTime: "", venueName: null, venueAddress: null, venueLat: null, venueLng: null }]);
      }}>Add sitting</Button>}
      <p className={`text-sm ${allocated === totalGuests ? "text-slate-600" : "font-medium text-red-800"}`} aria-live="polite">{allocated} of {totalGuests} guests allocated{allocated !== totalGuests ? ". Adjust the sitting guest counts before saving." : "."}</p>
    </div>
  </fieldset>;
}
