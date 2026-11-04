/**
 * @jest-environment node
 */
import type { NextRequest, NextResponse } from "next/server";
import { readVerifiedSession, writeVerifiedSession } from "@/lib/middleware/profileCache";

const COOKIE = "cms.mw.session";

async function issue(userId: string, token: string) {
  let value = "";
  let options: Record<string, unknown> = {};
  const response = {
    cookies: { set: (_name: string, v: string, o: Record<string, unknown>) => { value = v; options = o; } },
  } as unknown as NextResponse;
  await writeVerifiedSession(response, userId, token);
  return { value, options };
}

const requestWith = (value?: string) => ({
  cookies: { get: (name: string) => (name === COOKIE && value ? { value } : undefined) },
}) as unknown as NextRequest;

describe("verified session cookie", () => {
  const originalSecret = process.env.MIDDLEWARE_PROFILE_SECRET;
  beforeEach(() => { process.env.MIDDLEWARE_PROFILE_SECRET = "test-secret"; });
  afterEach(() => {
    jest.useRealTimers();
    process.env.MIDDLEWARE_PROFILE_SECRET = originalSecret;
  });

  it("accepts the exact token the Auth server verified", async () => {
    const { value } = await issue("user-1", "token-a");
    await expect(readVerifiedSession(requestWith(value), "token-a")).resolves.toBe("user-1");
  });

  it("is HttpOnly and lasts 60 seconds", async () => {
    const { options } = await issue("user-1", "token-a");
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", maxAge: 60 });
  });

  it("rejects any other token, including a refreshed one", async () => {
    const { value } = await issue("user-1", "token-a");
    await expect(readVerifiedSession(requestWith(value), "token-b")).resolves.toBeNull();
  });

  it("rejects a tampered cookie", async () => {
    const { value } = await issue("user-1", "token-a");
    const [body, sig] = value.split(".");
    const forged = Buffer.from(JSON.stringify({
      ...JSON.parse(Buffer.from(body, "base64url").toString()), uid: "someone-else",
    })).toString("base64url");
    await expect(readVerifiedSession(requestWith(`${forged}.${sig}`), "token-a")).resolves.toBeNull();
  });

  it("expires after 60 seconds", async () => {
    jest.useFakeTimers({ now: new Date("2026-11-04T10:00:00Z"), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    const { value } = await issue("user-1", "token-a");
    jest.setSystemTime(new Date("2026-11-04T10:00:59Z"));
    await expect(readVerifiedSession(requestWith(value), "token-a")).resolves.toBe("user-1");
    jest.setSystemTime(new Date("2026-11-04T10:01:02Z"));
    await expect(readVerifiedSession(requestWith(value), "token-a")).resolves.toBeNull();
  });

  it("falls back to the Auth server when there is no cookie or no secret", async () => {
    await expect(readVerifiedSession(requestWith(), "token-a")).resolves.toBeNull();
    const { value } = await issue("user-1", "token-a");
    delete process.env.MIDDLEWARE_PROFILE_SECRET;
    await expect(readVerifiedSession(requestWith(value), "token-a")).resolves.toBeNull();
  });
});
