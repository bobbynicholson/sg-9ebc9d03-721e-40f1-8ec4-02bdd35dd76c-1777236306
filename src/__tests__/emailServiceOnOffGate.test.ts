/** @jest-environment node */
import { emailService } from "@/services/emailService";
import { skipIfTurnedOff } from "@/lib/email/automatedDelivery";

jest.mock("@/lib/email/automatedDelivery", () => ({ skipIfTurnedOff: jest.fn() }));

const STOP = new Error("stopped after the on/off gate");
const payload = { companyId: "c1", to: "client@example.com", subject: "Order confirmed", template: "order_confirmed", _client: {} };

describe("emailService on/off gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Anything past the gate is the real send path; stop there.
    jest.spyOn(emailService, "getEmailConfig").mockRejectedValue(STOP);
  });

  it("does not send an automatic email that is turned off", async () => {
    (skipIfTurnedOff as jest.Mock).mockResolvedValue({ success: true, skippedBySettings: true, heldForApproval: false });
    const result = await emailService.sendEmailDetailed(payload as any);
    expect(result).toEqual({ success: true, skipped_by_settings: true });
    expect(emailService.getEmailConfig).not.toHaveBeenCalled();
  });

  it("sends normally when the email is automatic", async () => {
    (skipIfTurnedOff as jest.Mock).mockResolvedValue(null);
    await expect(emailService.sendEmailDetailed(payload as any)).rejects.toBe(STOP);
    expect(skipIfTurnedOff).toHaveBeenCalledTimes(1);
  });

  it("always sends an admin's own Send action, and does not re-check an already-checked send", async () => {
    await expect(emailService.sendEmailDetailed({ ...payload, deliveryContext: "manual" } as any)).rejects.toBe(STOP);
    await expect(emailService.sendEmailDetailed({ ...payload, _deliveryApproved: true } as any)).rejects.toBe(STOP);
    expect(skipIfTurnedOff).not.toHaveBeenCalled();
  });
});
