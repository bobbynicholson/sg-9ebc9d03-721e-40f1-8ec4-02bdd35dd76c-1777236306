/** @jest-environment node */
import handler from "@/pages/api/staff/[id]/invite-login";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sendStaffInviteEmail } from "@/lib/staffInviteEmail";

jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: jest.fn() }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: jest.fn() }));
jest.mock("@/lib/staffInviteEmail", () => ({ sendStaffInviteEmail: jest.fn() }));
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));

function query(data: unknown = null) {
  const q: any = { then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) };
  for (const method of ["select", "eq", "limit", "update", "insert", "upsert"]) q[method] = jest.fn(() => q);
  q.maybeSingle = jest.fn(async () => ({ data, error: null }));
  return q;
}

describe("staff portal invites", () => {
  let staff: any, profile: any, admin: any, profileQuery: any, inviteQuery: any;
  beforeEach(() => {
    jest.clearAllMocks();
    staff = { id: "staff", company_id: "company", full_name: "Wilma Engelbrecht", email: "wilma@example.com" };
    profile = null;
    profileQuery = query(); inviteQuery = query();
    (createPagesServerClient as jest.Mock).mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
      from: () => query({ role: "admin", company_id: "company" }),
    });
    admin = {
      auth: { admin: {
        listUsers: jest.fn(async () => ({ data: { users: [] } })),
        getUserById: jest.fn(async () => ({ data: { user: { id: "user", email: staff.email } } })),
        generateLink: jest.fn(async () => ({ data: { user: { id: "user" }, properties: { action_link: "https://auth.example/invite" } } })),
      } },
      from: (table: string) => table === "kitchen_staff_members" ? query(staff)
        : table === "profiles" ? Object.assign(profileQuery, { maybeSingle: async () => ({ data: profile, error: null }) })
        : table === "staff_invitations" ? inviteQuery : query(),
    };
    (getServiceSupabase as jest.Mock).mockReturnValue(admin);
    (sendStaffInviteEmail as jest.Mock).mockResolvedValue({ emailed: true });
  });
  async function send(role = "kitchen_manager", origin = "https://portal.example.com") {
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await handler({ method: "POST", headers: { origin }, query: { id: "staff" }, body: { role } } as any, res);
    return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
  }
  it("provisions a visible profile with durable manager access and a pending invitation", async () => {
    expect((await send()).status).toBe(200);
    expect(profileQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({ role: "kitchen_staff", active_role: "kitchen_manager", company_id: "company" }), expect.anything());
    expect(inviteQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user", status: "pending", email: staff.email }));
    expect(admin.auth.admin.generateLink).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ redirectTo: "https://portal.example.com/auth/reset-password?invite=1" }) }));
  });
  it("returns delivery failure with the provisioned profile so the UI can offer retry", async () => {
    (sendStaffInviteEmail as jest.Mock).mockResolvedValue({ emailed: false, errorCode: "resend_other" });
    expect(await send()).toMatchObject({ status: 502, body: { email_sent: false, profile_id: "user" } });
  });
  it("resends linked users without overwriting their current role", async () => {
    staff.linked_profile_id = "user";
    profile = { id: "user", company_id: "company", active_role: "cleaning_manager" };
    expect((await send()).status).toBe(200);
    expect(profileQuery.upsert).not.toHaveBeenCalled();
    expect(admin.auth.admin.generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: "recovery" }));
    expect(sendStaffInviteEmail).toHaveBeenCalledWith(admin, expect.objectContaining({ role: "cleaning_manager" }));
  });
  it("does not move an existing user between tenants", async () => {
    staff.linked_profile_id = "user";
    profile = { company_id: "other-company" };
    expect((await send()).status).toBe(409);
    expect(sendStaffInviteEmail).not.toHaveBeenCalled();
  });
  it("finds orphaned accounts beyond the first auth page", async () => {
    admin.auth.admin.listUsers.mockResolvedValueOnce({ data: { users: Array.from({ length: 1000 }, () => ({ email: "other@example.com" })) } })
      .mockResolvedValueOnce({ data: { users: [{ id: "user", email: staff.email }] } });
    expect((await send()).status).toBe(200);
    expect(admin.auth.admin.listUsers).toHaveBeenLastCalledWith({ page: 2, perPage: 1000 });
  });
  it("rejects roles outside the staff invitation allowlist", async () => {
    expect((await send("super_admin")).status).toBe(400);
  });
});
