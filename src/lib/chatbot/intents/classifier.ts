import { intentTokens, normalizeChatMessage } from "./normalize";
import { CHAT_INTENT_REGISTRY } from "./registry";
import type { ChatIntentMatch } from "./types";
import type { ChatIntentDefinition } from "./types";
import { normalizeChatRole } from "../roles";

function phraseTokenScore(messageTokens: Set<string>, phrase: string): number {
  const phraseTokens = intentTokens(phrase);
  if (!phraseTokens.length) return 0;
  const overlap = phraseTokens.filter((token) => messageTokens.has(token)).length;
  return overlap / phraseTokens.length;
}

function toMatch(definition: ChatIntentDefinition, normalizedMessage: string, confidence: number, matchedBy: ChatIntentMatch["matchedBy"]): ChatIntentMatch {
  const timeRange = /\byesterday\b/.test(normalizedMessage) ? "yesterday"
    : /\btoday\b/.test(normalizedMessage) ? "today"
    : /\btomorrow\b/.test(normalizedMessage) ? "tomorrow"
      : /\bnext week\b/.test(normalizedMessage) ? "next_week"
        : /\bthis week\b/.test(normalizedMessage) ? "this_week"
          : /\bnext month\b/.test(normalizedMessage) ? "next_month"
            : /\bthis month\b/.test(normalizedMessage) ? "this_month"
              : /\b(?:upcoming|future)\b/.test(normalizedMessage) ? "upcoming"
                : /\b(?:last|past) 90 days\b/.test(normalizedMessage) ? "last_90_days" : "unspecified";
  const scope = /\b(?:platform|all companies|every company)\b/.test(normalizedMessage) ? "platform"
    : /\b(?:order|booking|event)\b/.test(normalizedMessage) ? "order"
      : /\b(?:my|mine|assigned to me)\b/.test(normalizedMessage) ? "self"
        : /\b(?:company|team|all staff|everyone)\b/.test(normalizedMessage) ? "company" : "unknown";
  return { id: definition.id, domain: definition.domain, action: definition.action, entity: definition.entity,
    toolIds: [...definition.toolIds], navigationRefs: [...definition.navigationRefs], confidence,
    normalizedMessage, matchedBy, timeRange, scope };
}

export function classifyChatIntent(input: string, role?: string, registry: readonly ChatIntentDefinition[] = CHAT_INTENT_REGISTRY): ChatIntentMatch | null {
  const normalizedMessage = normalizeChatMessage(input);
  if (!normalizedMessage) return null;
  role = role ? normalizeChatRole(role) : role;
  const messageTokens = new Set(intentTokens(normalizedMessage));
  const candidates = registry.filter((definition) => !role || definition.roles.includes(role));
  const scored = candidates.map((definition) => {
    const patternMatch = definition.patterns?.some((pattern) => pattern.test(normalizedMessage)) || false;
    const exactPhrase = definition.phrases.some((phrase) => normalizedMessage.includes(normalizeChatMessage(phrase)));
    const phraseScore = Math.max(...definition.phrases.map((phrase) => phraseTokenScore(messageTokens, phrase)), 0);
    const keywordHits = definition.keywords.filter((keyword) => normalizedMessage.includes(normalizeChatMessage(keyword))).length;
    const keywordScore = definition.keywords.length ? keywordHits / Math.min(definition.keywords.length, 6) : 0;
    const confidence = patternMatch
      ? 0.96
      : exactPhrase
        ? 0.92
        : Math.min(0.89, 0.42 + phraseScore * 0.32 + keywordScore * 0.22);
    return { definition, confidence, patternMatch, exactPhrase, keywordHits };
  })
    .filter((candidate) => candidate.patternMatch || candidate.exactPhrase || candidate.keywordHits >= 2)
    .sort((left, right) => right.confidence - left.confidence || right.definition.priority - left.definition.priority);
  const best = scored[0];
  if (!best || best.confidence < 0.55) return null;
  return toMatch(best.definition, normalizedMessage, best.confidence, "registry");
}

/** Only accepts an id already present in the server-built catalog. */
export function matchChatIntentById(id: string, input: string, role: string | undefined, registry: readonly ChatIntentDefinition[]): ChatIntentMatch | null {
  role = role ? normalizeChatRole(role) : role;
  const definition = registry.find((item) => item.id === id && (!role || item.roles.includes(role)));
  return definition ? toMatch(definition, normalizeChatMessage(input), 0.99, "openai") : null;
}
