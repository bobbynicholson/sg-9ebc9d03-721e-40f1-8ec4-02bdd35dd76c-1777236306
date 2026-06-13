/**
 * Serialise a JSON-LD object for embedding inside a
 * `<script type="application/ld+json" dangerouslySetInnerHTML>` block.
 *
 * Plain `JSON.stringify` does NOT escape `<`, `>` or `&`, so any
 * dynamic string in the object (a blog title, an excerpt) that
 * contains `</script>` closes the script tag early and lets the rest
 * of the value render as live HTML - stored XSS on an otherwise static
 * SEO block. Escaping those three characters to their `\uXXXX` forms
 * keeps the JSON byte-for-byte valid while making a script breakout
 * impossible. This is the escaping pattern the Next.js docs recommend
 * for inline JSON.
 */
export function jsonLdSafe(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
