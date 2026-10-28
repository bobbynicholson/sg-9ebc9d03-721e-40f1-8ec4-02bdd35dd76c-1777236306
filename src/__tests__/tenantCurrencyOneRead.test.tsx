/** @jest-environment jsdom */
// Many money widgets on one page share a single currency read.
import { render, waitFor } from "@testing-library/react";

const calls: string[] = [];
jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      calls.push(table);
      const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { currency: "GBP" }, error: null }) };
      return q;
    },
  },
}));

import { useTenantCurrency } from "@/hooks/useTenantCurrency";

function Money() {
  const c = useTenantCurrency("co-1");
  return <span>{c.code}</span>;
}

it("sends one request when ten components mount together", async () => {
  const { container } = render(<>{Array.from({ length: 10 }, (_, i) => <Money key={i} />)}</>);
  await waitFor(() => expect(container.textContent).toBe("GBP".repeat(10)));
  expect(calls).toEqual(["companies"]);
});
