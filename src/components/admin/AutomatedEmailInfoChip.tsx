import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { automatedEmailDescription } from "@/lib/email/automatedEmailDescriptions";

interface AutomatedEmailInfoChipProps {
  templateKey: string;
  label: string;
}

/**
 * "What is this?" chip on each automatic email in Email settings. Opens on
 * click (works on touch) and explains who gets the email, when it is sent
 * and what turning it off means, so an admin can pick Automatic or Off.
 */
export function AutomatedEmailInfoChip({ templateKey, label }: AutomatedEmailInfoChipProps) {
  const info = automatedEmailDescription(templateKey);
  if (!info) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What the "${label}" email is for`}
          className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 transition-colors hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          <Info className="h-3 w-3" aria-hidden="true" />
          What is this?
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-[min(90vw,20rem)] p-3">
        <p className="text-xs font-semibold text-slate-900">{label}</p>
        <dl className="mt-2 space-y-2 text-xs leading-5">
          <div>
            <dt className="font-medium text-slate-500">Who gets it</dt>
            <dd className="text-slate-800">{info.who}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">When it's sent</dt>
            <dd className="text-slate-800">{info.when}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">If you turn it off</dt>
            <dd className="text-slate-800">{info.ifOff}</dd>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  );
}
