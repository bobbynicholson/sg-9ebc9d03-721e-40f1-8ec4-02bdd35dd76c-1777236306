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

function readableValue(value: unknown, depth = 0): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (depth > 2) return "";
  if (Array.isArray(value)) {
    return value.map((item) => readableValue(item, depth + 1)).filter(Boolean).join("; ");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const primary = record.label ?? record.title ?? record.name ?? record.task_name ?? record.order_number;
    const secondary = record.description ?? record.message ?? record.status;
    if (primary != null || secondary != null) {
      return [readableValue(primary, depth + 1), readableValue(secondary, depth + 1)]
        .filter(Boolean)
        .join(secondary != null ? ": " : "");
    }
    return Object.entries(record)
      .slice(0, 8)
      .map(([key, entry]) => {
        const text = readableValue(entry, depth + 1);
        return text ? `${key.replace(/_/g, " ")}: ${text}` : "";
      })
      .filter(Boolean)
      .join(" · ");
  }
  return String(value);
}

function cleanText(value: unknown): string {
  const links: string[] = [];
  const protectedText = readableValue(value).replace(/\[[^\]]+\]\([^)]*\)/g, (link) => {
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

function readJsonStringField(raw: string, field: string): string | null {
  const key = raw.match(new RegExp(`\\"${field.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\"\\s*:`));
  if (!key || key.index == null) return null;
  let index = key.index + key[0].length;
  while (/\s/.test(raw[index] || "")) index += 1;
  if (raw[index] !== '"') return null;
  const start = index;
  index += 1;
  let escaped = false;
  for (; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      try {
        return JSON.parse(raw.slice(start, index + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function readPartialDetails(raw: string): string[] {
  const key = raw.match(/"details"\s*:\s*\[/i);
  if (!key || key.index == null) return [];
  let index = key.index + key[0].length;
  const values: string[] = [];
  while (index < raw.length) {
    while (/\s|,/.test(raw[index] || "")) index += 1;
    if (raw[index] === "]") break;
    if (raw[index] !== '"') {
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    let escaped = false;
    let closed = false;
    for (; index < raw.length; index += 1) {
      const char = raw[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        try {
          values.push(JSON.parse(raw.slice(start, index + 1)));
        } catch {
          // Ignore a detail that was itself cut off or malformed.
        }
        index += 1;
        closed = true;
        break;
      }
    }
    if (!closed) break;
  }
  return values;
}

function salvagePartialPayload(raw: string): Record<string, unknown> | null {
  const message = readJsonStringField(raw, "message");
  if (!message) return null;
  const title = readJsonStringField(raw, "title");
  return {
    ...(title ? { title } : {}),
    message,
    details: readPartialDetails(raw),
  };
}

function parsePayload(raw: string): { payload: Record<string, unknown>; structured: boolean } {
  const candidates = [raw.trim()];
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) candidates.push(match[0]);
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object" && (typeof (value as any).message === "string" || ((value as any).message && typeof (value as any).message === "object"))) {
        return { payload: value as Record<string, unknown>, structured: true };
      }
    } catch {
      // The model may have returned ordinary text. That is a valid fallback.
    }
    const partial = salvagePartialPayload(candidate);
    if (partial) return { payload: partial, structured: true };
  }
  return { payload: { message: raw }, structured: false };
}

function nestedResponsePayload(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (
      typeof record.message === "string" ||
      (record.message && typeof record.message === "object" && !Array.isArray(record.message))
    ) {
      return record;
    }
    return null;
  }
  if (typeof value !== "string") return null;
  const nested = parsePayload(value);
  return nested.structured ? nested.payload : null;
}

function responseInputText(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw);
    } catch {
      return readableValue(raw);
    }
  }
  return String(raw).trim();
}

function details(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item)).filter(Boolean).slice(0, 24);
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
  const rawText = responseInputText(raw);
  const parsed = parsePayload(rawText);
  // Providers and older persisted messages can wrap a structured live-data
  // payload inside an outer "Current information" message. Unwrap those
  // layers here so every caller gets one consistent human-readable response.
  let payload = parsed.payload;
  for (let depth = 0; depth < 3; depth += 1) {
    const nestedValue = payload.message;
    const nestedMessage = nestedResponsePayload(nestedValue);
    if (nestedMessage) {
      payload = { ...payload, ...nestedMessage };
      continue;
    }

    // Some live-tool adapters put the structured answer in a detail row while
    // leaving the outer guidance sentence in `message`. Unwrap that shape too;
    // otherwise the browser receives the inner JSON as a visible bullet.
    const nestedDetail = Array.isArray(payload.details)
      ? payload.details.map(nestedResponsePayload).find(Boolean)
      : null;
    if (nestedDetail) {
      payload = { ...payload, ...nestedDetail };
      continue;
    }

    break;
  }
  const message = cleanText(payload.message) || "I'm here to help.";
  const title = cleanText(payload.title);
  const renderedDetails = details(payload.details);
  const renderedActions = actions(payload.actions);
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

/**
 * Final response boundary shared by every chatbot entry point. Keep this
 * named separately so API handlers, persisted-history loaders, tests, and
 * future channels can call the same beautifier without knowing the payload
 * shape returned by a model or live tool.
 */
export function beautifyChatResponse(raw: unknown): ChatResponsePayload {
  return renderChatResponse(raw);
}
