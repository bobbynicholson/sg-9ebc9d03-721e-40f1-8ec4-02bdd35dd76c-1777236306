import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DriverStatusDialog } from "@/components/driver/DriverStatusDialog";
import {
  clearPendingPodCapture,
  markPodCapturePending,
  readPendingPodCapture,
} from "@/lib/podCaptureRecovery";

let mockRenderNestedPod = false;

jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/lib/events/orderEvents", () => ({ emitOrderUpdated: jest.fn() }));
jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: jest.fn(),
    storage: { from: jest.fn() },
  },
}));
jest.mock("@/components/driver/DriverConfirmationPanel", () => ({
  DriverConfirmationPanel: ({ orderId }: { orderId: string }) => {
    if (!mockRenderNestedPod) return <div>Confirmation workflow</div>;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PodCaptureDialog } = require("@/components/driver/PodCaptureDialog");
    return (
      <PodCaptureDialog
        open
        onOpenChange={jest.fn()}
        orderId={orderId}
        title="Setup completed"
        recoveryFlow="status"
      />
    );
  },
}));

const job = {
  id: "order-1",
  order_number: "356880",
  client_name: "Callum Rogers",
  event_time: "12:00:00",
  venue_address: "17 Denison Way",
};

describe("DriverStatusDialog POD nesting", () => {
  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: jest.fn(() => ({
        beginPath: jest.fn(),
        fillRect: jest.fn(),
        lineTo: jest.fn(),
        moveTo: jest.fn(),
        stroke: jest.fn(),
      })),
    });
  });

  beforeEach(() => {
    localStorage.clear();
    mockRenderNestedPod = false;
  });

  it("keeps the nested Setup POD and selected camera file through focus return", async () => {
    mockRenderNestedPod = true;
    const onClose = jest.fn();
    const { container } = render(<DriverStatusDialog job={job} onClose={onClose} />);
    const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    const photo = new File(["image-bytes"], "delivery.jpg", { type: "image/jpeg" });

    fireEvent.change(input, { target: { files: [photo] } });
    fireEvent.pointerDown(document.body);
    fireEvent.focus(window);

    await waitFor(() => expect(screen.getByAltText("Delivery")).not.toBeNull());
    expect(screen.getByText("Setup completed")).not.toBeNull();
    expect(readPendingPodCapture(localStorage)?.flow).toBe("status");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not dismiss the parent workflow on an outside camera-return interaction", () => {
    const onClose = jest.fn();
    render(<DriverStatusDialog job={job} onClose={onClose} />);

    fireEvent.pointerDown(document.body);
    fireEvent.focus(document.body);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("driver-status-dialog")).not.toBeNull();
  });

  it("refuses a close while POD capture is pending, then closes normally after cancel", () => {
    const onClose = jest.fn();
    render(<DriverStatusDialog job={job} onClose={onClose} />);
    markPodCapturePending(job.id, Date.now(), localStorage);

    fireEvent.keyDown(screen.getByTestId("driver-status-dialog"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    clearPendingPodCapture(job.id, localStorage);
    fireEvent.keyDown(screen.getByTestId("driver-status-dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
