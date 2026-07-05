/**
 * Shared CMS markdown renderer.
 *
 * ONE pipeline for both the editor preview (/admin/platform/cms-pages)
 * and the public renderer (/page/[slug]). Before this existed, the
 * preview escaped HTML then converted markdown while the public page
 * injected the raw content - so a page that looked right in preview
 * published as literal ##/** text, and raw HTML (an XSS surface on the
 * marketing site) went straight into dangerouslySetInnerHTML.
 *
 * HTML in the content is escaped, never executed - the CMS speaks
 * markdown only.
 */
export function renderCmsMarkdown(md: string): string {
  const escaped = String(md || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    // Links: only http(s), mailto and site-relative targets - anything
    // else (javascript:, data:) renders as plain text, not a link.
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
      if (/^(https?:\/\/|mailto:|\/)/i.test(href)) {
        // Quotes are not escaped by the pipeline above; encode them so
        // an href can never break out of the attribute.
        const safeHref = href.replace(/"/g, "%22").replace(/'/g, "%27");
        return `<a href="${safeHref}" rel="noopener">${label}</a>`;
      }
      return whole;
    })
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]+?<\/li>)/g, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hu1-3])/gm, "<p>")
    .replace(/<p>(<h[1-3]>)/g, "$1")
    .replace(/<p>(<ul>)/g, "$1");
}
