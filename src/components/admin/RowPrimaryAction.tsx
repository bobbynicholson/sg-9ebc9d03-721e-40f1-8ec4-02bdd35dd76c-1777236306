/**
 * RowPrimaryAction - the single "next-step" button each row gets across
 * Contacts, Leads and Quotes. Standardised so the operator's eye lands
 * in the same place on every CRM surface and the colour codes the same
 * urgency on every page.
 *
 * Tone -> colour mapping:
 *   urgent  -> rose 600 (action overdue, hot lead, expiring quote)
 *   warm    -> amber 600 (chase, sweetener, win-back)
 *   neutral -> emerald 600 (routine, compose, follow-up)
 *
 * Pages compute their own (tone, label, icon) from page-specific
 * intelligence helpers (deriveLeadSuggestion, deriveQuoteIntelligence,
 * contact.suggestion). The visual treatment is the constant.
 */
import { Button } from "@/components/ui/button";

export type RowActionTone = "urgent" | "warm" | "neutral";

const TONE_CLASS: Record<RowActionTone, string> = {
  urgent:  "bg-rose-600 hover:bg-rose-700 text-white",
  warm:    "bg-amber-600 hover:bg-amber-700 text-white",
  neutral: "bg-brand-primary hover:bg-brand-primary/90 text-white",
};

export function RowPrimaryAction({
  tone,
  label,
  icon,
  onClick,
  disabled,
  tooltip,
  className,
}: {
  tone: RowActionTone;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tooltip?: string;
  className?: string;
}) {
  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={`gap-1.5 font-semibold ${TONE_CLASS[tone]} ${className || ""}`}
    >
      {icon}
      {label}
    </Button>
  );
}
