const TYPO_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bupcomming\b/g, "upcoming"],
  [/\btodays\b/g, "today"],
  [/\btooo+\b/g, "too"],
  [/\btoo\s+less\b/g, "too low"],
  [/\bnot\s+enough\b/g, "too low"],
  [/\brunn?ing\s+out\b/g, "low stock"],
  [/\bshort[- ]fall\b/g, "shortage"],
];

// Correct likely misspellings against the assistant's known vocabulary rather
// than maintaining one regex for every typo. This deliberately excludes
// arbitrary words so event names and other proper nouns are preserved.
const FUZZY_CANONICAL_TERMS = [
  "this", "week", "next", "month", "today", "tomorrow", "yesterday", "upcoming", "future",
  "event", "events", "order", "orders", "work", "job", "jobs", "task", "tasks", "prep", "production",
  "schedule", "scheduled", "kitchen", "stock", "inventory", "ingredient", "ingredients", "item", "items",
  "delivery", "deliveries", "collection", "collections", "driver", "waiter", "cleaning", "cleaner",
  "shopping", "supplier", "notification", "notifications", "password", "profile", "security", "help",
  "assigned", "available", "completed", "pending", "current", "anything", "something", "have", "show",
] as const;
const FUZZY_CANONICAL_TERM_SET = new Set<string>(FUZZY_CANONICAL_TERMS);
const FUZZY_TERMS_BY_LENGTH = new Map<number, readonly string[]>();
const FUZZY_TOKEN_CACHE = new Map<string, string>();
for (const term of FUZZY_CANONICAL_TERMS) {
  const terms = FUZZY_TERMS_BY_LENGTH.get(term.length) || [];
  FUZZY_TERMS_BY_LENGTH.set(term.length, [...terms, term]);
}

const STOP_WORDS = new Set([
  "a", "about", "all", "am", "an", "and", "are", "at", "can", "do", "does", "for", "from",
  "have", "here", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "please", "the",
  "there", "to", "what", "which", "with", "you", "your",
]);

function editDistance(left: string, right: string): number {
  // Optimal-string-alignment distance includes adjacent transpositions, so
  // `hti` can resolve to `this` without a special-case typo rule.
  const matrix = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) matrix[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }
  return matrix[left.length][right.length];
}

function correctKnownTypos(message: string): string {
  return message.split(" ").map((token) => {
    if (token.length < 3) return token;
    // Function words are deliberately never fuzzy-rewritten. They are common
    // enough that a valid word such as `does` can be equally close to a
    // business term such as `jobs`.
    if (STOP_WORDS.has(token)) return token;
    if (FUZZY_CANONICAL_TERM_SET.has(token)) return token;
    const cached = FUZZY_TOKEN_CACHE.get(token);
    if (cached) return cached;
    // Very short words can contain a transposition plus a missing/extra
    // letter, such as `hti` -> `this`. For four or more characters, only a
    // one-edit correction is safe; a two-edit threshold incorrectly turned
    // valid words such as `team` into `item` and `give` into `have`.
    const maxDistance = token.length <= 3 ? 2 : 1;
    const candidates = Array.from({ length: maxDistance * 2 + 1 }, (_, index) => token.length - maxDistance + index)
      .flatMap((length) => FUZZY_TERMS_BY_LENGTH.get(length) || [])
      .map((term) => ({ term, distance: editDistance(token, term) }))
      .filter((candidate) => candidate.distance <= maxDistance)
      .sort((left, right) => left.distance - right.distance || left.term.length - right.term.length);
    if (!candidates.length) {
      FUZZY_TOKEN_CACHE.set(token, token);
      return token;
    }
    const best = candidates[0];
    const second = candidates[1];
    // Avoid guessing when two canonical terms are equally close.
    if (second && second.distance === best.distance) {
      FUZZY_TOKEN_CACHE.set(token, token);
      return token;
    }
    FUZZY_TOKEN_CACHE.set(token, best.term);
    return best.term;
  }).join(" ");
}

export function normalizeChatMessage(input: string): string {
  let normalized = String(input || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of TYPO_REPLACEMENTS) normalized = normalized.replace(pattern, replacement);
  return correctKnownTypos(normalized.replace(/\s+/g, " ").trim());
}

export function intentTokens(input: string): string[] {
  return normalizeChatMessage(input)
    .split(/\s+/)
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}
