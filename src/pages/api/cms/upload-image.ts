/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/cms/upload-image
 *
 * Super-admin only. Uploads a header / hero image to the cms-images
 * bucket and returns a public URL. The CMS form drops the URL into
 * cms_pages.header_image_url alongside the alt text the operator
 * provided.
 *
 * Bucket is public on read (the marketing site serves these
 * directly), private on write (this endpoint uses the service-role
 * client and is the only authorised writer).
 *
 * Hard caps:
 *   - 5 MB
 *   - JPEG, PNG, WebP, AVIF, GIF only
 */
import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import { promises as fs } from "fs";
import { randomUUID } from "node:crypto";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";


export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);
const EXT_FROM_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role")
      .eq("id", user.id)
      .single();
    const role = (profile?.active_role || profile?.role || "") as string;
    if (role !== "super_admin") {
      return res.status(403).json({ error: "Marketing CMS uploads are super-admin only" });
    }

    const form = formidable({ maxFiles: 1, maxFileSize: MAX_BYTES });
    const parsed: any = await form.parse(req);
    const files: any = Array.isArray(parsed) ? parsed[1] : parsed?.files;
    const fields: any = Array.isArray(parsed) ? parsed[0] : parsed?.fields;
    const fileEntry: any = files?.file?.[0] ?? files?.file;
    if (!fileEntry) {
      return res.status(400).json({ error: "No file provided, expected field 'file'" });
    }
    const mime = (fileEntry.mimetype || "").toLowerCase();
    if (!ALLOWED_MIMES.has(mime)) {
      return res.status(415).json({
        error: `Unsupported image type ${mime}. Allowed: jpg, png, webp, avif, gif.`,
      });
    }
    if (fileEntry.size > MAX_BYTES) {
      return res.status(413).json({
        error: `File too large, ${(fileEntry.size / 1024 / 1024).toFixed(1)} MB. Cap is 5 MB.`,
      });
    }

    const slugHint = String(
      fields?.slug?.[0] ?? fields?.slug ?? "page",
    )
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page";

    const ext = EXT_FROM_MIME[mime] || "bin";
    const filename = `${randomUUID()}.${ext}`;
    const path = `cms/${slugHint}/${filename}`;

    const buffer = await fs.readFile(fileEntry.filepath);
    const supabase: any = getServiceSupabase();
    const { error: uploadErr } = await supabase.storage
      .from("cms-images")
      .upload(path, buffer, {
        contentType: mime,
        upsert: false,
      });
    if (uploadErr) {
      console.error("cms upload-image storage failed:", uploadErr.message);
      return res.status(500).json({ error: "Could not store the image" });
    }

    const { data: pub } = supabase.storage.from("cms-images").getPublicUrl(path);
    const url = pub?.publicUrl as string | undefined;
    if (!url) {
      return res.status(500).json({ error: "Stored, but could not resolve a public URL" });
    }

    return res.status(200).json({
      ok: true,
      url,
      path,
      bytes: fileEntry.size,
      mime,
    });
  } catch (e: any) {
    console.error("/api/cms/upload-image crashed:", e);
    return res.status(500).json({ error: e?.message || "Upload failed" });
  }
}

export default withApiLogging(handler);
