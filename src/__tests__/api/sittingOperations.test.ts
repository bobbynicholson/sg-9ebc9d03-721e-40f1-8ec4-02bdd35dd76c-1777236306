/** @jest-environment node */
import quoteHandler from "@/pages/api/admin/quotes/[id]/service-plan";
import orderHandler from "@/pages/api/orders/[id]/service-plan";
import tripHandler from "@/pages/api/driver/sitting-trip";
import { servicePlanAccess } from "@/lib/servicePlanAccess";
import { kitchenPrepService } from "@/services/kitchenPrepService";
jest.mock("@/services/kitchenPrepService", () => ({ kitchenPrepService: { planTasksForOrder: jest.fn(async () => []) } }));
jest.mock("@/lib/servicePlanAccess", () => ({ servicePlanAccess: jest.fn() }));
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
const id = "00000000-0000-0000-0000-000000000001";
const rpc = jest.fn();
const access = { db: { rpc }, userId: "current-driver", companyId: "verified-company", isAdmin: true };
function setup(handler: any, body: any = {}) {
  const req: any = { method: "POST", query: { id }, body };
  const res: any = { status: jest.fn(function(this: any, code: number) { this.code = code; return this; }), json: jest.fn(function(this: any, data: unknown) { this.body = data; return this; }) };
  return { req, res, run: () => handler(req, res) };
}
beforeEach(() => { jest.clearAllMocks(); (servicePlanAccess as jest.Mock).mockResolvedValue(access); rpc.mockResolvedValue({ error: null }); });
for (const [name, handler] of [["quote", quoteHandler], ["order", orderHandler], ["trip", tripHandler]] as const) {
  test(`${name} refuses unsupported methods without doing any work`, async () => { const s = setup(handler); s.req.method = "GET"; await s.run(); expect(s.res.code).toBe(405); expect(rpc).not.toHaveBeenCalled(); });
  test(`${name} requires a signed-in company user`, async () => { (servicePlanAccess as jest.Mock).mockResolvedValue(null); await setup(handler).run(); expect(rpc).not.toHaveBeenCalled(); });
}
for (const handler of [quoteHandler, orderHandler]) {
  test(`${handler.name} rejects non-admin schedule changes`, async () => { (servicePlanAccess as jest.Mock).mockResolvedValue({ ...access, isAdmin: false }); const s = setup(handler); await s.run(); expect(s.res.code).toBe(403); expect(rpc).not.toHaveBeenCalled(); });
}
test("quote writes use the verified tenant, preserve both times, and include the reviewed request", async () => {
  const plan = [{ guestCount: 50, serviceTime: "12:00" }, { guestCount: 50, serviceTime: "18:00" }];
  const s = setup(quoteHandler, { plan, patch: { guest_count: 100 }, requestId: id, companyId: "forged-company" }); await s.run();
  expect(rpc).toHaveBeenCalledWith("save_admin_quote_service_plan", { p_quote_id: id, p_company_id: "verified-company", p_plan: plan, p_patch: { guest_count: 100 }, p_request_id: id }); expect(s.res.code).toBe(200);
});
test("operations writes retain separate driver selections and return plan", async () => {
  const sittings = [{ id, deliveryDriverIds: ["d1", "d2"], collectionDriverIds: ["d3"] }];
  const s = setup(orderHandler, { sittings, returnPlan: "per_sitting_collection", companyId: "forged-company" }); await s.run();
  expect(rpc).toHaveBeenCalledWith("save_order_sitting_operations", { p_order_id: id, p_company_id: "verified-company", p_operations: sittings, p_return_plan: "per_sitting_collection" });
});
test("driver progress uses the session driver, never a submitted identity", async () => {
  const s = setup(tripHandler, { assignmentId: id, status: "accepted", driverId: "another-driver" }); await s.run();
  expect(rpc).toHaveBeenCalledWith("advance_sitting_driver_trip", { p_assignment_id: id, p_driver_id: "current-driver", p_company_id: "verified-company", p_status: "accepted" });
});
test("a validation failure is returned without false success", async () => { rpc.mockResolvedValue({ error: { code: "22023", message: "This trip has already started." } }); const s = setup(orderHandler, { sittings: [] }); await s.run(); expect(s.res.code).toBe(400); expect(s.res.body).toEqual({ error: "This trip has already started." }); });

test("admin splits and kitchen batches enter the same tenant-scoped transaction", async () => {
  const sittings = [{ id, guest_count: 50, service_time: "12:00", deliveryDriverIds: ["d1"] }, { id: "00000000-0000-0000-0000-000000000002", guest_count: 50, service_time: "18:00", deliveryDriverIds: ["d2"] }];
  const tasks = [{ service_sitting_id:id,menu_item_name:"Brownie" }];
  (kitchenPrepService.planTasksForOrder as jest.Mock).mockResolvedValueOnce(tasks);
  const s=setup(orderHandler,{sittings,returnPlan:"per_sitting_collection"});await s.run();
  expect(rpc).toHaveBeenCalledWith("save_admin_order_service_plan",{p_order_id:id,p_company_id:"verified-company",p_operations:sittings,p_return_plan:"per_sitting_collection",p_kitchen_tasks:tasks});
});
test("a kitchen planning error leaves the saved order untouched", async()=>{
  (kitchenPrepService.planTasksForOrder as jest.Mock).mockRejectedValueOnce(new Error("Kitchen unavailable"));
  const s=setup(orderHandler,{sittings:[{id,guest_count:100,service_time:"12:00"}],returnPlan:"client_return"});await s.run();
  expect(s.res.code).toBe(500);expect(rpc).not.toHaveBeenCalled();
});
test.each([true,false])("a pending schema update preserves existing trip saves, but refuses a new split: %s",async(unchanged)=>{
  const sittings=[{id,guest_count:100,service_time:"12:00"}];
  const query:any={};for(const method of ["select","eq"])query[method]=()=>query;
  query.then=(resolve:any)=>Promise.resolve({data:unchanged?[{id,guest_count:100,service_time:"12:00:00"}]:[],error:null}).then(resolve);
  (servicePlanAccess as jest.Mock).mockResolvedValue({...access,db:{rpc,from:()=>query}});
  rpc.mockResolvedValueOnce({error:{code:"PGRST202"}}).mockResolvedValueOnce({error:null});
  const s=setup(orderHandler,{sittings,returnPlan:"client_return"});await s.run();
  expect(s.res.code).toBe(unchanged?200:503);
  expect(rpc).toHaveBeenCalledTimes(unchanged?2:1);
  if(unchanged)expect(s.res.body.notice).toContain("Trip schedule saved");
});
