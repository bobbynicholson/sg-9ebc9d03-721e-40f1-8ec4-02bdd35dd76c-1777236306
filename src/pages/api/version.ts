/**
 * Build identity used by VersionWatcher on the client to detect deploys.
 *
 * Returns the Next.js build ID (a hash that changes on every production
 * build). When a new version ships to Vercel, the build ID flips, the
 * client sees the difference, and triggers a soft reload so the user
 * picks up the new bundle without manually Ctrl+Shift+R'ing.
 *
 * No-cache headers ensure the response itself is never cached.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { withApiLogging } from "@/lib/withApiLogging";


let cached: string | null = null;

function readBuildId(): string {
  if (cached) return cached;
  // Vercel sets VERCEL_GIT_COMMIT_SHA at runtime; otherwise fall back to
  // .next/BUILD_ID which Next.js writes during `next build`.
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) {
    cached = sha;
    return sha;
  }
  try {
    const p = path.join(process.cwd(), ".next", "BUILD_ID");
    if (fs.existsSync(p)) {
      cached = fs.readFileSync(p, "utf8").trim();
      return cached;
    }
  } catch {
    /* ignore */
  }
  cached = "dev";
  return cached;
}

function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.status(200).json({
    buildId: readBuildId(),
    serverTime: new Date().toISOString(),
  });
}

export default withApiLogging(handler);
