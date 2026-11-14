#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
const crons = Array.isArray(config.crons) ? config.crons : [];
const problems = [];

if (crons.length === 0) problems.push("vercel.json has no scheduled cron jobs.");

const seenPaths = new Set();
for (const cron of crons) {
  if (seenPaths.has(cron.path)) problems.push(`Duplicate scheduled path: ${cron.path}`);
  seenPaths.add(cron.path);

  const routePath = join(root, "src", "pages", `${String(cron.path || "").replace(/^\//, "")}.ts`);
  if (!existsSync(routePath)) {
    problems.push(`${cron.path}: API route file is missing.`);
    continue;
  }
  const source = readFileSync(routePath, "utf8");
  if (!/\brequireCronAuth\s*\(/.test(source)) {
    problems.push(`${cron.path}: route must use requireCronAuth to receive task monitoring.`);
  }

  const fields = String(cron.schedule || "").trim().split(/\s+/);
  if (fields.length !== 5) problems.push(`${cron.path}: schedule must have five cron fields.`);
}

const authPath = join(root, "src", "lib", "cronAuth.ts");
const authSource = readFileSync(authPath, "utf8");
if (!authSource.includes("beginCronTaskTracking")
  || !authSource.includes("scheduledCrons")
  || !authSource.includes("scheduled_task_runs")
  || !authSource.includes("recordCronIncident")) {
  problems.push("The shared cron auth gate is missing task-run tracking.");
}

const monitorPath = join(root, "src", "pages", "api", "admin", "cron-task-status.ts");
const monitorSource = readFileSync(monitorPath, "utf8");
if (!monitorSource.includes("scheduled_task_incidents")
  || !monitorSource.includes("cron_audit_failures")
  || !monitorSource.includes("STUCK_AFTER_MS")) {
  problems.push("The admin monitor is missing persistent failure or stuck-run detection.");
}

if (problems.length) {
  console.error(`check:cron-monitoring failed (${problems.length} issue${problems.length === 1 ? "" : "s"}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`check:cron-monitoring: all ${crons.length} scheduled tasks have authenticated routes and shared status tracking.`);
