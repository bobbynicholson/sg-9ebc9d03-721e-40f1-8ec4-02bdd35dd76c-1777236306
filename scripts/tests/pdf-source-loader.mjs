// Run the production TSX documents in Node without a Next server or database.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import swc from "next/dist/build/swc/index.js";

const sourceRoot = join(process.cwd(), "src");
const sourceUrl = pathToFileURL(`${sourceRoot}/`).href;
const extensions = [".ts", ".tsx", ".js", ".jsx"];

function resolveSource(candidate) {
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  for (const extension of extensions) {
    if (existsSync(candidate + extension)) return candidate + extension;
    const index = join(candidate, `index${extension}`);
    if (existsSync(index)) return index;
  }
}

export async function resolve(specifier, context, nextResolve) {
  const candidate = specifier.startsWith("@/")
    ? join(sourceRoot, specifier.slice(2))
    : specifier.startsWith(".") && context.parentURL?.startsWith(sourceUrl)
      ? join(dirname(fileURLToPath(context.parentURL)), specifier)
      : null;
  const path = candidate && resolveSource(candidate);
  return path ? { url: pathToFileURL(path).href, shortCircuit: true } : nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith(sourceUrl) && [".ts", ".tsx"].includes(extname(fileURLToPath(url)))) {
    const filename = fileURLToPath(url);
    const output = swc.transformSync(readFileSync(filename, "utf8"), {
      filename,
      jsc: {
        parser: { syntax: "typescript", tsx: filename.endsWith(".tsx") },
        transform: { react: { runtime: "automatic", development: false } },
        target: "es2022",
      },
      module: { type: "es6" },
    });
    return { format: "module", source: output.code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
