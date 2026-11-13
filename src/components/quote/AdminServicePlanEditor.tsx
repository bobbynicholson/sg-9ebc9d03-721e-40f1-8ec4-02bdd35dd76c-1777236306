import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AddressAutocomplete } from "@/components/admin/AddressAutocomplete";
import type { ServiceSittingInput } from "@/lib/serviceSittings";

export function AdminServicePlanEditor({ value, totalGuests, onChange, disabled = false, defaultVenueName = "", defaultVenueAddress = "", menuItems = [], equipmentItems = [], onRouteFeeChange, onSittingRemoved }: {
  value: ServiceSittingInput[]; totalGuests: number;
  onChange: (value: ServiceSittingInput[]) => void; disabled?: boolean;
  defaultVenueName?: string; defaultVenueAddress?: string;
  menuItems?: Array<{ name: string; serviceSittingSequence?: number | null }>;
  equipmentItems?: Array<{ name: string; serviceSittingSequence?: number | null }>;
  onRouteFeeChange?: (kind: "delivery" | "collection", index: number, amount: number) => void;
  onSittingRemoved?: (index: number) => void;
}) {
  const uid = useId();
  const allocated = value.reduce((total, s) => total + (Number(s.guestCount) || 0), 0);
  const edit = (index: number, patch: Partial<ServiceSittingInput>) => onChange(value.map((s, n) => n === index ? { ...s, ...patch } : s));
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 border-t border-slate-200 pt-4" aria-describedby={`${uid}-hint`}>
    <legend className="text-base font-semibold text-slate-950">Serving times &amp; guest split</legend>
    <p id={`${uid}-hint`} className="text-sm text-slate-600">Set each sitting's guest count, service time and delivery address. Sittings use the primary venue unless you choose a separate address. Unassigned food is split across sittings by guest count; unassigned equipment goes to the primary venue. Drivers and collections are set on the booked order.</p>
    {value.map((s, index) => <div key={index} className="min-w-0 space-y-3 rounded-lg border border-slate-200 p-3">
      <div className="grid min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="min-w-0 text-sm text-slate-700">Sitting {index + 1} guests<Input type="number" min={1} step={1} value={s.guestCount || ""} onChange={e => edit(index, { guestCount: Number(e.target.value) })} className="mt-1 text-base" /></label>
        <label className="min-w-0 text-sm text-slate-700">Sitting {index + 1} service time<Input type="time" value={s.serviceTime} onChange={e => edit(index, { serviceTime: e.target.value })} className="mt-1 min-w-0 text-base" /></label>
        {value.length > 1 && <Button type="button" variant="outline" onClick={() => { onSittingRemoved?.(index); onChange(value.filter((_, n) => n !== index)); }}>Remove sitting {index + 1}</Button>}
      </div>
      {value.length > 1 && <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
        <p className="font-medium text-slate-800">Food and equipment for this sitting</p>
        <p className="mt-1 text-xs font-medium text-slate-700">Food</p>
        {menuItems.some(item => item.serviceSittingSequence === index + 1)
          ? <ul className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-slate-700">{menuItems.filter(item => item.serviceSittingSequence === index + 1).map((item, itemIndex) => <li key={`${item.name}-${itemIndex}`}>{item.name}</li>)}</ul>
          : <p className="mt-0.5 text-xs text-slate-600">No sitting-specific menu lines yet.</p>}
        {menuItems.some(item => !item.serviceSittingSequence)
          ? <p className="mt-0.5 text-xs text-slate-600">Plus {menuItems.filter(item => !item.serviceSittingSequence).length} shared menu line{menuItems.filter(item => !item.serviceSittingSequence).length === 1 ? "" : "s"} served at every sitting.</p>
          : <p className="mt-1 text-xs text-slate-600">No shared menu lines. Assign food on the menu lines below.</p>}
        <p className="mt-1 text-xs font-medium text-slate-700">Equipment</p>
        {equipmentItems.some(item => item.serviceSittingSequence === index + 1)
          ? <ul className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-slate-700">{equipmentItems.filter(item => item.serviceSittingSequence === index + 1).map((item, itemIndex) => <li key={`${item.name}-${itemIndex}`}>{item.name}</li>)}</ul>
          : <p className="mt-0.5 text-xs text-slate-600">No sitting-specific equipment.</p>}
        {equipmentItems.some(item => !item.serviceSittingSequence)
          ? <p className="mt-0.5 text-xs text-slate-600">{equipmentItems.filter(item => !item.serviceSittingSequence).length} unassigned equipment line{equipmentItems.filter(item => !item.serviceSittingSequence).length === 1 ? " stays" : "s stay"} at the primary venue.</p>
          : <p className="mt-0.5 text-xs text-slate-600">No shared equipment lines.</p>}
      </div>}
      <label className="block min-w-0 text-sm text-slate-700">Sitting {index + 1} office / venue name (optional)
        <Input maxLength={200} value={s.venueName ?? ""} placeholder={defaultVenueName || "e.g. Cape Town office"} onChange={e => edit(index, { venueName: e.target.value || null })} className="mt-1 text-base" />
      </label>
      <div className="min-w-0 text-sm text-slate-700">
        <label className="mb-1 flex min-h-8 items-center gap-2 font-medium">
          <input type="checkbox" checked={s.venueAddress == null} onChange={event => edit(index, event.target.checked
            ? { venueAddress: null, venueLat: null, venueLng: null }
            : { venueAddress: "", venueLat: null, venueLng: null })} />
          Use primary venue address
        </label>
        {s.venueAddress == null ? <p className="text-xs text-slate-600">{defaultVenueAddress || "Set a primary venue address below."}</p> : <>
          <label htmlFor={`${uid}-venue-${index}`} className="mb-1 block">Sitting {index + 1} delivery address</label>
          <AddressAutocomplete
            id={`${uid}-venue-${index}`}
            value={s.venueAddress}
            placeholder="Search for this office address..."
            countryCode="za"
            disabled={disabled}
            onChange={pick => edit(index, { venueAddress: pick.address || "", venueLat: pick.lat, venueLng: pick.lng })}
            hint="Choose a separate address for this sitting."
          />
          {s.venueLat == null && <p className="mt-1 text-xs text-slate-500">Pick a map suggestion to save its location for delivery planning.</p>}
        </>}
      </div>
      {value.length > 1 && <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm text-slate-700">Sitting {index + 1} delivery fee
          <Input type="number" min={0} step="0.01" value={s.deliveryFee ?? 0} onChange={e => onRouteFeeChange?.("delivery", index, Math.max(0, Number(e.target.value) || 0))} className="mt-1 text-base" />
        </label>
        <label className="min-w-0 text-sm text-slate-700">Sitting {index + 1} collection fee
          <Input type="number" min={0} step="0.01" value={s.collectionFee ?? 0} onChange={e => onRouteFeeChange?.("collection", index, Math.max(0, Number(e.target.value) || 0))} className="mt-1 text-base" />
        </label>
        <p className="text-xs text-slate-500 sm:col-span-2">Auto fees split by guest count. Edit a sitting amount to set a custom split; the summed delivery and collection fees appear once on the quote and invoice.</p>
      </div>}
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
