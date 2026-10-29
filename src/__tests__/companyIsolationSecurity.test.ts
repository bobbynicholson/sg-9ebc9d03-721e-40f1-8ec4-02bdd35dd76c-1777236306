/** @jest-environment node */
import fileHandler from "@/pages/api/company-files";
import { companyFileUrl, protectedCompanyFileUrl } from "@/lib/companyFiles";
import { deriveUserRoles, effectiveProfileRole, canAssignTenantPrivileges } from "@/lib/roleDerivation";
import { blockUnlessPlatformAdmin, isPlatformOnlyRequest } from "@/lib/platformApiGate";
import { validateCompanyMutation, withCompanyFilter } from "@/lib/companyIsolation";
import { createPagesServerClient } from "@/lib/supabase/server";
import { supabase } from "@/integrations/supabase/client";
import provisionHandler from "@/pages/api/auth/provision-company";
import { getServiceSupabase } from "@/lib/supabase/service";
import { companyProvisionProofMatches } from "@/lib/companyProvisionProof";
import { createHash } from "node:crypto";
import welcomeHandler from "@/pages/api/emails/owner-welcome";
import { sendBrandedEmail } from "@/server/emails/sendBrandedEmail";
import { isLocalAuthBypassEnabled } from "@/lib/localAuthBypass";
import localOrdersHandler from "@/pages/api/admin/orders";
import localProfitHandler from "@/pages/api/admin/event-profitability";

jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: jest.fn() }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: jest.fn() }));
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (handler: unknown) => handler }));
jest.mock("@/server/emails/sendBrandedEmail", () => ({ sendBrandedEmail: jest.fn(async () => ({ ok: true })) }));
jest.mock("@/services/email/templateResolver", () => ({ resolveEmailTemplate: jest.fn(async () => ({ source: "fallback" })) }));
jest.mock("@/services/emailService", () => ({ emailService: { sendEmail: jest.fn() } }));
jest.mock("@/emails/OwnerWelcomeEmail", () => ({ __esModule: true, default: () => null }));
jest.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: jest.fn() }, from: jest.fn() } }));
const a = "00000000-0000-0000-0000-000000000001";
const b = "00000000-0000-0000-0000-000000000002";
const orderId = "00000000-0000-0000-0000-000000000030";
function response() {
  const res = { statusCode: 200, status: jest.fn(), json: jest.fn(), setHeader: jest.fn(), end: jest.fn(), send: jest.fn() };
  res.status.mockImplementation(code => { res.statusCode = code; return res; });
  res.json.mockReturnValue(res); res.end.mockReturnValue(res); res.send.mockReturnValue(res);
  return res;
}
function database({ user = { id: "me" }, profile = { company_id: a, role: "company_admin", is_active: true, deleted_at: null }, order = null }: any = {}) {
  const download = jest.fn(async () => ({ data: new Blob(["private receipt"], { type: "image/jpeg" }), error: null }));
  const from = jest.fn(table => {
    const data = table === "profiles" ? profile : order;
    const filters: Record<string, unknown> = {};
    const q: any = { select: () => q, eq: (key: string, val: unknown) => { filters[key] = val; return q; },
      maybeSingle: async () => ({ data: data && Object.entries(filters).every(([key,val]) => key === "id" ? true : data[key] === val) ? data : null, error: null }) };
    return q;
  });
  const db = { auth: { getUser: jest.fn(async () => ({ data: { user }, error: null })) }, from, storage: { from: jest.fn(() => ({ download })) } };
  (createPagesServerClient as jest.Mock).mockReturnValue(db);
  return { db, download };
}
async function file(query: Record<string, unknown>, config?: any, method = "GET") {
  const mocks = database(config); const res = response();
  await fileHandler({ method, query } as any, res as any);
  return { ...mocks, res };
}
beforeEach(() => { jest.clearAllMocks(); });

