import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import sharp from "sharp";

const MAX_BYTES = 2 * 1024 * 1024;

export function isPublicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19)));
}

/** Fetch only the saved company logo. Pin the validated IP through redirects. */
async function readLogo(source: string, redirects = 0): Promise<Buffer> {
  if (source.startsWith("data:")) {
    const match = source.match(/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,([a-z\d+/=\s]+)$/i);
    if (!match || source.length > MAX_BYTES * 1.4) throw new Error("Invalid logo image");
    return Buffer.from(match[1], "base64");
  }
  const url = new URL(source);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || isIP(url.hostname)) {
    throw new Error("Logo must use a public HTTPS address");
  }
  const addresses = await lookup(url.hostname, { all: true });
  const ipv4 = addresses.filter(entry => entry.family === 4);
  if (!ipv4.length || ipv4.some(entry => !isPublicIpv4(entry.address))) throw new Error("Invalid logo host");
  const response = await new Promise<{ body?: Buffer; redirect?: string }>((resolve, reject) => {
    const req = request(url, {
      headers: { Accept: "image/*", "User-Agent": "CateringMS-App-Icon/1.0" },
      // Do not allow DNS rebinding between validation and the network request.
      lookup: (_hostname, options, callback) => {
        if (typeof options === "object" && options.all) callback(null, [{ address: ipv4[0].address, family: 4 }]);
        else callback(null, ipv4[0].address, 4);
      },
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
        res.resume(); resolve({ redirect: new URL(res.headers.location, url).href }); return;
      }
      if (res.statusCode !== 200 || !res.headers["content-type"]?.startsWith("image/")) {
        res.resume(); reject(new Error("Logo is unavailable")); return;
      }
      const chunks: Buffer[] = [];
      let length = 0;
      res.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > MAX_BYTES) { req.destroy(new Error("Logo is too large")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.setTimeout(8000, () => req.destroy(new Error("Logo request timed out")));
    req.on("error", reject);
    req.end();
  });
  if (response.redirect) {
    if (redirects >= 2) throw new Error("Too many logo redirects");
    return readLogo(response.redirect, redirects + 1);
  }
  if (!response.body) throw new Error("Empty logo response");
  return response.body;
}

export async function renderCompanyIcon(logoUrl: string, size: number): Promise<Buffer> {
  const source = await readLogo(logoUrl);
  return sharp(source, { limitInputPixels: 16_000_000 })
    .rotate()
    .resize(size, size, { fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
}
