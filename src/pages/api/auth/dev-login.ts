import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { isLocalAuthBypassEnabled } from "@/lib/localAuthBypass";
import { LOCAL_DEV_LOGIN_USERS } from "@/lib/devLoginUsers";

function isLoopbackAddress(address: string | undefined): boolean {
  const normalized = String(address || "").toLowerCase().replace(/^::ffff:/, "");
  return normalized === "127.0.0.1" || normalized === "::1";
}

function isTrustedLocalRequest(req: NextApiRequest): boolean {
  const host = String(req.headers.host || "");
  const originHeader = String(req.headers.origin || "");
  if (!host || !originHeader || !isLoopbackAddress(req.socket.remoteAddress)) return false;

  try {
    const requestHost = new URL(`http://${host}`).host.toLowerCase();
    const origin = new URL(originHeader);
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "http")
      .split(",")[0]
      .trim()
      .toLowerCase();
    return isLocalAuthBypassEnabled(origin.hostname)
      && origin.host.toLowerCase() === requestHost
      && origin.protocol === `${forwardedProto}:`;
  } catch {
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isTrustedLocalRequest(req)) return res.status(404).json({ error: "Not found" });

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!LOCAL_DEV_LOGIN_USERS.some((user) => user.email === email)) {
    return res.status(400).json({ error: "Choose a listed development account." });
  }

  const password = process.env.SUPABASE_DEV_USER_PASSWORD;
  if (!password) return res.status(503).json({ error: "Local development login is not configured." });

  try {
    const supabase = createPagesServerClient({ req, res });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return res.status(401).json({ error: "Development login failed." });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(503).json({ error: "Local development login is unavailable." });
  }
}
