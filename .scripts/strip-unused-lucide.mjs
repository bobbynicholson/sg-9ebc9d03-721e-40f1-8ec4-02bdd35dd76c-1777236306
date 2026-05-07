#!/usr/bin/env node
/**
 * Strip unused lucide-react icon imports from a file (or every src/*
 * file with a lucide-react import, when run with no args).
 *
 * Idempotent. Touches only the lucide-react import line(s); leaves
 * everything else exactly as-is.
 *
 * Usage:
 *   node .scripts/strip-unused-lucide.mjs            # sweep src/
 *   node .scripts/strip-unused-lucide.mjs path/to/file.tsx
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const importRegex = /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["'];?/g;

function stripFile(file) {
  const original = readFileSync(file, "utf8");
  let mutated = original;
  let totalRemoved = 0;

  mutated = mutated.replace(importRegex, (match, body) => {
    const names = body
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [imported, aliasRaw] = s.split(/\s+as\s+/);
        return { imported: imported.trim(), local: (aliasRaw ?? imported).trim() };
      });

    // Body of the file with this import line replaced by a marker so
    // we don't count the import as a reference to itself.
    const fileWithoutImport = mutated.replace(match, "");

    const used = names.filter(({ local }) => {
      // Word-boundary search for the local name.
      const re = new RegExp(`\\b${local}\\b`);
      return re.test(fileWithoutImport);
    });

    if (used.length === names.length) return match;
    totalRemoved += names.length - used.length;
    if (used.length === 0) return ""; // entire import line gone

    const reconstructed = used
      .map(({ imported, local }) => (imported === local ? imported : `${imported} as ${local}`))
      .join(", ");
    return `import { ${reconstructed} } from "lucide-react";`;
  });

  if (mutated !== original) {
    writeFileSync(file, mutated);
    return totalRemoved;
  }
  return 0;
}

const argFiles = process.argv.slice(2);
let files;
if (argFiles.length > 0) {
  files = argFiles.map((f) => resolve(f));
} else {
  const out = execSync(`grep -rl 'from "lucide-react"' src --include="*.tsx" --include="*.ts"`, {
    encoding: "utf8",
  });
  files = out.split(/\r?\n/).filter(Boolean);
}

let totalFiles = 0;
let totalIcons = 0;
for (const f of files) {
  const removed = stripFile(f);
  if (removed > 0) {
    totalFiles += 1;
    totalIcons += removed;
    console.log(`${f}: -${removed}`);
  }
}
console.log(`\n${totalIcons} unused icon imports stripped from ${totalFiles} files.`);
