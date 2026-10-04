/** Resolve one complete bank bundle. Mixing a new bank name with an old
 * invoice's account number could send the client to the wrong account. */
export function resolveCompanyEftDetails(company: Record<string, unknown>, snapshot: Record<string, unknown> = {}) {
  const currentComplete = Boolean(company.bank_name && company.bank_account_number);
  const snapshotComplete = Boolean(snapshot.bankName && snapshot.accountNumber);
  const currentStarted = Boolean(company.bank_name || company.bank_account_number || company.bank_account_holder);
  // An incomplete current edit needs the owner to fix it. Silently falling
  // back to old account details after a change risks sending real money there.
  const useCurrent = currentComplete || currentStarted;
  const source = useCurrent ? company : snapshot;
  return {
    name: String((useCurrent ? source.bank_name : source.bankName) || ""),
    holder: String((useCurrent ? source.bank_account_holder : source.accountName) || ""),
    account: String((useCurrent ? source.bank_account_number : source.accountNumber) || ""),
    branch: String((useCurrent ? source.bank_branch_code : source.branchCode) || ""),
    type: String((useCurrent ? source.bank_account_type : source.accountType) || ""),
    instructions: String((useCurrent ? source.eft_instructions : source.instructions) || ""),
    available: currentComplete || (!currentStarted && snapshotComplete),
  };
}
