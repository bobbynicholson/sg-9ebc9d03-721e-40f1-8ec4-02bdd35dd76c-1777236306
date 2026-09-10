import { computeOrderTimeline } from "@/services/order/orderTimeline";

function stageStatus(timeline: ReturnType<typeof computeOrderTimeline>, key: string) {
  return timeline.stages.find((stage) => stage.key === key)?.status;
}

describe("computeOrderTimeline post-event collection fallback", () => {
  const completedOrder = {
    id: "order-1",
    status: "completed",
    created_at: "2026-06-01T08:00:00.000Z",
    confirmed_at: "2026-06-01T08:05:00.000Z",
    ready_at: "2026-06-01T10:00:00.000Z",
    picked_up_at: "2026-06-01T10:30:00.000Z",
    delivered_at: "2026-06-01T11:15:00.000Z",
    completed_at: "2026-06-02T09:00:00.000Z",
    updated_at: "2026-06-02T09:00:00.000Z",
    event_date: "2026-06-01",
    event_time: "12:00:00",
    deposit_amount: 0,
    balance_amount: 0,
  };

  it("marks collection scheduled and equipment back complete when cleaning jobs prove gear returned", () => {
    const timeline = computeOrderTimeline({
      order: completedOrder,
      equipmentBookings: [{ id: "booking-1", equipment_id: "equipment-1" }],
      driverAssignments: [],
      cleaningJobsForOrder: [{
        status: "complete",
        created_at: "2026-06-01T12:30:00.000Z",
        actual_start: "2026-06-01T12:35:00.000Z",
        actual_end: "2026-06-01T13:30:00.000Z",
      }],
      invoices: [],
      emailLog: [],
    });

    expect(stageStatus(timeline, "collection_scheduled")).toBe("completed");
    expect(stageStatus(timeline, "collection_done")).toBe("completed");
    expect(stageStatus(timeline, "post_event_cleaning")).toBe("completed");
    expect(timeline.completedCount).toBe(timeline.applicableCount);
  });

  it("uses completed cleaning handovers when legacy cleaning jobs are missing", () => {
    const timeline = computeOrderTimeline({
      order: {
        ...completedOrder,
        id: "order-handover",
        status: "delivered",
        completed_at: null,
      },
      equipmentBookings: [{ id: "booking-1", equipment_id: "equipment-1" }],
      driverAssignments: [],
      cleaningJobsForOrder: [],
      cleaningHandoversForOrder: [{
        status: "complete",
        expected_at: "2026-06-01T12:30:00.000Z",
        in_progress_at: "2026-06-01T12:40:00.000Z",
        completed_at: "2026-06-01T13:30:00.000Z",
        total_items_expected: 18,
        total_items_returned: 18,
      }],
      invoices: [],
      emailLog: [],
    });

    expect(stageStatus(timeline, "collection_scheduled")).toBe("completed");
    expect(stageStatus(timeline, "collection_done")).toBe("completed");
    expect(stageStatus(timeline, "post_event_cleaning")).toBe("completed");
  });

  it("treats an in-progress handover as equipment returned without closing cleaning", () => {
    const timeline = computeOrderTimeline({
      order: {
        ...completedOrder,
        id: "order-handover-in-progress",
        status: "delivered",
        completed_at: null,
      },
      equipmentBookings: [{ id: "booking-1", equipment_id: "equipment-1" }],
      driverAssignments: [],
      cleaningJobsForOrder: [],
      cleaningHandoversForOrder: [{
        status: "in_progress",
        expected_at: "2026-06-01T12:30:00.000Z",
        in_progress_at: "2026-06-01T12:40:00.000Z",
        completed_at: null,
        total_items_expected: 18,
        total_items_returned: 12,
      }],
      invoices: [],
      emailLog: [],
    });

    expect(stageStatus(timeline, "collection_scheduled")).toBe("completed");
    expect(stageStatus(timeline, "collection_done")).toBe("completed");
    expect(stageStatus(timeline, "post_event_cleaning")).toBe("current");
  });

  it("does not leave completed orders stuck on post-event stages when batched joins are partial", () => {
    const timeline = computeOrderTimeline({
      order: completedOrder,
      equipmentBookings: [{ id: "booking-1", equipment_id: "equipment-1" }],
      driverAssignments: [],
      cleaningJobsForOrder: [],
      cleaningHandoversForOrder: [],
      invoices: [],
      emailLog: [],
    });

    expect(stageStatus(timeline, "collection_scheduled")).toBe("completed");
    expect(stageStatus(timeline, "collection_done")).toBe("completed");
    expect(stageStatus(timeline, "post_event_cleaning")).toBe("completed");
  });

  it("counts returned bookings as equipment back without pretending cleaning is done", () => {
    const timeline = computeOrderTimeline({
      order: {
        ...completedOrder,
        id: "order-returned-bookings",
        status: "delivered",
        completed_at: null,
      },
      equipmentBookings: [{
        id: "booking-1",
        equipment_id: "equipment-1",
        quantity: 10,
        returned_quantity: 10,
        status: "returned",
        updated_at: "2026-06-01T13:00:00.000Z",
      }],
      driverAssignments: [],
      cleaningJobsForOrder: [],
      cleaningHandoversForOrder: [],
      invoices: [],
      emailLog: [],
    });

    expect(stageStatus(timeline, "collection_scheduled")).toBe("completed");
    expect(stageStatus(timeline, "collection_done")).toBe("completed");
    expect(stageStatus(timeline, "post_event_cleaning")).not.toBe("completed");
  });

  it("keeps equipment back pending when there is no collection or cleaning signal", () => {
    const timeline = computeOrderTimeline({
      order: {
        ...completedOrder,
        id: "order-2",
        status: "delivered",
        completed_at: null,
      },
      equipmentBookings: [{ id: "booking-1", equipment_id: "equipment-1" }],
      driverAssignments: [],
      cleaningJobsForOrder: [],
      invoices: [],
      emailLog: [],
    });

    expect(stageStatus(timeline, "collection_done")).toBe("upcoming");
  });

  it("does not mark equipment back complete just because delivered orders queued cleaning", () => {
    const timeline = computeOrderTimeline({
      order: {
        ...completedOrder,
        id: "order-3",
        status: "delivered",
        completed_at: null,
      },
      equipmentBookings: [{ id: "booking-1", equipment_id: "equipment-1" }],
      driverAssignments: [{
        assignment_type: "collection",
        status: "assigned",
        created_at: "2026-06-01T12:20:00.000Z",
      }],
      cleaningJobsForOrder: [{
        status: "queued",
        created_at: "2026-06-01T12:30:00.000Z",
        actual_start: null,
        actual_end: null,
      }],
      invoices: [],
      emailLog: [],
    });

    expect(stageStatus(timeline, "collection_scheduled")).toBe("completed");
    expect(stageStatus(timeline, "collection_done")).not.toBe("completed");
    expect(stageStatus(timeline, "post_event_cleaning")).not.toBe("completed");
  });
});
