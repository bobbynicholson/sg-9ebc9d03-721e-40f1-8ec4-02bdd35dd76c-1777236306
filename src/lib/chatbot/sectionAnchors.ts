export interface ChatPageSection {
  id: string;
  label: string;
  kind: "section" | "subsection" | "record";
  ref?: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "section";
}

function isIgnored(element: Element): boolean {
  return !!element.closest("[data-chatbot-root], nav, header, footer, [aria-hidden='true']");
}

function textOf(element: Element | null): string {
  return (element?.textContent || "").replace(/\s+/g, " ").trim();
}

function labelFor(element: Element): string {
  const explicit = element.getAttribute("data-chat-section-label") || element.getAttribute("aria-label");
  if (explicit) return explicit.trim();
  if (/^H[234]$/.test(element.tagName)) return textOf(element);
  return textOf(element.querySelector("h2, h3, h4, [data-chat-section-label]"));
}

/**
 * Index meaningful page targets without requiring every page to be edited.
 * Important business sections can opt into a stable data-chat-section value;
 * ordinary headings and semantic containers receive deterministic anchors.
 */
export function indexChatPageSections(): ChatPageSection[] {
  if (typeof document === "undefined") return [];
  const root = document.querySelector("main") || document.body;
  const candidates = Array.from(root.querySelectorAll(
    "[data-chat-section], section, article, [role='region'], h2, h3, h4",
  ));
  const used = new Set<string>();
  const sections: ChatPageSection[] = [];

  candidates.forEach((element) => {
    if (isIgnored(element)) return;
    // A marked container is the target; do not create a second target for
    // its heading unless the heading has its own explicit marker.
    if (!/^H[234]$/.test(element.tagName) && element.closest("[data-chat-section]") !== element) return;
    if (/^(SECTION|ARTICLE)$/.test(element.tagName) && !element.id && !element.querySelector("h2, h3, h4")) return;
    const label = labelFor(element);
    if (label.length < 3) return;

    const explicitId = element.id;
    let id = explicitId || `chat-section-${slugify(label)}`;
    let suffix = 2;
    while (used.has(id) || (!explicitId && document.getElementById(id))) {
      id = `${explicitId || `chat-section-${slugify(label)}`}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    if (!element.id) element.id = id;
    element.setAttribute("data-chat-section", element.getAttribute("data-chat-section") || id);
    element.setAttribute("data-chat-section-label", label);
    element.setAttribute("data-chat-section-kind", /^H[234]$/.test(element.tagName) ? "subsection" : "section");
    element.classList.add("scroll-mt-20");
    sections.push({
      id,
      label,
      kind: /^H[234]$/.test(element.tagName) ? "subsection" : "section",
      ref: element.getAttribute("data-chat-section") || undefined,
    });
  });
  return sections;
}
