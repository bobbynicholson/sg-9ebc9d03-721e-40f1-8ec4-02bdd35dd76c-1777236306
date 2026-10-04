import { resolveCompanyEftDetails } from "@/lib/companyEftDetails";
const snapshot = { bankName: "Old bank", accountNumber: "old-account", accountName: "Old holder", branchCode: "old-branch" };
test("complete current company details take precedence as a complete bundle", () => {
  expect(resolveCompanyEftDetails({ bank_name: "New bank", bank_account_number: "new-account" }, snapshot))
    .toMatchObject({ name: "New bank", account: "new-account", holder: "", branch: "", available: true });
});
test("partial current configuration cannot combine a new bank with an old invoice account", () => {
  expect(resolveCompanyEftDetails({ bank_name: "New bank" }, snapshot)).toMatchObject({ name: "New bank", account: "", available: false });
});
test("complete invoice snapshot can be used when no current bank configuration exists", () => {
  expect(resolveCompanyEftDetails({}, snapshot)).toMatchObject({ name: "Old bank", account: "old-account", available: true });
});
test("incomplete snapshot and missing company details cannot offer EFT", () => {
  expect(resolveCompanyEftDetails({}, { bankName: "Old bank" }).available).toBe(false);
  expect(resolveCompanyEftDetails({}).available).toBe(false);
});
