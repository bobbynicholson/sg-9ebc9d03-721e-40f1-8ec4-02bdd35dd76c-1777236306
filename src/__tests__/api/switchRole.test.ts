/**
 * @jest-environment node
 */
import handler from "@/pages/api/auth/switch-role";

const mockUser = { id: "user-1" };
let mockProfile: Record<string, unknown>;
let mockDepartments: Array<{ department: string }>;
const mockUpdate = jest.fn();
const mockAudit = jest.fn();

jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({
    auth: { getUser: jest.fn() },
    from: (table: string) => {
      if (table === "user_access_audit") return { insert: async (row: unknown) => { mockAudit(row); return { error: null }; } };
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: mockProfile, error: null }),
        update: (row: unknown) => { mockUpdate(row); return { eq: async () => ({ error: null }) }; },
        then: (resolve: any) => Promise.resolve({ data: mockDepartments, error: null }).then(resolve),
      };
      return query;
    },
  }),
}));
jest.mock("@/lib/supabase/server", () => ({
  createPagesServerClient: () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
}));

async function chooseRole(role: string) {
  const headers: Record<string, unknown> = {};
  const res: any = {
    statusCode: 0,
    body: null,
    getHeader: (name: string) => headers[name],
    setHeader: (name: string, value: unknown) => { headers[name] = value; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    end() { return this; },
    on() { return this; },
    once() { return this; },
  };
  await handler({ method: "POST", headers: {}, cookies: {}, query: {}, url: "/api/auth/switch-role", body: { role } } as any, res);
  return { res, headers };
}

describe("choosing a portal role", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile = { id: "user-1", role: "company_admin", active_role: "company_admin", company_id: "c1", is_active: true, deleted_at: null };
    mockDepartments = [{ department: "driver" }];
  });

  it("skips the save, audit and cache reset when the role is already active", async () => {
    const { res, headers } = await chooseRole("company_admin");
    expect(res.statusCode).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
    expect(headers["Set-Cookie"]).toBeUndefined();
  });

  it("saves, audits and resets the cache when the role really changes", async () => {
    const { res, headers } = await chooseRole("driver");
    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ active_role: "driver" });
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(String(headers["Set-Cookie"])).toContain("cms.mw.profile=;");
  });

  it("still refuses a role the account doesn't have", async () => {
    const { res } = await chooseRole("kitchen_manager");
    expect(res.statusCode).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("still refuses a deactivated account, even for its current role", async () => {
    mockProfile.is_active = false;
    const { res } = await chooseRole("company_admin");
    expect(res.statusCode).toBe(403);
  });
});
