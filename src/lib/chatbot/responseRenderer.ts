export interface ChatAction {
  label: string;
  action?: string;
}

export interface ChatTraceStep {
  id: string;
  type: "plan" | "search" | "database" | "verification" | "final";
  title: string;
  status: "completed" | "skipped" | "failed";
  detail?: string;
}

export interface ChatWorkflowStep {
  id: string;
  title: string;
  description: string;
  ref: string;
  href: string;
  targetType: "page" | "section" | "tab" | "record";
}

export interface ChatWorkflow {
  id: string;
  label: string;
  description: string;
  steps: ChatWorkflowStep[];
}

export interface ChatResponsePayload {
  message: string;
  title: string;
  details: string[];
  actions: ChatAction[];
  text: string;
  style: "structured" | "clean_text";
  trace?: ChatTraceStep[];
  workflow?: ChatWorkflow;
}

function cleanText(value: unknown): string {
  const links: string[] = [];
  const protectedText = String(value || "").replace(/\[[^\]]+\]\([^)]*\)/g, (link) => {
    const token = `§§CMS_CHAT_LINK_${links.length}§§`;
    links.push(link);
    return token;
  });
  let cleaned = protectedText
    .replace(/```(?:json|text)?/gi, "")
    .replace(/```/g, "")
    .replace(/\[\s*source[^\]]*\]/gi, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*•]\s*/gm, "")
    .replace(/\blive workspace data\b/gi, "current information")
    .replace(/\bcompany count\b/gi, "registered companies")
    .replace(/\bdatabases?\b/gi, "company records")
    .replace(/\btenants?\b/gi, "companies")
    .replace(/\bmetadata\b/gi, "details")
    .replace(/\bprovider\b/gi, "service")
    // Some older files were saved with a curly apostrophe decoded twice.
    // Normalise both that form and a normal contraction before the message
    // reaches the chat bubble.
    .replace(/couldn.{0,4}t/gi, "could not")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  links.forEach((link, index) => {
    cleaned = cleaned.replace(`§§CMS_CHAT_LINK_${index}§§`, link);
  });
  return cleaned;
}

function parsePayload(raw: string): { payload: Record<string, unknown>; structured: boolean } {
  const candidates = [raw.trim()];
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) candidates.push(match[0]);
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object" && typeof (value as any).message === "string") {
        return { payload: value as Record<string, unknown>, structured: true };
      }
    } catch {
      // The model may have returned ordinary text. That is a valid fallback.
    }
  }
  return { payload: { message: raw }, structured: false };
}

function details(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean).slice(0, 6);
}

function actions(value: unknown): ChatAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { label: cleanText(item), action: "" };
      if (item && typeof item === "object" && (item as any).label) {
        return { label: cleanText((item as any).label), action: String((item as any).action || "") };
      }
      return null;
    })
    .filter((item): item is { label: string; action: string } => !!item?.label)
    .slice(0, 4);
}

/**
 * Shared-brain response contract based on call-agent's response_renderer.py.
 * It keeps model formatting out of the UI and guarantees readable output when
 * a provider returns JSON, markdown, or plain text.
 */
export function renderChatResponse(raw: unknown): ChatResponsePayload {
  const rawText = String(raw || "").trim();
  const parsed = parsePayload(rawText);
  const message = cleanText(parsed.payload.message) || "I'm here to help.";
  const title = cleanText(parsed.payload.title);
  const renderedDetails = details(parsed.payload.details);
  const renderedActions = actions(parsed.payload.actions);
  const blocks = [title, message].filter(Boolean);
  if (renderedDetails.length) blocks.push(renderedDetails.map((item) => `• ${item}`).join("\n"));
  if (renderedActions.length) blocks.push(`Next: ${renderedActions.map((item) => item.label).join(" · ")}`);
  return {
    message,
    title,
    details: renderedDetails,
    actions: renderedActions,
    text: blocks.join("\n\n").trim(),
    style: parsed.structured ? "structured" : "clean_text",
  };
}
