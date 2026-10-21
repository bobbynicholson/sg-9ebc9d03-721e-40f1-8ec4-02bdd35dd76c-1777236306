import { useId } from "react";
import { Input } from "@/components/ui/input";
import type { ServiceSittingsForm } from "@/lib/serviceSittings";

export function ServiceSittingsEditor({ value, totalGuests, onChange, optional = false, disabled = false }: {
  value: ServiceSittingsForm;
  totalGuests: number;
  onChange: (value: ServiceSittingsForm) => void;
  optional?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset disabled={disabled} aria-describedby={`${id}-hint`} className="min-w-0 space-y-3 border-t border-stone-200 pt-4 text-sm text-stone-700">
      <legend className="font-semibold text-stone-900">{optional ? "Serving times (optional)" : "How will guests be served?"}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <label className="flex min-h-10 items-center gap-2">
          <input type="radio" className="accent-brand-primary" name={`${id}-count`} checked={value.count === 1} onChange={() => onChange({ ...value, count: 1 })} />
          One service time
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input type="radio" className="accent-brand-primary" name={`${id}-count`} checked={value.count === 2} onChange={() => onChange({ ...value, count: 2, firstGuests: value.count === 2 ? value.firstGuests : Math.ceil(totalGuests / 2) })} />
          Two sittings
        </label>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        {value.count === 2 && <label className="min-w-0 space-y-1">First guests
          <Input type="number" min={1} step={1} max={Math.max(1, totalGuests - 1)} value={value.firstGuests || ""} onChange={e => onChange({ ...value, firstGuests: Number(e.target.value) })} className="text-base" />
        </label>}
        <label className="min-w-0 space-y-1">{value.count === 2 ? "First time" : "Service time"}
          <Input type="time" value={value.firstTime} onChange={e => onChange({ ...value, firstTime: e.target.value })} className="min-w-0 text-base" />
        </label>
        {value.count === 2 && <>
          <p className="self-center" aria-live="polite">Second guests: <strong>{Math.max(0, totalGuests - value.firstGuests)}</strong></p>
          <label className="min-w-0 space-y-1">Second time
            <Input type="time" value={value.secondTime} onChange={e => onChange({ ...value, secondTime: e.target.value })} className="min-w-0 text-base" />
          </label>
        </>}
      </div>
      <p id={`${id}-hint`} className="text-sm text-stone-600">{totalGuests} guests in total. {optional ? "The caterer will review these times and send an updated quote." : "Your caterer will confirm kitchen batches, drivers, cleaning and equipment-return timing."}</p>
    </fieldset>
  );
}
