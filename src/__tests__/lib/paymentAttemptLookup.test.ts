/** @jest-environment node */
import { getPaymentAttemptByReference, transitionPaymentAttempt } from "@/services/paymentAttemptService";
import { getServiceSupabase } from "@/lib/supabase/service";
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: jest.fn() }));
const uuid = "00000000-0000-0000-0000-000000000001";
function setup(reference = "checkout_fixture") {
  const attempt = { id: uuid, provider_session_id: reference, status: "pending" };
  const filters: [string, unknown][] = [];
  let selected: unknown = null;
  const q = { select: jest.fn(), in: jest.fn(), update: jest.fn(),
    eq: jest.fn((field: string, value: unknown) => {
      filters.push([field, value]);
      if (field === "id" && typeof value === "string" && value !== uuid) throw new Error("invalid input syntax for type uuid");
      if (field === "id" || field === "provider_session_id") selected = value === uuid || value === reference ? attempt : null;
      return q;
    }), contains: jest.fn(), maybeSingle: jest.fn(async () => ({ data: selected, error: null })) };
  q.select.mockReturnValue(q); q.in.mockReturnValue(q); q.update.mockReturnValue(q); q.contains.mockReturnValue(q);
  (getServiceSupabase as jest.Mock).mockReturnValue({ from: () => q });
  return { attempt, filters };
}
test("provider checkout reference never reaches the UUID column", async () => {
  const { attempt, filters } = setup();
  expect(await getPaymentAttemptByReference("yoco", "checkout_fixture")).toEqual(attempt);
  expect(filters).not.toContainEqual(["id", "checkout_fixture"]);
});
test("saved UUID continues to use exact attempt correlation", async () => {
  const { attempt, filters } = setup(); expect(await getPaymentAttemptByReference("yoco", uuid)).toEqual(attempt);
  expect(filters).toContainEqual(["id", uuid]);
});
test("legacy provider reference can transition without a UUID parsing error", async () => {
  const { filters } = setup(); const result = await transitionPaymentAttempt({provider:"yoco",attemptId:"checkout_fixture",status:"failed"});
  expect(result.changed).toBe(true); expect(filters).not.toContainEqual(["id", "checkout_fixture"]);
  expect(filters).toContainEqual(["id", uuid]);
});
