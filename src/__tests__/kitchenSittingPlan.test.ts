/** @jest-environment node */
import { kitchenPrepService } from "@/services/kitchenPrepService";
import { allocateSittingQuantities } from "@/lib/serviceSittings";
import { dedupeKitchenPrepTasks } from "@/lib/kitchen/prepTasks";
jest.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
jest.mock("@/services/inventoryDeductionService", () => ({ getRecipe: () => null }));
jest.mock("@/services/roleClockService", () => ({}));
const plan = [{ id: "s1", guestCount: 40, serviceTime: "12:00", kitchenReadyTime: "10:30", dispatchTime: "11:00" }, { id: "s2", guestCount: 60, serviceTime: "18:00", kitchenReadyTime: "16:30", dispatchTime: "17:00" }];
function database(overrides = {}, error: any = null) {
  const order = { id: "booking", company_id: "company", guest_count: 100, event_date: "2099-11-06", event_time: "12:00", region_id: "branch", quote: { menu_items: [{ name: "Brownie", quantity: 100 }] }, ...overrides };
  const filters: any[] = [];
  const db: any = { from(table: string) {
    const query: any = {};
    for (const method of ["select", "is", "ilike", "limit"]) query[method] = () => query;
    query.eq = (key: string, value: any) => { filters.push([table,key,value]); return query; };
    query.maybeSingle = async () => ({ data: table === "orders" ? order : null, error: table === "orders" ? error : null });
    return query;
  } };
  return { db, filters };
}
beforeEach(() => { jest.spyOn(kitchenPrepService, "getKitchenSettings").mockResolvedValue({ prepSafetyBufferMin:30,defaultPrepMinPerDish:15,defaultCookMinPerDish:30,autoGeneratePrepTasks:true,overtimeAfterHours:9,maxHotHoldMin:90,mealBreakAfterHours:5 }); });
afterEach(() => jest.restoreAllMocks());

test("two timed kitchen batches have independent task IDs, allocated portions and deadlines", async () => {
  const { db, filters } = database();
  const tasks = await kitchenPrepService.planTasksForOrder("company", "booking", db, plan);
  expect(tasks).toHaveLength(4);
  expect(tasks.map(task => [task.service_sitting_id, task.task_type, task.planned_yield])).toEqual([["s1","prep",40],["s1","cook",40],["s2","prep",60],["s2","cook",60]]);
  expect(tasks[2].notes).toContain("Sitting 2: 60 guests at 18:00");
  const finish = (task: any) => new Date(new Date(task.start_at).getTime() + task.duration_min * 60000).toISOString();
  expect(finish(tasks[1])).toBe("2099-11-06T08:30:00.000Z");
  expect(finish(tasks[3])).toBe("2099-11-06T14:30:00.000Z");
  expect(filters).toContainEqual(["orders","company_id","company"]);
});
test("automatic prep generation reads the staff-approved sittings on the order", async () => {
  const { db } = database({ service_sittings: plan.map((row,i)=>({ id:row.id,sequence_number:i+1,guest_count:row.guestCount,service_time:row.serviceTime,kitchen_ready_time:row.kitchenReadyTime,dispatch_time:row.dispatchTime })) });
  expect((await kitchenPrepService.planTasksForOrder("company","booking",db)).map(task=>task.service_sitting_id)).toEqual(["s1","s1","s2","s2"]);
});
test("legacy single-sitting bookings retain the normal whole-order plan", async () => {
  const { db } = database(); const tasks=await kitchenPrepService.planTasksForOrder("company","booking",db);
  expect(tasks).toHaveLength(2);expect(tasks[0].service_sitting_id).toBeUndefined();
});
test("a failed order read cannot be mistaken for an empty kitchen plan", async () => {
  jest.spyOn(console,"error").mockImplementation(()=>{});
  await expect(kitchenPrepService.planTasksForOrder("company","booking",database({},new Error("Read failed")).db,plan)).rejects.toThrow("Read failed");
});
test.each([[100,[50,50],[50,50]],[1,[50,50],[1,0]],[7,[20,30,50],[1,2,4]],[2.5,[50,50],[1.25,1.25]]] as const)("allocating %s portions preserves the total", (quantity,guests,expected)=> {
  expect(allocateSittingQuantities(quantity,[...guests])).toEqual(expected);
});
test("deduplication preserves distinct sittings even with identical dishes and times",()=>{
  const base={task_type:"prep",menu_item_name:"Brownie",start_at:"2099-11-06T10:00:00Z",duration_min:30};
  expect(dedupeKitchenPrepTasks([{...base,id:"a",service_sitting_id:"s1"},{...base,id:"b",service_sitting_id:"s2"}])).toHaveLength(2);
});
