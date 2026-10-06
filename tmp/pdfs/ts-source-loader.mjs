import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import swc from "next/dist/build/swc/index.js";

const workspace = process.cwd();
const sourceRoot = join(workspace, "src");
const sourceRootUrl = pathToFileURL(`${sourceRoot}/`).href;
const extensions = [".ts", ".tsx", ".js", ".jsx"];

function resolveSource(candidate) {
  if (existsSync(candidate)) return candidate;
  for (const extension of extensions) {
    if (existsSync(`${candidate}${extension}`)) return `${candidate}${extension}`;
  }
  for (const extension of extensions) {
    const index = join(candidate, `index${extension}`);
    if (existsSync(index)) return index;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const path = resolveSource(join(sourceRoot, specifier.slice(2)));
    if (path) return { url: pathToFileURL(path).href, shortCircuit: true };
  }
  if (specifier.startsWith(".") && context.parentURL?.startsWith(sourceRootUrl)) {
    const path = resolveSource(join(dirname(fileURLToPath(context.parentURL)), specifier));
    if (path) return { url: pathToFileURL(path).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith(sourceRootUrl) && [".ts", ".tsx"].includes(extname(fileURLToPath(url)))) {
    const filename = fileURLToPath(url);
    const isTsx = filename.endsWith(".tsx");
    const output = swc.transformSync(readFileSync(filename, "utf8"), {
      filename,
      sourceMaps: false,
      jsc: {
        parser: { syntax: "typescript", tsx: isTsx, decorators: true },
        transform: { react: { runtime: "automatic", development: false } },
        target: "es2022",
      },
      module: { type: "es6" },
    });
    return { format: "module", source: output.code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
