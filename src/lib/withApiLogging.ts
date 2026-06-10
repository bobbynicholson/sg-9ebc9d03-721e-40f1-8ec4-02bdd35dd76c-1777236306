/**
 * withApiLogging — higher-order function wrapper for Next.js API routes.
 *
 * Usage (wrap the default export):
 *
 *   export default withApiLogging(handler);
 *   // or with an explicit area:
 *   export default withApiLogging(handler, "sales");
 *
 * What it logs:
 *   → incoming request  (method, URL, query, tenant, body summary)
 *   ← outgoing response (status code, duration ms)
 *   ✗ uncaught errors   (message + top stack frames)
 *
 * Area auto-detection falls back to URL-based matching when no override
 * is supplied.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { log, type LogArea } from "@/lib/logger";

type ApiHandler = (
  req: NextApiRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: NextApiResponse<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<void | NextApiResponse<any>> | void;

const SENSITIVE_KEYS = new Set([
  "password", "token", "secret", "key", "passphrase",
  "access_token", "refresh_token", "api_key", "apiKey",
]);

function sanitise(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const copy: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const k of Object.keys(copy)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) copy[k] = "[REDACTED]";
  }
  return copy;
}

function areaFromUrl(url: string): LogArea {
  if (/\/api\/cron\//.test(url)) return "cron";
  if (/\/api\/auth\//.test(url)) return "auth";
  if (/\/api\/admin\/platform/.test(url)) return "owner";
  if (/\/api\/admin\//.test(url)) return "owner";
  if (/\/api\/quotes\/|\/api\/leads\//.test(url)) return "sales";
  if (/\/api\/orders\//.test(url)) return "sales";
  if (/\/api\/kitchen\//.test(url)) return "kitchen";
  if (/\/api\/shopping\//.test(url)) return "shopper";
  if (/\/api\/driver\//.test(url)) return "driver";
  if (/\/api\/cleaning\//.test(url)) return "cleaning";
  if (/\/api\/client-tokens\/|\/api\/public\//.test(url)) return "client";
  if (/\/api\/webhooks\/|\/api\/payments\//.test(url)) return "payment";
  if (/\/api\/accounting\//.test(url)) return "accounting";
  if (/\/api\/emails\/|\/api\/send-email/.test(url)) return "email";
  return "api";
}

export function withApiLogging(handler: ApiHandler, areaOverride?: LogArea): ApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const start = Date.now();
    const area: LogArea = areaOverride ?? areaFromUrl(req.url ?? "");
    const method = req.method ?? "?";
    const url = req.url ?? "?";
    const tenant = (req.query.company_slug as string) ?? "-";
    const userId =
      (req as { user?: { id?: string } }).user?.id ??
      (req.headers["x-user-id"] as string) ??
      "anon";

    // Log the incoming request
    const inCtx: Record<string, unknown> = { tenant, user: userId };
    if (req.query && Object.keys(req.query).length > 0) inCtx.query = req.query;
    if ((method === "POST" || method === "PUT" || method === "PATCH") && req.body) {
      inCtx.body = sanitise(req.body);
    }
    log(area, "INFO", `→ ${method} ${url}`, inCtx);

    // Intercept res.json to capture response status + body on errors
    const origJson = res.json.bind(res);
    res.json = function (data: unknown) {
      const dur = Date.now() - start;
      const level =
        res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
      const ctx: Record<string, unknown> = { status: res.statusCode, ms: dur };
      if (res.statusCode >= 400) ctx.response = data;
      log(area, level, `← ${method} ${url}`, ctx);
      return origJson(data);
    };

    // Intercept res.end for non-JSON responses
    const origEnd = res.end.bind(res);
    let endLogged = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.end = function (...args: any[]) {
      if (!endLogged) {
        endLogged = true;
        const dur = Date.now() - start;
        const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
        log(area, level, `← ${method} ${url}`, { status: res.statusCode, ms: dur });
      }
      return origEnd(...args);
    };

    try {
      await handler(req, res);
    } catch (err: unknown) {
      const dur = Date.now() - start;
      log("errors", "ERROR", `✗ ${method} ${url} threw after ${dur}ms`, {
        tenant,
        user: userId,
        error: err instanceof Error ? err.message : String(err),
        stack:
          err instanceof Error
            ? err.stack?.split("\n").slice(0, 6).join(" | ")
            : undefined,
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };
}
