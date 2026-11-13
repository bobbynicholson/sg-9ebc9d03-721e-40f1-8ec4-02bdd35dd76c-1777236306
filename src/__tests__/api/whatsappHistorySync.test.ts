/**
 * @jest-environment node
 */
import type { NextApiRequest, NextApiResponse } from "next";
import handler from "@/pages/api/admin/whatsapp/history-sync";

const mockCallMeta = jest.fn();
const mockLoadCredentials = jest.fn();
let mockIntegration: any;

jest.mock("@/lib/whatsapp/adminAccess", () => ({
  companyForAdmin: async (_req: unknown, _res: unknown) => ({ companyId: "company-1", userId: "admin-1" }),
}));
jest.mock("@/lib/whatsapp/credentials", () => ({
  callMeta: (...args: unknown[]) => mockCallMeta(...args),
  loadWhatsAppCredentials: (...args: unknown[]) => mockLoadCredentials(...args),
}));
jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({
    from: (table: string) => {
      let mode = "select";
      let patch: any = null;
      const chain: any = {
        select: () => {
          if (mode === "update") {
            mockIntegration.settings = patch.settings;
            return Promise.resolve({ data: [{ id: mockIntegration.id }], error: null });
          }
          return chain;
        },
        eq: () => chain,
        is: () => chain,
        update: (next: unknown) => { mode = "update"; patch = next; return chain; },
        maybeSingle: async () => ({ data: table === "integrations" ? mockIntegration : null, error: null }),
        then: (resolve: any) => {
          if (mode === "update") mockIntegration.settings = patch.settings;
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return chain;
    },
  }),
}));

function request(method = "POST") {
  return { method, query: {}, body: {}, headers: { host: "test.local" } } as unknown as NextApiRequest;
}

function response() {
  return {
    statusCode: 0,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  } as unknown as NextApiResponse & { statusCode: number; body: any };
}

describe("WhatsApp Business app history sync", () => {
  beforeEach(() => {
    mockIntegration = {
      id: "integration-1",
      company_id: "company-1",
      is_active: true,
      credentials: { phoneNumberId: "111" },
      settings: { webhookVerifiedAt: "2026-11-13T00:00:00Z" },
    };
    mockLoadCredentials.mockResolvedValue({ phoneNumberId: "111", businessAccountId: "222", accessTokenEncrypted: "ciphertext" });
    mockCallMeta.mockReset();
    mockCallMeta
      .mockResolvedValueOnce({ ok: true, json: { is_on_biz_app: true, platform_type: "CLOUD_API" }, error: null, httpStatus: 200 })
      .mockResolvedValueOnce({ ok: true, json: { request_id: "meta-history-1" }, error: null, httpStatus: 200 });
  });

  it("checks coexistence and starts Meta history sync once", async () => {
    const res = response();
    await handler(request() as any, res);

    expect(res.statusCode).toBe(200);
    expect(mockCallMeta).toHaveBeenCalledTimes(2);
    expect(mockCallMeta.mock.calls[1][1]).toBe("111/smb_app_data");
    expect(mockCallMeta.mock.calls[1][2]).toMatchObject({
      method: "POST",
      body: { messaging_product: "whatsapp", sync_type: "history" },
    });
    expect(mockIntegration.settings).toMatchObject({
      whatsappBusinessAppHistoryStatus: "requested",
      whatsappBusinessAppHistoryRequestId: "meta-history-1",
      whatsappBusinessAppHistoryProgress: 0,
    });
  });

  it("does not request history when Meta says this is not a coexistence number", async () => {
    mockCallMeta.mockReset().mockResolvedValueOnce({ ok: true, json: { is_on_biz_app: false, platform_type: "CLOUD_API" }, error: null, httpStatus: 200 });
    const res = response();
    await handler(request() as any, res);

    expect(res.statusCode).toBe(409);
    expect(mockCallMeta).toHaveBeenCalledTimes(1);
    expect(mockIntegration.settings.whatsappBusinessAppHistoryStatus).toBeUndefined();
  });

  it("prevents repeating a one-time request already accepted by Meta", async () => {
    mockIntegration.settings.whatsappBusinessAppHistoryStatus = "requested";
    mockIntegration.settings.whatsappBusinessAppHistoryRequestedAt = "2026-11-13T00:00:00Z";
    const res = response();
    await handler(request() as any, res);

    expect(res.statusCode).toBe(409);
    expect(mockCallMeta).not.toHaveBeenCalled();
  });

  it("never starts the one-time Meta request from a local development server", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    Reflect.set(process.env, "NODE_ENV", "development");
    try {
      const res = response();
      const req = { ...request(), headers: { host: "localhost:3000" } } as any;
      await handler(req, res);
      expect(res.statusCode).toBe(409);
      expect(mockCallMeta).not.toHaveBeenCalled();
    } finally {
      Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
    }
  });
});
