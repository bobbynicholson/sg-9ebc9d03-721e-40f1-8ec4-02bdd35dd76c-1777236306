import { classifyChatIntent, matchChatIntentById } from "@/lib/chatbot/intents/classifier";
import { buildCompleteChatIntentRegistry } from "@/lib/chatbot/intents/registry";
import { normalizeChatMessage } from "@/lib/chatbot/intents/normalize";
import type { ChatIntentMatch, IntentCatalogNavigation, IntentCatalogTool } from "@/lib/chatbot/intents/types";
import { NAVIGATION_REFS } from "@/lib/chatbot/navigation";
import { LIVE_TOOL_DEFINITIONS } from "./liveTools";
import { WORKFLOW_DEFINITIONS } from "@/lib/chatbot/workflows";
import { normalizeChatRole } from "@/lib/chatbot/roles";

const OPENAI_TIMEOUT_MS = 7_000;
const INTENT_MODEL = process.env.OPENAI_INTENT_MODEL || "gpt-4o-mini";

function catalog(additionalTools: readonly IntentCatalogTool[] = []): ReturnType<typeof buildCompleteChatIntentRegistry> {
  return buildCompleteChatIntentRegistry(
    [...LIVE_TOOL_DEFINITIONS as unknown as IntentCatalogTool[], ...additionalTools],
    NAVIGATION_REFS as unknown as IntentCatalogNavigation[],
    WORKFLOW_DEFINITIONS,
  );
}

function fallback(message: string, role: string, registry: ReturnType<typeof catalog>): ChatIntentMatch | null {
  const local = classifyChatIntent(message, role, registry);
  return local ? { ...local, matchedBy: "fallback" } : null;
}

function safeConfidence(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0;
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

/**
 * OpenAI proposes an intent; the application remains the authority. The
 * model receives only the role's allowlisted capabilities and can return only
 * an enum id. It never selects a table, SQL statement, URL, or tool arguments.
 */
export async function classifyChatIntentWithOpenAI(message: string, role: string, additionalTools: readonly IntentCatalogTool[] = []): Promise<ChatIntentMatch | null> {
  role = normalizeChatRole(role);
  const normalized = normalizeChatMessage(message);
  const registry = catalog(additionalTools);
  if (!normalized) return null;
  if (!process.env.OPENAI_API_KEY) return fallback(message, role, registry);

  const allowed = registry.filter((item) => item.roles.includes(role));
  if (!allowed.length) return fallback(message, role, registry);
  const intentIds = allowed.map((item) => item.id);
  const prompt = [
    "Classify the user's request into exactly one capability id from the allowlist.",
    "Use the authenticated role and normalized request. Choose a read intent for current data, a navigate intent when the user asks where/how to open a page, and account.help for general assistant help.",
    "Never invent an id. If no capability fits, use account.help and set needs_clarification true.",
    JSON.stringify({ authenticated_role: role, normalized_message: normalized, capabilities: allowed.map((item) => ({ id: item.id, domain: item.domain, action: item.action, entity: item.entity, description: item.description })) }),
  ].join("\n");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: INTENT_MODEL,
        store: false,
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
        text: {
          format: {
            type: "json_schema",
            name: "cateringms_chat_intent",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                intent_id: { type: "string", enum: intentIds },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                time_range: { type: "string", enum: ["today", "yesterday", "tomorrow", "this_week", "next_week", "this_month", "next_month", "last_90_days", "upcoming", "all", "unspecified"] },
                scope: { type: "string", enum: ["self", "company", "platform", "order", "unknown"] },
                needs_clarification: { type: "boolean" },
              },
              required: ["intent_id", "confidence", "time_range", "scope", "needs_clarification"],
            },
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI intent classification failed: ${response.status}`);
    const payload = await response.json();
    const parsed = JSON.parse(extractOutputText(payload));
    if (!intentIds.includes(String(parsed?.intent_id))) throw new Error("OpenAI returned an intent outside the allowlist");
    const match = matchChatIntentById(String(parsed.intent_id), message, role, registry);
    if (!match) throw new Error("OpenAI returned an intent not allowed for this role");
    return {
      ...match,
      confidence: safeConfidence(parsed.confidence),
      timeRange: parsed.time_range,
      scope: parsed.scope,
      needsClarification: parsed.needs_clarification === true,
      matchedBy: "openai",
    };
  } catch (error) {
    console.warn("[chatbot] OpenAI intent classification unavailable; using validated local fallback", error instanceof Error ? error.message : error);
    return fallback(message, role, registry);
  } finally {
    clearTimeout(timeout);
  }
}

export function getCompleteChatIntentCatalogForRole(role: string) {
  const normalizedRole = normalizeChatRole(role);
  return catalog().filter((item) => item.roles.includes(normalizedRole));
}
