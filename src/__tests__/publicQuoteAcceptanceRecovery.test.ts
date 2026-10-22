import { recordAccept } from "@/services/publicQuoteService";
jest.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const plan = [{ guestCount: 60, serviceTime: "12:00" }, { guestCount: 40, serviceTime: "18:00" }];
const args = { token: "quote-token", acceptedByName: "Test client" };
const saved = { status: "accepted", converted_to_order_id: "order-id", service_sittings: plan.map((sitting, index) => ({
  sequence_number: index + 1, guest_count: sitting.guestCount, service_time: `${sitting.serviceTime}:00`,
})) };
const response = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => { global.fetch = jest.fn(); });
it("verifies the caterer quote acceptance after a lost response", async () => {
  (fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce(response(200, { ok: true, quote: saved }));
  expect(await recordAccept(args)).toEqual({ ok: true, orderId: "order-id", conversionPending: false });
  expect((fetch as jest.Mock).mock.calls[1][1]).toMatchObject({ cache: "no-store", method: "GET" });
});
it("recognises a committed acceptance after a gateway error while conversion is pending", async () => {
  (fetch as jest.Mock).mockResolvedValueOnce(response(504, {})).mockResolvedValueOnce(response(200, { ok: true, quote: { ...saved, converted_to_order_id: null } }));
  expect(await recordAccept(args)).toEqual({ ok: true, orderId: undefined, conversionPending: true });
});
it.each([
  { ...saved, service_sittings: [] },
  { ...saved, service_sittings: [{ sequence_number: 1, guest_count: 100, service_time: "12:00:00" }] },
  { ...saved, service_sittings: saved.service_sittings.map(s => ({ ...s, service_time: "13:00:00" })) },
])("recovers committed acceptance regardless of the staff-managed plan", async quote => {
  (fetch as jest.Mock).mockResolvedValueOnce(response(500, { ok: false, error: "Could not save serving times" }))
    .mockResolvedValueOnce(response(200, { ok: true, quote }));
  expect(await recordAccept(args)).toMatchObject({ ok: true, orderId: "order-id" });
});
it("keeps validation errors actionable without treating an unrelated accepted quote as success", async () => {
  (fetch as jest.Mock).mockResolvedValueOnce(response(400, { ok: false, error: "Invalid service time" }));
  expect(await recordAccept(args)).toEqual({ ok: false, error: "Invalid service time" });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not claim acceptance when the quote is still unaccepted", async () => {
  (fetch as jest.Mock).mockResolvedValueOnce(response(500, { ok: false, error: "Could not save acceptance" })).mockResolvedValueOnce(response(200, { ok: true, quote: { ...saved, status: "sent", converted_to_order_id: null } }));
  expect(await recordAccept(args)).toEqual({ ok: false, error: "Could not save acceptance" });
  expect(JSON.parse((fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ acceptedByName: "Test client" });
});
