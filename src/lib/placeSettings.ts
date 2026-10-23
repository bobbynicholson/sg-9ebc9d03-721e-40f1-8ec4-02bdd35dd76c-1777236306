type NamedPiece = { name?: string | null; item_name?: string | null };

function placeSettingRank(item: NamedPiece): number {
  const name = String(item.item_name || item.name || "").toLowerCase();
  if (/salad|serving|container|crate|ladle|tongs/.test(name)) return -1;
  const rank = [/\bplates?\b/, /\b(?:knife|knives)\b/, /\bforks?\b/, /\bbowls?\b/, /\bspoons?\b/]
    .findIndex((pattern) => pattern.test(name));
  return rank;
}

/** Plate, knife, fork, bowl, spoon. Other equipment keeps its original slots. */
export function orderPlaceSettingItems<T extends NamedPiece>(items: readonly T[]): T[] {
  const pieces = items.map((item, index) => ({ item, index, rank: placeSettingRank(item) }))
    .filter(({ rank }) => rank >= 0).sort((a, b) => a.rank - b.rank || a.index - b.index);
  let next = 0;
  return items.map((item) => placeSettingRank(item) >= 0 ? pieces[next++].item : item);
}

/** Recover the intended package sequence after an unordered database IN query. */
export function restorePackageItemOrder<T extends { id: string }>(items: readonly T[], packageIds: ReadonlySet<string>): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = [...packageIds].map((id) => byId.get(id)).filter((item): item is T => !!item);
  let next = 0;
  return items.map((item) => packageIds.has(item.id) ? ordered[next++] : item);
}
