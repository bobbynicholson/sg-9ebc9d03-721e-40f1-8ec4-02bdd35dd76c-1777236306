const TYPO_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bupcomming\b/g, "upcoming"],
  [/\btodays\b/g, "today"],
  [/\btooo+\b/g, "too"],
  [/\btoo\s+less\b/g, "too low"],
  [/\bnot\s+enough\b/g, "too low"],
  [/\brunn?ing\s+out\b/g, "low stock"],
  [/\bshort[- ]fall\b/g, "shortage"],
];

const STOP_WORDS = new Set([
  "a", "about", "all", "am", "an", "and", "are", "at", "can", "do", "does", "for", "from",
  "have", "here", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "please", "the",
  "there", "to", "what", "which", "with", "you", "your",
]);

export function normalizeChatMessage(input: string): string {
  let normalized = String(input || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of TYPO_REPLACEMENTS) normalized = normalized.replace(pattern, replacement);
  return normalized.replace(/\s+/g, " ").trim();
}

export function intentTokens(input: string): string[] {
  return normalizeChatMessage(input)
    .split(/\s+/)
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}
