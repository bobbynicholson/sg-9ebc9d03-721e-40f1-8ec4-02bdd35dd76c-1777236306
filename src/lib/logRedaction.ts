/** Shared by Node, Edge and browser logging. Never changes the source value. */
export const REDACTED = "[REDACTED]";
// V8 lazily formats Error.stack through this native getter (Node 24+).
// Preserve useful frames while declining arbitrary application getters.
const ERROR_STACK_GETTER = Object.getOwnPropertyDescriptor(new Error(), "stack")?.get;

const SECRET_KEYS = new Set([
  "t", "key", "code", "state", "pin", "otp", "passwd", "pwd",
  "authorization", "proxyauthorization", "cookie", "setcookie",
  "connectionstring", "databaseurl", "smtpurl",
  "merchantkey", "encryptionkey", "smtppass",
]);
const SECRET_LABEL = String.raw`(?:[a-z\d_.-]*(?:password|passphrase|token|secret|credential|api[_.-]?key|private[_.-]?key|signing[_.-]?key|signature)[a-z\d_.-]*|t|key|code|state|pin|otp|passwd|pwd|authorization|proxy[_.-]?authorization|cookie|set[_.-]?cookie|connection[_.-]?string|database[_.-]?url|smtp[_.-]?(?:url|pass)|merchant[_.-]?key|encryption[_.-]?key)`;
const SECRET_ASSIGNMENT = new RegExp(
  String.raw`(^|[^a-z\d_.-])(["']?)(${SECRET_LABEL})(\2\s*[:=]\s*)(\[REDACTED\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,\r\n;}\]]+)`, "gi",
);

function isSecretKey(key: string): boolean {
  let decoded = key;
  try { decoded = decodeURIComponent(key.replace(/\+/g, " ")); } catch { /* malformed URL */ }
  const normal = decoded.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SECRET_KEYS.has(normal)
    || /password|passphrase|token|secret|credential|apikey|privatekey|signingkey|signature/.test(normal);
}

