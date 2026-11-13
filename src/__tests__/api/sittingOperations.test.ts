/** @jest-environment node */
import quoteHandler from "@/pages/api/admin/quotes/[id]/service-plan";
import orderHandler from "@/pages/api/orders/[id]/service-plan";
import tripHandler from "@/pages/api/driver/sitting-trip";
import { servicePlanAccess } from "@/lib/servicePlanAccess";
import { kitchenPrepService } from "@/services/kitchenPrepService";
import { notificationService } from "@/services/notificationService";
jest.mock("@/services/kitchenPrepService", () => ({ kitchenPrepService: { planTasksForOrder: jest.fn(async () => []) } }));
jest.mock("@/services/notificationService", () => ({ notificationService: { createNotification: jest.fn(async () => null) } }));
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
  expect(rpc).toHaveBeenCalledWith("save_admin_quote_service_plan_with_venues", { p_quote_id: id, p_company_id: "verified-company", p_plan: plan, p_patch: { guest_count: 100 }, p_request_id: id }); expect(s.res.code).toBe(200);
});
test("operations writes retain separate driver selections and return plan", async () => {
  const sittings = [{ id, deliveryDriverIds: ["d1", "d2"], collectionDriverIds: ["d3"] }];
  const s = setup(orderHandler, { sittings, returnPlan: "per_sitting_collection", companyId: "forged-company" }); await s.run();
  expect(rpc).toHaveBeenCalledWith("save_order_sitting_operations_with_venues", { p_order_id: id, p_company_id: "verified-company", p_operations: sittings, p_return_plan: "per_sitting_collection" });
});
test("driver overlap returns a confirmation question without treating it as a failed save", async () => {
  rpc.mockResolvedValueOnce({ error: { code: "22023", message: "DISPATCH_OVERLAP_CONFIRMATION_REQUIRED: Simon already has another trip within 45 minutes." } });
  const s = setup(orderHandler, { sittings: [{ id, deliveryDriverIds: ["d1"], allowDriverOverlap: true }], returnPlan: "client_return" });
  await s.run();
  expect(rpc).toHaveBeenCalledWith("save_order_sitting_operations_with_venues", {
    p_order_id: id, p_company_id: "verified-company",
    p_operations: [{ id, deliveryDriverIds: ["d1"], collectionDriverIds: [] }],
    p_return_plan: "client_return",
  });
  expect(s.res.code).toBe(409);
  expect(s.res.body).toEqual({ confirmationRequired: true, message: "Simon already has another trip within 45 minutes." });
});
test("an explicit admin confirmation retries with a trusted shared-run override", async () => {
  const s = setup(orderHandler, { sittings: [{ id, deliveryDriverIds: ["d1"], allowDriverOverlap: false }], returnPlan: "client_return", confirmDriverOverlap: true });
  await s.run();
  expect(rpc).toHaveBeenCalledWith("save_order_sitting_operations_with_venues", {
    p_order_id: id, p_company_id: "verified-company",
    p_operations: [{ id, allowDriverOverlap: true, deliveryDriverIds: ["d1"], collectionDriverIds: [] }],
    p_return_plan: "client_return",
  });
  expect(s.res.code).toBe(200);
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
  expect(rpc).toHaveBeenCalledWith("save_admin_order_service_plan_with_venues",{p_order_id:id,p_company_id:"verified-company",p_operations:sittings.map(row=>({...row,collectionDriverIds:row.deliveryDriverIds})),p_return_plan:"per_sitting_collection",p_kitchen_tasks:tasks,p_confirm_active_work:false});
});
test("started kitchen work asks for admin confirmation before changing the plan", async()=>{
  rpc.mockResolvedValueOnce({error:{code:"22023",message:"ACTIVE_ORDER_WORK_CONFIRMATION_REQUIRED:Kitchen work has started."}});
  const sittings=[{id,guest_count:60,service_time:"12:00"},{id:"00000000-0000-0000-0000-000000000002",guest_count:40,service_time:"18:00"}];
  const s=setup(orderHandler,{sittings,returnPlan:"client_return"});await s.run();
  expect(s.res.code).toBe(409);
  expect(s.res.body).toEqual({confirmationRequired:true,confirmationType:"activeWork",message:"Kitchen work has started."});
  expect(rpc).toHaveBeenCalledWith("save_admin_order_service_plan_with_venues",expect.objectContaining({p_confirm_active_work:false}));
});
test("confirmed admin plan updates pass the trusted active-work confirmation", async()=>{
  const sittings=[{id,guest_count:60,service_time:"12:00"},{id:"00000000-0000-0000-0000-000000000002",guest_count:40,service_time:"18:00"}];
  const s=setup(orderHandler,{sittings,returnPlan:"client_return",confirmActiveWork:true});await s.run();
  expect(s.res.code).toBe(200);
  expect(rpc).toHaveBeenCalledWith("save_admin_order_service_plan_with_venues",expect.objectContaining({p_confirm_active_work:true}));
});
test("driver reassignment and destination changes notify the old and new drivers", async()=>{
  const sitting={id,sequence_number:1,guest_count:100,service_time:"12:00:00",venue_name:null,venue_address:null,venue_lat:null,venue_lng:null,dispatch_time:"11:00:00",return_date:null,return_time:null};
  let snapshot:any={
    driver_assignments:[{service_sitting_id:id,driver_id:"old-driver",assignment_type:"delivery",status:"assigned",scheduled_for:"2026-11-13T09:00:00Z"}],
    service_sittings:[sitting],
  };
  const db:any={rpc,from:(table:string)=>{
    const query:any={select:()=>query,eq:()=>query};
    query.then=(resolve:any,reject:any)=>Promise.resolve({data:snapshot[table]||[],error:null}).then(resolve,reject);
    return query;
  }};
  (servicePlanAccess as jest.Mock).mockResolvedValue({...access,db});
  rpc.mockImplementationOnce(async()=>{
    snapshot={
      driver_assignments:[
        {...snapshot.driver_assignments[0],status:"cancelled"},
        {service_sitting_id:id,driver_id:"new-driver",assignment_type:"delivery",status:"assigned",scheduled_for:"2026-11-13T09:00:00Z"},
      ],
      service_sittings:[{...sitting,venue_address:"Updated venue"}],
    };
    return {error:null};
  });
  const s=setup(orderHandler,{sittings:[{...sitting,guest_count:100,service_time:"12:00",venue_address:"Updated venue",deliveryDriverIds:["new-driver"]}],returnPlan:"client_return"});
  await s.run();
  expect(s.res.code).toBe(200);
  expect(notificationService.createNotification).toHaveBeenCalledTimes(2);
  expect((notificationService.createNotification as jest.Mock).mock.calls.map(call=>call[0].recipient_id).sort()).toEqual(["new-driver","old-driver"]);
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
