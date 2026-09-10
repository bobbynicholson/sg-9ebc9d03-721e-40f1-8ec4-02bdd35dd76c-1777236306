export interface ClientTermsSegment {
  text: string;
  bold: boolean;
}

const BOLD_START = "\u0001BOLD_START\u0001";
const BOLD_END = "\u0001BOLD_END\u0001";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const decodeHtml = (value: string): string =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");

const plainTextToHtml = (value: string): string => {
  const blocks = String(value || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      const html = parseClientTermsInline(block)
        .map((segment) => {
          const text = escapeHtml(segment.text);
          return segment.bold ? `<strong>${text}</strong>` : text;
        })
        .join("")
        .replace(/\n/g, "<br />");
      return `<p>${html}</p>`;
    })
    .join("");
};

const htmlToTokenizedText = (value: string): string => {
  let text = String(value || "")
    .replace(/<\s*(strong|b)\b[^>]*>/gi, BOLD_START)
    .replace(/<\s*\/\s*(strong|b)\s*>/gi, BOLD_END)
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n\n")
    .replace(/<\s*(p|div|li|h[1-6])\b[^>]*>/gi, "")
    .replace(/<[^>]*>/g, "");

  text = decodeHtml(text)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
};

export function parseClientTermsInline(value: string): ClientTermsSegment[] {
  const source = String(value || "");
  const segments: ClientTermsSegment[] = [];
  const re = new RegExp(
    `${BOLD_START}([\\s\\S]*?)${BOLD_END}|\\*\\*([^*\\n][\\s\\S]*?[^*\\n]|\\S)\\*\\*`,
    "g",
  );
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(source))) {
    if (match.index > lastIndex) {
      segments.push({ text: source.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1] ?? match[2] ?? "", bold: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < source.length) {
    segments.push({ text: source.slice(lastIndex), bold: false });
  }

  return segments.length ? segments : [{ text: source, bold: false }];
}

export function sanitizeClientTermsHtml(value: string): string {
  const source = String(value || "");
  if (!source.trim()) return "";
  if (!/<[^>]+>/.test(source)) return plainTextToHtml(source);
  return plainTextToHtml(htmlToTokenizedText(source));
}

export function renderClientTermsHtml(value: string): string {
  return sanitizeClientTermsHtml(value);
}

export function parseClientTermsBlocks(value: string): ClientTermsSegment[][] {
  const tokenized = htmlToTokenizedText(renderClientTermsHtml(value));
  return tokenized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(parseClientTermsInline);
}
