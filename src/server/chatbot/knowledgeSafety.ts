export const KNOWLEDGE_SAFETY_ERROR = "This knowledge source could not be approved. Check that it contains readable company information and does not include credentials, private keys, executable instructions, prompt-injection text, or unrelated sensitive data.";

const SUSPICIOUS_CONTENT_PATTERNS: RegExp[] = [
  /<\s*(script|iframe|object|embed|form)\b/i,
  /(?:javascript|vbscript)\s*:/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{12,}\b/,
  /\b(?:api[_ -]?key|secret[_ -]?key|access[_ -]?token|password)\s*[:=]\s*\S+/i,
  /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|earlier|above)\s+(?:instructions?|messages?)/i,
  /\b(?:reveal|print|show|leak)\s+(?:the\s+)?(?:system prompt|developer message|hidden instructions?|credentials?|secrets?)/i,
];

function isControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 0 && code < 9) || (code > 13 && code < 32) || code === 127;
}

export function validateKnowledgeContent(value: unknown): string {
  const raw = String(value || "").replace(/\u0000/g, "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (!raw) throw new Error("The source contains no readable text.");
  if (raw.length < 20) throw new Error("Add more complete company information. A source must contain at least 20 readable characters.");
  if ([...raw].some(isControlCharacter)) throw new Error("The source contains malformed control characters and could not be safely indexed.");

  const printableCharacters = [...raw].filter((character) => character === "\n" || character === "\r" || character === "\t" || character.charCodeAt(0) >= 32).length;
  if (printableCharacters / raw.length < 0.98) throw new Error("The source appears malformed or binary. Upload a readable text-based PDF or paste plain text instead.");
  if (SUSPICIOUS_CONTENT_PATTERNS.some((pattern) => pattern.test(raw))) throw new Error(KNOWLEDGE_SAFETY_ERROR);

  return raw;
}

const COMPANY_ADMIN_ROLE_CONTENT_ERROR = "This source looks like platform or role-specific operating guidance. Company administrators can add company-wide facts only; ask the company owner to upload driver, kitchen, waiter, cleaning, page, or section guidance under the correct role scope.";
const ROLE_TERMS = "driver|kitchen|waiter|cleaning|shopping|client|owner|admin";
const ROLE_GUIDANCE_TERMS = "guide|manual|procedure|workflow|instruction|steps|dashboard|page|section|screen|portal|assign|dispatch|clock in|mark|update|how to|must|should";

export function validateCompanyAdminKnowledgeScope(sourceName: unknown, content: unknown): void {
  const text = `${String(sourceName || "")}\n${String(content || "")}`;
  const roleGuidance = new RegExp(`\\b(?:${ROLE_TERMS})\\b[\\s\\S]{0,120}\\b(?:${ROLE_GUIDANCE_TERMS})\\b|\\b(?:${ROLE_GUIDANCE_TERMS})\\b[\\s\\S]{0,120}\\b(?:${ROLE_TERMS})\\b`, "i");
  const platformGuidance = /\b(?:platform|system|cateringms)\b[\s\S]{0,120}\b(?:guide|manual|procedure|workflow|instruction|steps|dashboard|page|section|screen|portal|how to|must|should|use)\b/i;
  if (roleGuidance.test(text) || platformGuidance.test(text)) throw new Error(COMPANY_ADMIN_ROLE_CONTENT_ERROR);
}
