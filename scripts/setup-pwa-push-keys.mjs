import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const webPush = require("web-push");

const envPath = path.join(process.cwd(), ".env.local");
const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const hasPublic = /^\s*WEB_PUSH_VAPID_PUBLIC_KEY\s*=.+$/m.test(existing);
const hasPrivate = /^\s*WEB_PUSH_VAPID_PRIVATE_KEY\s*=.+$/m.test(existing);

if (hasPublic && hasPrivate) {
  console.log("PWA Web Push keys already exist in .env.local; left unchanged.");
  process.exit(0);
}
if (hasPublic || hasPrivate) {
  console.error(".env.local contains only one VAPID key. Complete the pair manually; no values were changed.");
  process.exit(1);
}

const keys = webPush.generateVAPIDKeys();
const block = [
  "",
  "# PWA Web Push (private key must never be exposed to the browser)",
  `WEB_PUSH_VAPID_PUBLIC_KEY=${keys.publicKey}`,
  `WEB_PUSH_VAPID_PRIVATE_KEY=${keys.privateKey}`,
  "WEB_PUSH_VAPID_SUBJECT=mailto:support@cateringms.com",
  "",
].join("\n");
fs.appendFileSync(envPath, block, { encoding: "utf8", mode: 0o600 });
console.log("Generated PWA Web Push keys in .env.local. Values were not printed.");
