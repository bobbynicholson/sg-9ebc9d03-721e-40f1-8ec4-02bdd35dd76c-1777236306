/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */

const broadcasts: any[] = [];
jest.mock("@/services/notificationService", () => ({
  notificationService: {
    broadcastNotification: async (payload: any) => { broadcasts.push(payload); },
  },
}));

import { completeJob } from "@/services/cleaningJobsService";

const completedRow = {
  completed: true,
  already_complete: false,
  status: "complete",
  company_id: "company-1",
  equipment_id: "equipment-1",
  quantity: 2,
  triggered_by_event_id: "order-1",
};

function clientFor(result: any) {
  const rpc = jest.fn(async (name: string) => {
    if (name === "complete_cleaning_job") return result;
    return { data: null, error: null };
  });
  const maybeSingle = jest.fn(async () => ({ data: { name: "Chafing dish" }, error: null }));
  const chain: any = { select: () => chain, eq: () => chain, maybeSingle };
  return { client: { rpc, from: jest.fn(() => chain) }, rpc, maybeSingle };
}

beforeEach(() => { broadcasts.length = 0; });

test("completes through the atomic RPC, then records one contributor and notification", async () => {
  const { client, rpc, maybeSingle } = clientFor({ data: [completedRow], error: null });

  await expect(completeJob(client as any, "job-1", "user-1")).resolves.toEqual({ ok: true });

  expect(rpc.mock.calls).toEqual([
    ["complete_cleaning_job", { p_job_id: "job-1" }],
    ["record_cleaning_contributor", { p_job_id: "job-1", p_user_id: "user-1" }],
  ]);
  expect(maybeSingle).toHaveBeenCalledTimes(1);
  expect(broadcasts).toHaveLength(1);
  expect(broadcasts[0]).toMatchObject({ relatedEntityId: "job-1", companyId: "company-1" });
});

test.each([
  ["queued", "Start this cleaning job before completing it."],
  ["cancelled", "This cleaning job was cancelled."],
])("does not perform side effects when an atomic completion rejects a %s job", async (status, error) => {
  const { client, rpc } = clientFor({ data: [{ ...completedRow, completed: false, already_complete: false, status }], error: null });

  await expect(completeJob(client as any, "job-1", "user-1")).resolves.toEqual({ ok: false, error });

  expect(rpc).toHaveBeenCalledTimes(1);
  expect(broadcasts).toHaveLength(0);
});

test("a repeat or concurrent loser is idempotent and has no side effects", async () => {
  const { client, rpc } = clientFor({ data: [{ ...completedRow, completed: false, already_complete: true }], error: null });

  await expect(completeJob(client as any, "job-1", "user-1")).resolves.toEqual({ ok: true });

  expect(rpc).toHaveBeenCalledTimes(1);
  expect(broadcasts).toHaveLength(0);
});

test("does not claim success when the atomic transaction fails", async () => {
  const { client, rpc } = clientFor({ data: null, error: { message: "equipment update failed" } });

  await expect(completeJob(client as any, "job-1", "user-1")).resolves.toEqual({ ok: false, error: "equipment update failed" });

  expect(rpc).toHaveBeenCalledTimes(1);
  expect(broadcasts).toHaveLength(0);
});
