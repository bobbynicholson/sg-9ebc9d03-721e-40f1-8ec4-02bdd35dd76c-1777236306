import type { NextApiRequest, NextApiResponse } from "next";
import { companyForAdmin } from "@/lib/whatsapp/adminAccess";
import { decryptWhatsAppToken, loadWhatsAppCredentials } from "@/lib/whatsapp/credentials";
import { getServiceSupabase } from "@/lib/supabase/service";

const GRAPH_URL = "https://graph.facebook.com/v25.0";
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

function allowedMediaType(value: unknown): string | null {
  const type = typeof value === "string" ? value.split(";")[0].trim().toLowerCase() : "";
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type)) return null;
  if (["text/html", "application/xhtml+xml", "application/javascript", "text/javascript", "application/xml", "text/xml", "image/svg+xml"].includes(type)) return null;
  if (/^(audio|video|image)\//.test(type) || type.startsWith("application/") || type.startsWith("text/")) return type;
  return null;
}

function allowedMetaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !(host === "fbcdn.net" || host.endsWith(".fbcdn.net") || host === "fbsbx.com" || host.endsWith(".fbsbx.com"))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).json({ error: "Method not allowed" });
  const access = await companyForAdmin(req, res);
  if (!access) return;
  const messageId = String(req.query.messageId || "");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(messageId)) return res.status(400).json({ error: "Invalid message" });

  const sb: any = getServiceSupabase();
  let { data: row, error } = await sb.from("whatsapp_inbound_messages")
    .select("media_id, media_mime_type, media_filename")
    .eq("id", messageId).eq("company_id", access.companyId).maybeSingle();
  if (error) return res.status(500).json({ error: "Could not load this WhatsApp media." });
  if (!row) {
    const result = await sb.from("whatsapp_external_messages")
      .select("media_id, media_mime_type, media_filename")
      .eq("id", messageId).eq("company_id", access.companyId).maybeSingle();
    row = result.data;
    error = result.error;
  }
  if (error) return res.status(500).json({ error: "Could not load this WhatsApp media." });
  if (!row?.media_id || !/^[A-Za-z0-9_-]+$/.test(row.media_id)) return res.status(404).json({ error: "This message has no playable media." });

  const credentials = await loadWhatsAppCredentials(sb, access.companyId);
  if (!credentials) return res.status(503).json({ error: "WhatsApp is not connected." });
  const token = await decryptWhatsAppToken(credentials.accessTokenEncrypted);
  const metaResponse = await fetch(`${GRAPH_URL}/${encodeURIComponent(row.media_id)}?fields=url,mime_type,file_size`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!metaResponse.ok) return res.status(metaResponse.status === 404 ? 404 : 502).json({ error: "Meta could not find this media. It may have expired." });
  const media = await metaResponse.json().catch(() => ({}));
  const mediaUrl = allowedMetaUrl(media?.url);
  const contentType = allowedMediaType(media?.mime_type || row.media_mime_type);
  const declaredSize = Number(media?.file_size);
  if (!mediaUrl || !contentType || (Number.isFinite(declaredSize) && declaredSize > MAX_MEDIA_BYTES)) {
    return res.status(415).json({ error: "This WhatsApp media format is not supported." });
  }
  if (req.method === "HEAD") {
    res.setHeader("Content-Type", contentType);
    if (Number.isFinite(declaredSize) && declaredSize > 0) res.setHeader("Content-Length", String(declaredSize));
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.status(200).end();
  }

  const range = typeof req.headers.range === "string" && /^bytes=\d*-\d*$/.test(req.headers.range)
    ? req.headers.range : undefined;
  const download = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) },
    signal: AbortSignal.timeout(30000),
  });
  if (!download.ok && download.status !== 206) return res.status(502).json({ error: "Could not download this WhatsApp media." });
  const bytes = Buffer.from(await download.arrayBuffer());
  if (bytes.byteLength > MAX_MEDIA_BYTES) return res.status(413).json({ error: "This media file is too large to preview." });

  const safeName = typeof row.media_filename === "string"
    ? row.media_filename.replace(/[\r\n"\\/]/g, "_").slice(0, 180) : "";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", String(bytes.byteLength));
  const disposition = contentType.startsWith("audio/") || contentType.startsWith("video/") || contentType.startsWith("image/") || contentType === "application/pdf" ? "inline" : "attachment";
  res.setHeader("Content-Disposition", `${disposition}${safeName ? `; filename="${safeName}"` : ""}`);
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (download.status === 206) {
    res.status(206);
    const contentRange = download.headers.get("content-range");
    if (contentRange) res.setHeader("Content-Range", contentRange);
    res.setHeader("Accept-Ranges", "bytes");
  } else {
    res.status(200);
  }
  return res.send(bytes);
}

export default handler;
