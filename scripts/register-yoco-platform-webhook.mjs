#!/usr/bin/env node
/**
 * One-time setup: register the platform plan-billing webhook on the
 * PLATFORM Yoco account and print its signing secret.
 *
 * Yoco has no dashboard screen for Checkout webhooks and shows the secret
 * only once, at creation. Re-running replaces the existing registration
 * for the same URL (and prints a new secret).
 *
 * Usage:
 *   YOCO_PLATFORM_SECRET_KEY=sk_live_... node scripts/register-yoco-platform-webhook.mjs https://cateringms.com
 *
 * Then set YOCO_PLATFORM_WEBHOOK_SECRET=<printed whsec_...> in the
 * deployment environment and redeploy.
 */
const secretKey = process.env.YOCO_PLATFORM_SECRET_KEY;
const origin = (process.argv[2] || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
if (!secretKey) {
  console.error("Set YOCO_PLATFORM_SECRET_KEY first.");
  process.exit(1);
}
if (!/^https:\/\//.test(origin) || /localhost|127\.0\.0\.1/.test(origin)) {
  console.error("Pass the public HTTPS site origin, e.g. https://cateringms.com");
  process.exit(1);
}
const url = `${origin}/api/webhooks/subscriptions/yoco`;
const base = "https://payments.yoco.com/api/webhooks";
const headers = { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" };

const listed = await fetch(base, { headers });
if (!listed.ok) {
  console.error(`Yoco rejected the key or request (${listed.status}): ${await listed.text()}`);
  process.exit(1);
}
const body = await listed.json().catch(() => ({}));
const hooks = Array.isArray(body) ? body : body.subscriptions || body.webhooks || body.data || [];
for (const hook of hooks) {
  if (hook?.url === url && hook.id) {
    const removed = await fetch(`${base}/${encodeURIComponent(hook.id)}`, { method: "DELETE", headers });
    console.log(`Removed previous registration ${hook.id} (${removed.status}).`);
  }
}
const created = await fetch(base, {
  method: "POST", headers, body: JSON.stringify({ name: "cateringms-plan-billing", url }),
});
const result = await created.json().catch(() => ({}));
if (!created.ok || !result.secret) {
  console.error(`Registration failed (${created.status}):`, result);
  process.exit(1);
}
console.log(`Registered ${url} (${result.mode || "unknown"} mode).`);
console.log(`YOCO_PLATFORM_WEBHOOK_SECRET=${result.secret}`);
