import { createHash } from "crypto";

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const PHOTO_TIMEOUT_MS = 4000;

function readMenuItems(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function pdfSafePhotoSource(rawUrl: unknown, thumbnailSize?: number): Promise<string | null> {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;
  const url = rawUrl.trim();
  const makeJpeg = async (source: Buffer) => {
    const sharpModule = await import("sharp");
    const size = thumbnailSize ?? 480;
    const jpeg = await sharpModule.default(source, { limitInputPixels: 32_000_000 })
      .rotate()
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: thumbnailSize ? 76 : 78 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  };

  const inlineImage = /^data:image\/(?:png|jpe?g|webp);base64,/i.exec(url);
  if (inlineImage) {
    if (!thumbnailSize && !/^data:image\/webp/i.test(url)) return url;
    const encoded = url.slice(inlineImage[0].length);
    if (encoded.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4) return null;
    try {
      return await makeJpeg(Buffer.from(encoded, "base64"));
    } catch {
      return null;
    }
  }

  // Menu uploads are stored in this app's public Supabase bucket. Restrict
  // server-side image fetches to that same origin so a quote row cannot make
  // the PDF renderer request arbitrary internal or external URLs.
  let supabaseOrigin: string;
  let photoUrl: URL;
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
    supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
    photoUrl = new URL(url);
    if (photoUrl.protocol !== "https:" && photoUrl.protocol !== "http:") return null;
    if (photoUrl.origin !== supabaseOrigin) return null;
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PHOTO_TIMEOUT_MS);
  try {
    const response = await fetch(photoUrl, { signal: controller.signal, redirect: "error" });
    if (!response.ok) return null;
    const contentType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!/^image\/(?:png|jpe?g|webp)$/.test(contentType)) return null;
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_PHOTO_BYTES || !response.body) return null;
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_PHOTO_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
    const source = Buffer.concat(chunks, received);
    if (!source.length) return null;

    return await makeJpeg(source);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Resolve old catalogue-backed quote lines and embed safe, compact JPEGs
 * for React-PDF. Returns a source URL fingerprint for PDF cache invalidation. */
export async function prepareQuoteMenuPhotoData(db: any, quoteRow: any): Promise<{
  row: any;
  fingerprint: string;
}> {
  const menuItems = readMenuItems(quoteRow?.menu_items);
  const companyId = quoteRow?.company_id || quoteRow?.company?.id;
  const missingIds = [...new Set(menuItems
    .filter((item) => !item?.image_url && item?.menu_item_id)
    .map((item) => String(item.menu_item_id)))];
  const photoById = new Map<string, string | null>();

  if (companyId && missingIds.length) {
    try {
      const { data, error } = await db
        .from("menu_items")
        .select("id,image_url")
        .eq("company_id", companyId)
        .in("id", missingIds);
      if (error) throw error;
      for (const item of data || []) {
        photoById.set(String(item.id), typeof item.image_url === "string" ? item.image_url : null);
      }
    } catch {
      // Keep the PDF available when a legacy catalogue lookup fails.
    }
  }

  const sourceLines = menuItems.map((item) => ({
    ...item,
    image_url: item?.image_url || photoById.get(String(item?.menu_item_id)) || null,
  }));
  const fingerprint = createHash("sha256")
    .update(sourceLines.map((item) => `${item?.menu_item_id || ""}:${item?.image_url || ""}`).join("|"))
    .digest("hex");

  const dataByUrl = new Map<string, Promise<string | null>>();
  const withPhotos: any[] = [];
  for (let start = 0; start < sourceLines.length; start += 4) {
    const batch = sourceLines.slice(start, start + 4);
    const converted = await Promise.all(batch.map(async (item) => {
      const sourceUrl = typeof item.image_url === "string" ? item.image_url : null;
      if (!sourceUrl) return { ...item, image_url: null };
      if (!dataByUrl.has(sourceUrl)) dataByUrl.set(sourceUrl, pdfSafePhotoSource(sourceUrl));
      return { ...item, image_url: await dataByUrl.get(sourceUrl) };
    }));
    withPhotos.push(...converted);
  }

  return {
    row: { ...quoteRow, menu_items: withPhotos },
    fingerprint,
  };
}