test("private file download needs an authenticated account", async () => {
  const { res, download } = await file({ bucket: "imports", path: `${a}/receipt.jpg` }, { user: null });
  expect(res.statusCode).toBe(401); expect(download).not.toHaveBeenCalled();
});
test("another company's path is blocked before storage, even when storage has a broad read policy", async () => {
  const { res, download } = await file({ bucket: "imports", path: `${b}/receipt.jpg` });
  expect(res.statusCode).toBe(404); expect(download).not.toHaveBeenCalled();
});
test("own company's receipt downloads with private cache headers and caller RLS", async () => {
  const { res, download } = await file({ bucket: "imports", path: `${a}/receipt.jpg` });
  expect(res.statusCode).toBe(200); expect(download).toHaveBeenCalledWith(`${a}/receipt.jpg`);
  expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store, max-age=0");
  expect(Buffer.isBuffer(res.send.mock.calls[0][0])).toBe(true);
});
test("POD file access is bound to an order in the current company", async () => {
  const forbidden = await file({ bucket: "pod", path: `orders/${orderId}/photo.jpg` }, { order: { id: orderId, company_id: b } });
  expect(forbidden.res.statusCode).toBe(404); expect(forbidden.download).not.toHaveBeenCalled();
  const allowed = await file({ bucket: "pod", path: `orders/${orderId}/photo.jpg` }, { order: { id: orderId, company_id: a } });
  expect(allowed.res.statusCode).toBe(200);
});
test.each(["../secret", `${a}/../secret`, `${a}\\secret`, `${a}//secret`, "/secret"])("malformed storage path is rejected: %s", async path => {
  const { res, download } = await file({ bucket: "imports", path });
  expect(res.statusCode).toBe(400); expect(download).not.toHaveBeenCalled();
});
test("unknown buckets, array parameters and write methods are refused", async () => {
  expect((await file({ bucket: "avatars", path: `${a}/avatar.png` })).res.statusCode).toBe(400);
  expect((await file({ bucket: ["imports"], path: `${a}/receipt.jpg` })).res.statusCode).toBe(400);
  expect((await file({ bucket: "imports", path: `${a}/receipt.jpg` }, undefined, "POST")).res.statusCode).toBe(405);
});
test.each([{ is_active: false }, { deleted_at: "2026-01-01" }])("inactive/deleted accounts cannot load files", async fields => {
  const { res, download } = await file({ bucket: "imports", path: `${a}/receipt.jpg` }, { profile: { role: "company_admin", company_id: a, ...fields } });
  expect(res.statusCode).toBe(403); expect(download).not.toHaveBeenCalled();
});
test("an active platform preference does not bypass the file's company check", async () => {
  const { res } = await file({ bucket: "imports", path: `${b}/receipt.jpg` }, { profile: { role: "company_admin", active_role: "super_admin", company_id: a } });
  expect(res.statusCode).toBe(404);
});
test("legacy public and long lived signed URLs are upgraded to authenticated links", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://company-files.example.test";
  for (const mode of ["public", "sign", "authenticated"]) {
    expect(protectedCompanyFileUrl(`https://company-files.example.test/storage/v1/object/${mode}/imports/${a}/old%20receipt.jpg?token=old`))
      .toBe(companyFileUrl("imports", `${a}/old receipt.jpg`));
  }
  expect(protectedCompanyFileUrl("https://elsewhere.example/logo.png")).toBe("https://elsewhere.example/logo.png");
});
test("active_role and untrusted platform department do not grant platform permissions", () => {
  const roles = deriveUserRoles({ profileRole: "driver", activeRole: "super_admin", departments: [{ department: "super_admin" }] });
  expect(roles.roles).toEqual(["driver"]); expect(roles.activeRole).toBe("driver");
});
test("an active manager preference cannot upgrade an ordinary kitchen assignment", () => {
  const roles = deriveUserRoles({ profileRole: "driver", activeRole: "kitchen_manager", departments: [{ department: "kitchen" }] });
  expect(roles.roles).toEqual(["driver", "kitchen_staff"]); expect(roles.activeRole).toBe("kitchen_staff");
});
test("assigned operational roles can still be selected", () => {
  const roles = deriveUserRoles({ profileRole: "driver", activeRole: "waiter", departments: [{ department: "waiter" }] });
  expect(roles.roles).toEqual(["driver", "waiter"]); expect(roles.activeRole).toBe("waiter");
});
test("API role preferences cannot borrow platform authority or grant privileged tenant roles", () => {
  expect(effectiveProfileRole({ role: "admin", active_role: "super_admin" })).toBe("admin");
  expect(effectiveProfileRole({ role: "super_admin", active_role: "driver" })).toBe("super_admin");
  expect(canAssignTenantPrivileges("admin", ["company_admin"])).toBe(false);
  expect(canAssignTenantPrivileges("admin", ["driver"], "owner")).toBe(false);
  expect(canAssignTenantPrivileges("company_admin", ["super_admin"])).toBe(false);
  expect(canAssignTenantPrivileges("company_admin", ["owner"])).toBe(true);
  expect(canAssignTenantPrivileges("admin", ["driver"])).toBe(true);
});
test("company mutation validation cannot borrow a different user's identity", async () => {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: "me" } } });
  expect(await validateCompanyMutation("platform-user", b)).toBe(false);
  expect(supabase.from).not.toHaveBeenCalled();
  expect(() => withCompanyFilter({}, "")).toThrow("Company context");
});
test("platform API guard rejects a tenant with a forged active platform role", async () => {
  database({ profile: { role: "company_admin", active_role: "super_admin", is_active: true } });
  const res = response();
  expect(await blockUnlessPlatformAdmin({} as any, res as any)).toBe(true); expect(res.statusCode).toBe(403);
});
test("public pricing remains public, while platform and CMS endpoints require platform authority", () => {
  expect(isPlatformOnlyRequest("GET", "/api/platform/pricing-plans")).toBe(false);
  expect(isPlatformOnlyRequest("PUT", "/api/platform/pricing-plans")).toBe(true);
  expect(isPlatformOnlyRequest("GET", "/api/admin/platform-delete-user")).toBe(true);
  expect(isPlatformOnlyRequest("GET", "/api/admin/users-activity")).toBe(true);
  expect(isPlatformOnlyRequest("POST", "/api/cms/upload-image")).toBe(true);
});

