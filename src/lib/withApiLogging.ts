/**
 * withApiLogging - higher-order function wrapper for Next.js API routes.
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
import { blockIfCompanyUnpaid, isSubscriptionGatedRequest } from "@/lib/subscriptionApiGate";
import { blockUnlessPlatformAdmin, isPlatformOnlyRequest } from "@/lib/platformApiGate";
import { redactLogUrl, redactLogValue } from "@/lib/logRedaction";

type ApiHandler = (
  req: NextApiRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: NextApiResponse<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<void | NextApiResponse<any>> | void;

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
    // Authenticated responses must not be reused by a shared/CDN cache.
    // Intentionally public handlers may set their own cache policy.
    res.setHeader("Cache-Control", "private, no-store");
    const start = Date.now();
    const area: LogArea = areaOverride ?? areaFromUrl(req.url ?? "");
    const method = req.method ?? "?";
    const url = req.url ?? "?";
    // Keep the original URL for authorization and handler behavior.
    const logUrl = redactLogUrl(url);
    const tenant = (req.query.company_slug as string) ?? "-";
    const userId =
      (req as { user?: { id?: string } }).user?.id ??
      (req.headers["x-user-id"] as string) ??
      "anon";

    // Log the incoming request
    const inCtx: Record<string, unknown> = { tenant, user: userId };
    if (req.query && Object.keys(req.query).length > 0) inCtx.query = redactLogValue(req.query);
    if ((method === "POST" || method === "PUT" || method === "PATCH") && req.body) {
      inCtx.body = redactLogValue(req.body);
    }
    log(area, "INFO", `→ ${method} ${logUrl}`, inCtx);

    // Intercept res.json to capture response status + body on errors
    const origJson = res.json.bind(res);
    res.json = function (data: unknown) {
      const dur = Date.now() - start;
      const level =
        res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
      const ctx: Record<string, unknown> = { status: res.statusCode, ms: dur };
      if (res.statusCode >= 400) ctx.response = redactLogValue(data);
      log(area, level, `← ${method} ${logUrl}`, ctx);
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
        log(area, level, `← ${method} ${logUrl}`, { status: res.statusCode, ms: dur });
      }
      return origEnd(...args);
    };

    try {
      if (isPlatformOnlyRequest(method, url) && await blockUnlessPlatformAdmin(req, res)) return;
      // Unpaid (expired / suspended / cancelled) companies cannot save changes.
      if (isSubscriptionGatedRequest(method, url) && await blockIfCompanyUnpaid(req, res)) return;
      await handler(req, res);
    } catch (err: unknown) {
      const dur = Date.now() - start;
      log("errors", "ERROR", `✗ ${method} ${logUrl} threw after ${dur}ms`, {
        tenant,
        user: userId,
        error: err instanceof Error ? err.message : String(err),
        stack:
          err instanceof Error
            ? err.stack?.split("\n").slice(0, 6).join(" | ")
            : undefined,
      });
      if (!res.headersSent) {
        const isChatRequest = /\/api\/chat(?:[/?]|$)/.test(url);
        if (isChatRequest) {
          res.status(500).json({
            error: "The assistant could not complete this request. Please try again.",
            code: "UNEXPECTED_CHAT_SERVER_ERROR",
            retryable: true,
          });
        } else {
          res.status(500).json({ error: "Internal server error" });
        }
      }
    }
  };
}
