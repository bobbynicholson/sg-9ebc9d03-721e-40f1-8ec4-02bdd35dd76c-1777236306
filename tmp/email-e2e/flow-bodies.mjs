// Reads what Resend actually sent to the test inbox since the flow started.
import fs from "fs";
import { env, TEST_EMAIL } from "./lib.mjs";
const { since } = JSON.parse(fs.readFileSync("tmp/email-e2e/FLOW.json", "utf8"));
const H = { Authorization: `Bearer ${env.RESEND_API_KEY}` };
const list = await (await fetch("https://api.resend.com/emails?limit=100", { headers: H })).json();
if (!list?.data) { console.log("list failed:", JSON.stringify(list).slice(0, 300)); process.exit(); }
const mine = list.data.filter((e) => (e.to || []).some((t) => t.toLowerCase() === TEST_EMAIL) && new Date(e.created_at) >= new Date(since)).reverse();
console.log(`${mine.length} email(s) sent to ${TEST_EMAIL} since ${since}\n`);
for (const e of mine) {
  const full = await (await fetch(`https://api.resend.com/emails/${e.id}`, { headers: H })).json();
  const text = (full.text || String(full.html || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 [$1]").replace(/<br\s*\/?>|<\/p>|<\/tr>|<\/h\d>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'")).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  const links = [...String(full.html || full.text || "").matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0]).filter((u) => /\/c\/order\/|\/pay\/|\/c\/account/.test(u));
  console.log(`=== ${String(e.created_at).slice(11, 19)} | ${e.subject} | last event: ${e.last_event}`);
  console.log(text.slice(0, 1400));
  console.log("LINKS:", [...new Set(links)].map((u) => u.replace(/\?t=.*/, "?t=…")).join("  ") || "(none)", "\n");
}
