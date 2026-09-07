import type { ChatIntentMatch } from "./types";

export function getIntentToolIds(intent: ChatIntentMatch | null, role: string, allowedToolIds?: Set<string>): string[] {
  if (!intent || intent.confidence < 0.55) return [];
  return intent.toolIds.filter((toolId) => !allowedToolIds || allowedToolIds.has(toolId));
}

export function getIntentNavigationRefs(intent: ChatIntentMatch | null, role: string): string[] {
  if (!intent || intent.confidence < 0.55) return [];
  return [...intent.navigationRefs];
}

export function intentNeedsLiveData(intent: ChatIntentMatch | null): boolean {
  return Boolean(intent && intent.toolIds.length && intent.confidence >= 0.55);
}
