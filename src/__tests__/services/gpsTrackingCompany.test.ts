/** @jest-environment node */
// The gps_tracking history row must carry the driver's company: the
// company_fk_* relationship checks run before the table's stamp trigger
// and reject a row whose company_id is still empty.
const inserts: Record<string, any[]> = {};
jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: jest.fn((table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { company_id: "company-1" }, error: null }) }) }),
      upsert: async (row: any) => { (inserts[table] ||= []).push(row); return { error: null }; },
      insert: async (row: any) => { (inserts[table] ||= []).push(row); return { error: null }; },
    })),
  },
}));

import { updateDriverLocation } from "@/services/driver/gpsTracking";

test("history and current location both carry the driver's company", async () => {
  const result = await updateDriverLocation("driver-1", { latitude: -33.9, longitude: 18.4, accuracy: 5 } as any, "order-1");
  expect(result).toEqual({ success: true });
  expect(inserts.driver_locations[0]).toMatchObject({ driver_id: "driver-1", company_id: "company-1" });
  expect(inserts.gps_tracking[0]).toMatchObject({ driver_id: "driver-1", order_id: "order-1", company_id: "company-1" });
});
