// Read-only: opens the Quotes page as the company admin and reads the KPI tiles. Blocks every non-GET request.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const cache = JSON.parse(readFileSync("tmp/ui-normalization/.session-cache.json", "utf8"));
console.log("cached sessions:", Object.keys(cache).join(", ").slice(0, 200));
