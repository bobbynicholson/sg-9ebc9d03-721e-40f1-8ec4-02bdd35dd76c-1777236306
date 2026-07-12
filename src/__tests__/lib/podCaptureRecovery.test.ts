import {
  clearPendingPodCapture,
  hasFreshPendingPodCapture,
  markPodCapturePending,
  pendingPodRecoveryFlow,
  POD_PENDING_KEY,
  readPendingPodCapture,
} from "@/lib/podCaptureRecovery";

describe("POD camera recovery marker", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the parent workflow alive for a fresh capture", () => {
    markPodCapturePending("order-1", 1_000, localStorage);

    expect(readPendingPodCapture(localStorage)).toEqual({ orderId: "order-1", at: 1_000, flow: "direct" });
    expect(hasFreshPendingPodCapture("order-1", 2_000, localStorage)).toBe(true);
    expect(hasFreshPendingPodCapture("another-order", 2_000, localStorage)).toBe(false);
  });

  it("preserves the owning workflow across a page remount", () => {
    markPodCapturePending("order-1", 1_000, localStorage, "status");
    const pending = readPendingPodCapture(localStorage);
    expect(pending).not.toBeNull();
    if (!pending) throw new Error("pending POD marker missing");
    expect(pendingPodRecoveryFlow(pending)).toBe("status");
    // Pre-deploy markers had no flow tag; recover them into the complete
    // Status/setup cascade rather than hijacking them with direct delivery.
    expect(pendingPodRecoveryFlow({ orderId: "order-1", at: 1_000 })).toBe("status");
  });

  it("does not let stale or corrupt markers pin a dialog open", () => {
    markPodCapturePending("order-1", 1_000, localStorage);
    expect(hasFreshPendingPodCapture("order-1", 16 * 60_000 + 1_001, localStorage)).toBe(false);

    localStorage.setItem(POD_PENDING_KEY, "not-json");
    expect(readPendingPodCapture(localStorage)).toBeNull();
  });

  it("only clears the marker belonging to the closed capture", () => {
    markPodCapturePending("order-1", 1_000, localStorage);
    clearPendingPodCapture("order-2", localStorage);
    expect(readPendingPodCapture(localStorage)?.orderId).toBe("order-1");

    clearPendingPodCapture("order-1", localStorage);
    expect(readPendingPodCapture(localStorage)).toBeNull();
  });
});
