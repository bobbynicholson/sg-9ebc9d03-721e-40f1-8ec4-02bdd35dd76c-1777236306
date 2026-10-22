import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Keep the person we talk to separate from the organisation we bill. */
export function CustomerIdentityFields({ contactName, companyName, onContactNameChange, onCompanyNameChange, idPrefix = "customer", contactInput, companyRequired = false }: {
  contactName: string;
  companyName: string;
  onContactNameChange: (value: string) => void;
  onCompanyNameChange: (value: string) => void;
  idPrefix?: string;
  contactInput?: ReactNode;
  companyRequired?: boolean;
}) {
  return <div className="space-y-3">
    <div>
      <Label htmlFor={`${idPrefix}-contact-name`}>Contact name</Label>
      {contactInput || <Input id={`${idPrefix}-contact-name`} value={contactName} onChange={(e) => onContactNameChange(e.target.value)} maxLength={200} autoComplete="name" placeholder="Sheri Lee Pan" className="mt-1 text-base sm:text-sm" aria-describedby={`${idPrefix}-contact-hint`} />}
      <p id={`${idPrefix}-contact-hint`} className="mt-1 text-xs text-slate-600">The person addressed in emails and messages.</p>
    </div>
    <div>
      <Label htmlFor={`${idPrefix}-company-name`}>Company / organisation name{!companyRequired && " (optional)"}</Label>
      <Input id={`${idPrefix}-company-name`} value={companyName} onChange={(e) => onCompanyNameChange(e.target.value)} maxLength={200} autoComplete="organization" placeholder="Company legal name" required={companyRequired} className="mt-1 text-base sm:text-sm" aria-describedby={`${idPrefix}-company-hint`} />
      <p id={`${idPrefix}-company-hint`} className="mt-1 text-xs text-slate-600">Quotes, invoices and receipts are billed to this name.{!companyRequired && " Leave blank to bill the contact."}</p>
    </div>
  </div>;
}
