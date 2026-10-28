/* eslint-disable @typescript-eslint/no-explicit-any */
// Contacts shows a credit badge per client: credit issued minus credit used.
import { getCompanyClientCredits } from "@/services/cancellation/clientCreditBalance";

const rows = [
  { client_id: "a", payment_type: "credit_issue", amount: 175 },
  { client_id: "a", payment_type: "credit_redeem", amount: 75 },
  { client_id: "b", payment_type: "credit_issue", amount: 50 },
  { client_id: "b", payment_type: "credit_redeem", amount: 50 },
];
const db: any = { from: () => { const q: any = { select: () => q, eq: () => q, not: () => q, in: async () => ({ data: rows, error: null }) }; return q; } };

it("lists only clients with credit left, net of what they used", async () => {
  expect(await getCompanyClientCredits(db, "co-1")).toEqual({ a: 100 });
});
