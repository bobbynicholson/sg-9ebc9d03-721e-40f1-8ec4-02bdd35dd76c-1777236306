/**
 * Adds withApiLogging wrapper to every Next.js API route handler.
 *
 * Run: node scripts/add-api-logging.mjs
 *
 * Safe to run multiple times — skips files already wrapped.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, "../src/pages/api");

let touched = 0;
let skipped = 0;
let errors = 0;

function processFile(filePath) {
  let src;
  try {
    src = fs.readFileSync(filePath, "utf8");
  } catch {
    errors++;
    return;
  }

  // Skip if already wrapped
  if (src.includes("withApiLogging")) {
    skipped++;
    return;
  }

  // Only wrap files that export a default async handler
  if (!/export default (async )?function handler/.test(src) &&
      !/export default withApiLogging/.test(src)) {
    skipped++;
    return;
  }

  // Add import after the last existing import line
  const importLine = `import { withApiLogging } from "@/lib/withApiLogging";\n`;

  // Find insertion point — after the last import statement
  const lines = src.split("\n");
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i]) || /^} from /.test(lines[i])) {
      lastImportIdx = i;
    }
  }

  if (lastImportIdx === -1) {
    skipped++;
    return;
  }

  // Insert the import
  lines.splice(lastImportIdx + 1, 0, importLine);
  let newSrc = lines.join("\n");

  // Wrap the default export
  // Pattern 1: export default async function handler(...)
  newSrc = newSrc.replace(
    /^export default (async function handler)/m,
    "async function handler"
  );
  // Pattern 2: export default function handler(...)
  newSrc = newSrc.replace(
    /^export default (function handler)/m,
    "function handler"
  );

  // Append the wrapped export at the end
  if (!newSrc.trimEnd().endsWith("export default withApiLogging(handler);")) {
    newSrc = newSrc.trimEnd() + "\n\nexport default withApiLogging(handler);\n";
  }

  try {
    fs.writeFileSync(filePath, newSrc, "utf8");
    touched++;
    console.log(`  ✓ ${path.relative(apiDir, filePath)}`);
  } catch {
    errors++;
    console.error(`  ✗ failed to write ${filePath}`);
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith(".ts") && !entry.name.startsWith("_")) {
      processFile(full);
    }
  }
}

console.log("Adding withApiLogging to API routes...\n");
walk(apiDir);
console.log(`\nDone. Wrapped: ${touched}  Skipped: ${skipped}  Errors: ${errors}`);
