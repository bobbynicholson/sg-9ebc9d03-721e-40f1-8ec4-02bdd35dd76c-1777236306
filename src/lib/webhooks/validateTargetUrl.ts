const PRIVATE_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".test", ".invalid"];

/** Restrict webhook endpoints to public HTTPS hosts and reject common private IP ranges. */
export function parsePublicWebhookUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || (!host.includes(".") && !host.includes(":")) ||
      PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;

  const octets = host.split(".").map(Number);
  const isIpv4 = octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  if (isIpv4) {
    const [a, b] = octets;
    if (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    ) return null;
  }

  if (host.includes(":")) {
    if (host === "::" || host === "::1" || /^(fc|fd|fe8|fe9|fea|feb)/i.test(host)) return null;
    if (host.startsWith("::ffff:")) return null;
  }
  return url;
}