const provisionToken = "ab".repeat(32);
const provisionUser = { id: a, email: "owner@example.test", created_at: new Date().toISOString(), user_metadata: {
  company_provision_token_hash: createHash("sha256").update(provisionToken).digest("hex"),
  owner_welcome_token_hash: createHash("sha256").update(provisionToken).digest("hex"),
} };
function provisioning({ caller = null, profileCompany = null, existingCompany = null }: any = {}) {
  database({ user: caller });
  const inserts: any[] = [];
  const from = jest.fn(table => {
    let inserting = false, updating = false;
    const q: any = { select: () => q, eq: () => q, is: () => q,
      insert: (row: unknown) => { inserting = true; inserts.push({ table, row }); return q; },
      update: () => { updating = true; return q; },
      single: async () => ({ data: table === "companies" && inserting ? { id: b, owner_id: a } : null, error: null }),
      maybeSingle: async () => ({ data: table === "profiles"
        ? updating ? { id: a } : { id: a, company_id: profileCompany, is_active: true, email: provisionUser.email }
        : existingCompany, error: null }),
    };
    return q;
  });
  const updateUserById = jest.fn(async () => ({ data: { user: provisionUser }, error: null }));
  (getServiceSupabase as jest.Mock).mockReturnValue({ from, auth: {
    getUser: jest.fn(async () => ({ data: { user: caller } })),
    admin: { getUserById: jest.fn(async () => ({ data: { user: provisionUser }, error: null })), updateUserById },
  } });
  return { from, inserts, updateUserById };
}
async function provision(config: any = {}, extraBody: any = {}) {
  const mocks = provisioning(config), res = response();
  await provisionHandler({ method: "POST", headers: {}, body: {
    userId: a, email: provisionUser.email, companyName: "New company", ownerName: "Owner", ...extraBody,
  } } as any, res as any);
  return { ...mocks, res };
}
test("knowing an owner's user ID and email does not disclose their company", async () => {
  const { res, from } = await provision({ profileCompany: b, existingCompany: { id: b, private: "secret" } });
  expect(res.statusCode).toBe(401); expect(from).not.toHaveBeenCalledWith("companies");
});
test("a signup capability cannot be replayed once any company membership exists", async () => {
  const { res, inserts } = await provision({ profileCompany: b }, { provisionToken });
  expect(res.statusCode).toBe(401); expect(inserts).toHaveLength(0);
});
test("a signed-in user cannot provision or read another user's company", async () => {
  const { res, inserts } = await provision({ caller: { id: b } }, { provisionToken });
  expect(res.statusCode).toBe(403); expect(inserts).toHaveLength(0);
});
test("authenticated staff cannot move themselves into a new company", async () => {
  const { res, inserts } = await provision({ caller: { id: a }, profileCompany: b });
  expect(res.statusCode).toBe(409); expect(inserts).toHaveLength(0);
});
test("fresh signup proof preserves company signup without an email-confirmed session", async () => {
  const { res, inserts, updateUserById } = await provision({}, { provisionToken });
  expect(res.statusCode).toBe(201);
  expect(inserts.find(row => row.table === "companies").row.owner_id).toBe(a);
  expect(updateUserById).toHaveBeenCalledWith(a, { user_metadata: expect.objectContaining({ company_provision_token_hash: null }) });
});
test("signup proof rejects expired, malformed and incorrect secrets", () => {
  const now = Date.now();
  expect(companyProvisionProofMatches(provisionUser, provisionToken, now)).toBe(true);
  expect(companyProvisionProofMatches(provisionUser, "cd".repeat(32), now)).toBe(false);
  expect(companyProvisionProofMatches(provisionUser, "short", now)).toBe(false);
  expect(companyProvisionProofMatches({ ...provisionUser, created_at: new Date(now - 31 * 60_000).toISOString() }, provisionToken, now)).toBe(false);
  expect(companyProvisionProofMatches({ ...provisionUser, created_at: "invalid" }, provisionToken, now)).toBe(false);
});
test("a known user/company pair cannot trigger a welcome email", async () => {
  provisioning({ profileCompany: b, existingCompany: { id: b, owner_id: a } });
  const res = response();
  await welcomeHandler({ method: "POST", headers: {}, body: { userId: a, companyId: b, email: provisionUser.email, companyName: "Company", ownerName: "Owner" } } as any, res as any);
  expect(res.statusCode).toBe(401); expect(sendBrandedEmail).not.toHaveBeenCalled();
});
test("fresh signup welcome proof is bound to the company's actual owner and consumed after sending", async () => {
  const mocks = provisioning({ profileCompany: b, existingCompany: { id: b, owner_id: a } });
  const res = response();
  await welcomeHandler({ method: "POST", headers: {}, body: { userId: a, companyId: b, email: provisionUser.email, companyName: "Company", ownerName: "Owner", provisionToken } } as any, res as any);
  expect(res.statusCode).toBe(200); expect(sendBrandedEmail).toHaveBeenCalledTimes(1);
  expect(mocks.updateUserById).toHaveBeenCalledWith(a, { user_metadata: expect.objectContaining({ owner_welcome_token_hash: null }) });
});
test("localhost and query flags cannot enable an authentication bypass by default", () => {
  const oldEnv = process.env.NODE_ENV, oldFlag = process.env.NEXT_PUBLIC_ALLOW_LOCAL_AUTH_BYPASS;
  try {
    Object.assign(process.env, { NODE_ENV: "development" });
    delete process.env.NEXT_PUBLIC_ALLOW_LOCAL_AUTH_BYPASS;
    expect(isLocalAuthBypassEnabled("localhost")).toBe(false);
    expect(isLocalAuthBypassEnabled("127.0.0.1")).toBe(false);
    process.env.NEXT_PUBLIC_ALLOW_LOCAL_AUTH_BYPASS = "true";
    expect(isLocalAuthBypassEnabled("localhost")).toBe(true);
    expect(isLocalAuthBypassEnabled("staging.example.test")).toBe(false);
    Object.assign(process.env, { NODE_ENV: "production" });
    expect(isLocalAuthBypassEnabled("localhost")).toBe(false);
  } finally {
    Object.assign(process.env, { NODE_ENV: oldEnv });
    if (oldFlag === undefined) delete process.env.NEXT_PUBLIC_ALLOW_LOCAL_AUTH_BYPASS;
    else process.env.NEXT_PUBLIC_ALLOW_LOCAL_AUTH_BYPASS = oldFlag;
  }
});
test("local service-backed diagnostic routes are unavailable without explicit fixture opt-in", async () => {
  const prior = process.env.NEXT_PUBLIC_ALLOW_LOCAL_AUTH_BYPASS;
  delete process.env.NEXT_PUBLIC_ALLOW_LOCAL_AUTH_BYPASS;
  try {
    for (const handler of [localOrdersHandler, localProfitHandler]) {
      const res = response();
      await handler({ method: "GET", headers: { host: "localhost:3114" }, query: { company_id: b } } as any, res as any);
      expect(res.statusCode).toBe(404);
    }
    expect(getServiceSupabase).not.toHaveBeenCalled();
  } finally {
    if (prior !== undefined) process.env.NEXT_PUBLIC_ALLOW_LOCAL_AUTH_BYPASS = prior;
  }
});
