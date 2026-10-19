const broadcastNotification = jest.fn(async () => 1);
jest.mock("@/services/notificationService", () => ({ notificationService: { broadcastNotification } }));

import { fireRichCancellationNotification } from "@/services/cancellation/fireCancellationNotification";

const input = {
  supabase: {} as any,
  orderId: "11111111-2222-3333-4444-555555555555",
  companyId: "company-1",
  orderNumber: "ORD-1001",
  clientName: "Thandi",
  eventDate: "2026-11-20",
  daysToEvent: 32,
  payoutChoice: "refund" as const,
  refundAmount: 1500,
  creditAmount: 0,
  committedCostNote: null,
  requestedBy: "admin" as const,
};

beforeEach(() => broadcastNotification.mockClear());

test("office cancellation alerts admins and tells every working team to stand down", async () => {
  await fireRichCancellationNotification(input);
  expect(broadcastNotification).toHaveBeenCalledTimes(2);

  const [adminCall] = broadcastNotification.mock.calls[0] as any[];
  expect(adminCall.type).toBe("order_cancelled");
  expect(adminCall.targetRoles).not.toContain("shopping_staff");

  const [staffCall] = broadcastNotification.mock.calls[1] as any[];
  expect(staffCall).toMatchObject({
    type: "cancellation_approved",
    title: "Order cancelled - stand down",
    link: `/order/${input.orderId}`,
    relatedEntityId: input.orderId,
    dedup: true,
  });
  for (const role of ["kitchen_staff", "shopping_staff", "driver", "waiter", "cleaning_staff"]) {
    expect(staffCall.targetRoles).toContain(role);
  }
  // Staff never see refund or payout amounts.
  expect(staffCall.message).not.toMatch(/refund|R\s?1|1 ?500/i);
});

test("a failed admin alert still sends the staff stand-down", async () => {
  broadcastNotification.mockRejectedValueOnce(new Error("down"));
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await fireRichCancellationNotification(input);
  } finally {
    warn.mockRestore();
  }
  expect(broadcastNotification).toHaveBeenCalledTimes(2);
  expect((broadcastNotification.mock.calls[1] as any[])[0].type).toBe("cancellation_approved");
});
