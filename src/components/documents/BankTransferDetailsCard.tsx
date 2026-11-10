export type BankTransferDisplayDetails = {
  available: boolean;
  name: string;
  holder: string;
  account: string;
  branch: string;
  type: string;
  instructions: string;
};

export function BankTransferDetailsCard({
  details,
  companyName,
  companyEmail,
  title = "Bank transfer details (EFT)",
  referenceHint,
  paidInFull = false,
  className = "",
}: {
  details: BankTransferDisplayDetails | null | undefined;
  companyName: string;
  companyEmail?: string | null;
  title?: string;
  referenceHint?: string;
  paidInFull?: boolean;
  className?: string;
}) {
  const email = String(companyEmail || "").trim();
  return (
    <section className={`mb-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm print:break-inside-avoid print:shadow-none ${className}`}>
      <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-brand-primary">{title}</h2>
      {details?.available ? (
        <>
          <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-5 gap-y-1.5 text-sm">
            <dt className="text-stone-500">Bank</dt><dd className="font-medium text-stone-900">{details.name}</dd>
            {details.holder && <><dt className="text-stone-500">Account name</dt><dd className="font-medium text-stone-900">{details.holder}</dd></>}
            <dt className="text-stone-500">Account number</dt><dd className="font-mono font-medium text-stone-900">{details.account}</dd>
            {details.branch && <><dt className="text-stone-500">Branch code</dt><dd className="font-mono font-medium text-stone-900">{details.branch}</dd></>}
            {details.type && <><dt className="text-stone-500">Account type</dt><dd className="font-medium capitalize text-stone-900">{details.type}</dd></>}
          </dl>
          {details.instructions && <p className="mt-2 whitespace-pre-line text-xs text-stone-600">{details.instructions}</p>}
        </>
      ) : (
        <p className="mt-2 text-sm text-stone-700">
          Bank transfer is welcome. {email
            ? <>Email <a className="font-semibold text-brand-primary underline" href={`mailto:${email}`}>{companyName}</a> to request the account details.</>
            : <>Contact {companyName} to request the account details.</>}
        </p>
      )}
      {referenceHint && <p className="mt-3 text-xs text-stone-600">{referenceHint}</p>}
      {paidInFull && <p className="mt-3 rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-700">This invoice is paid in full. These details are shown for your records; no further payment is due.</p>}
    </section>
  );
}