/** Also covers tenant-prefixed public links and signed Storage query strings. */
export function redactLogUrl(url: string): string {
  return url
    .replace(/([a-z][a-z\d+.-]*:\/\/)[^/\s@]+@/gi, `$1${REDACTED}@`)
    .replace(/(\/(?:api\/public\/(?:quotes|invoices|embed)|api\/outsource\/accept|p\/accept|pay\/i|c\/order|q|u)\/)[^/?#\s<>"'`]+/gi, `$1${REDACTED}`)
    .replace(/([?&#])([^=&#\s<>"'`]+)=([^&#\s<>"'`]*)/g,
      (match, separator: string, key: string) => isSecretKey(key) ? `${separator}${key}=${REDACTED}` : match);
}

function redactEmbeddedJson(text: string): string {
  // Logs often interpolate JSON into a prefix rather than passing an object.
  // Balance braces with quoted-string awareness so whole credential containers
  // are removed, including punctuation and nested fields inside their values.
  return text.replace(/\{[\s\S]*/g, tail => {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < tail.length; index++) {
      const character = tail[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === "{") depth++;
      else if (character === "}" && --depth === 0) {
        try {
          return JSON.stringify(redactLogValue(JSON.parse(tail.slice(0, index + 1)))) + redactEmbeddedJson(tail.slice(index + 1));
        } catch { return tail; }
      }
    }
    return tail;
  });
}

/** Free-form messages, serialized JSON, URLs, headers and provider error text. */
export function redactLogText(text: string): string {
  // Parse JSON before handling free-form text, so entire credential objects and
  // values containing spaces/commas are removed rather than partially masked.
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { return JSON.stringify(redactLogValue(JSON.parse(text))); } catch { /* ordinary message */ }
  }
  return redactLogUrl(redactEmbeddedJson(text))
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, REDACTED)
    .replace(/\b(?:Bearer|Basic)\s+[a-z\d._~+\/=-]+/gi, REDACTED)
    .replace(/\beyJ[a-z\d_-]+\.[a-z\d_-]+\.[a-z\d_-]+\b/gi, REDACTED)
    .replace(/\b(?:(?:sk|rk)_(?:live|test)_|whsec_|sb_secret_)[a-z\d_-]+/gi, REDACTED)
    .replace(/\b((?:set-cookie|cookie)\s*:\s*)[^\r\n]+/gi, `$1${REDACTED}`)
    .replace(SECRET_ASSIGNMENT,
      (_match, prefix: string, quote: string, key: string, separator: string, value: string) => {
        const replacement = value.startsWith('"') ? JSON.stringify(REDACTED) : value.startsWith("'") ? `'${REDACTED}'` : REDACTED;
        return `${prefix}${quote}${key}${separator}${replacement}`;
      });
}

/** Safe snapshots avoid getters, custom inspect/toJSON hooks and live objects. */
export function redactLogValue(value: unknown): unknown {
  const seen = new WeakSet<object>();
  function visit(current: unknown, depth: number): unknown {
    if (typeof current === "string") return redactLogText(current);
    if (typeof current === "bigint") return String(current);
    if (typeof current === "function" || typeof current === "symbol") return `[${typeof current}]`;
    if (current == null || typeof current !== "object") return current;
    if (depth > 20) return "[Max depth]";
    if (seen.has(current)) return "[Circular]";
    seen.add(current);
    try {
      if (current instanceof Date) return current.toISOString();
      if (current instanceof URL) return redactLogUrl(current.href);
      if (typeof Headers !== "undefined" && current instanceof Headers) return visit(Object.fromEntries(current.entries()), depth + 1);
      if (current instanceof URLSearchParams) return visit(Object.fromEntries(current.entries()), depth + 1);
      if (ArrayBuffer.isView(current) || current instanceof ArrayBuffer) return "[Binary data]";
      if (current instanceof Map) return visit(Object.fromEntries(Array.from(current, ([key, entry]) => [String(key), entry])), depth + 1);
      if (current instanceof Set) return visit(Array.from(current), depth + 1);
      if (Array.isArray(current)) return current.map(entry => visit(entry, depth + 1));
      const result: Record<string, unknown> = Object.create(null);
      if (current instanceof Error) {
        const name = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(current), "name")?.value;
        result.name = typeof name === "string" ? redactLogText(name) : "Error";
      }
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(current))) {
        if (key === "toJSON") continue;
        result[key] = isSecretKey(key) ? REDACTED
          : "value" in descriptor ? visit(descriptor.value, depth + 1)
          : current instanceof Error && key === "stack" && ERROR_STACK_GETTER && descriptor.get === ERROR_STACK_GETTER
            ? visit(ERROR_STACK_GETTER.call(current), depth + 1) : "[Accessor]";
      }
      return result;
    } finally { seen.delete(current); }
  }
  try { return visit(value, 0); } catch { return "[Unserialisable]"; }
}

/** Monitoring SDKs need an Error instance, with a sanitized stack and cause. */
export function redactLogException(error: unknown): unknown {
  const safe = redactLogValue(error);
  if (!(error instanceof Error) || !safe || typeof safe !== "object") return safe;
  const fields = safe as Record<string, unknown>;
  const copy = new Error(typeof fields.message === "string" ? fields.message : "Error");
  Object.assign(copy, fields);
  return copy;
}

/** Format first so `console.log('token: %s', value)` cannot bypass masking. */
export function formatLogArguments(args: unknown[]): string {
  const render = (value: unknown): string => {
    const safe = redactLogValue(value);
    return typeof safe === "string" ? safe : JSON.stringify(safe) ?? String(safe);
  };
  const remaining = [...args];
  let message = "";
  if (typeof remaining[0] === "string") {
    message = (remaining.shift() as string).replace(/%[%sdifjoOc]/g, placeholder => {
      if (placeholder === "%%") return "%";
      if (!remaining.length) return placeholder;
      const value = remaining.shift();
      return placeholder === "%c" ? "" : render(value);
    });
  }
  return redactLogText([message, ...remaining.map(render)].filter(Boolean).join(" "));
}
