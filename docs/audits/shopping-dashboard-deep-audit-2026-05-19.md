# `/team-portal/shopping/dashboard` (Shopping staff dashboard) - deep audit (2026-05-19)

**Scope:** Replaces the earlier shallow `shopping-dashboard-audit-2026-05-19.md`
(5 cursory items). Deep pass per Bobby's "1000 hours per page" brief.

The shopping staff dashboard is the screen the shopper looks at while
standing in the aisle at Makro / Boxer / Food Lover's, phone in one hand,
trolley in the other. Print sheet shipped in SHP2-A; chain reaction back
into inventory / cashflow has never been audited.

**Test tenant:** Spit Braai Delivery.

**File:** `src/pages/team-portal/shopping/dashboard.tsx` (488 lines incl. print block).

**Hook:** `src/hooks/useActiveShoppingList.ts` (326 lines).

**Siblings cross-checked:** `alerts`, `buy-list`, `inventory`, `invoices`,
`kitchen-demand`, `notifications`, `orders`, `receipts`, `settings`, `suppliers`.

---

## A. What's on the page

1. **DynamicNav** (shopping_staff role) - line 118. Delegates to `ShoppingNav`.
2. **Header strip** - cart icon, "Shopping Dashboard", dynamic subtitle.
3. **TeamWelcomeBanner** (role=shopping).
4. **Loading state** (Loader2 spinner).
5. **Empty state** (no active list) - Sparkles icon + CTA to /buy-list.
6. **Active list hero card** - title + "Your list" / "Team list" badge + status;
   inside: gradient box with "Items left to buy" big number, "Estimated cost"
   right-aligned, four-button action row (Add more / Snap receipt / Print / Mark complete).
7. **Metric cards** - Total items / Remaining / Bought / List date.
8. **Filter chips** - Remaining / All / Bought + Refresh.
9. **Items list** - per row: checkbox, name + qty/unit badge, optional notes, trailing icon.
10. **Error text** (when activeList.error).
11. **Footer**.
12. **Complete-list dialog** - actual_total input + Cancel / Mark complete.
13. **Print-only block** (SHP2-A receipt sheet).
14. **Print CSS** - global `@media print`.
15. **ChatBot** (role=shopping).

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| SHP2-6 | File-level eslint-disable for `no-explicit-any` (line 19); only one `as any` actually exists on the page (line 59). Real debt is in `useActiveShoppingList.ts` (5+ `as any` casts). | P2 | 19, 59 |
| SHP2-7 | **No `ProtectedRoute` / `allowedRoles` guard.** Every admin dashboard wraps in ProtectedRoute. This page does not. | **P1** | 111-487 |
| SHP2-8 | 488-line component with inline 40-line print block + 17-line global print CSS. Extract `<ShoppingListPrintSheet>`. | P2 | 425-483 |
| SHP2-9 | actual_total input has no upper bound / decimals clamp. | P3 | 66, 92-97 |
| SHP2-10 | Print CSS registered while list is still loading - print on first paint = empty sheet. | P3 | 140-146, 467 |
| SHP2-11 | Cosmetic key strategy on filter chips. | P3 | 285-295 |
| SHP2-12 | Refresh button has no debouncing - five rapid taps fire five overlapping `load()`s. | P3 | 296-300 |
| SHP2-13 | `useActiveShoppingList` is not memoised across dashboard / buy-list / orders pages. Three tabs = three separate states. Should be context-lifted. | P2 | 61 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| SHP2-14 | No `deleted_at IS NULL` filter on `shopping_lists` reads. | **P1** | hook 109-132 |
| SHP2-15 | No `deleted_at IS NULL` filter on `shopping_list_items`. | **P1** | hook 159-164 |
| SHP2-16 | `actual_total` stored without currency tag. Tenant currency switch invalidates the number. | P2 | 66, hook 303 |
| SHP2-17 | No variance display (estimated vs actual). Single most-asked dashboard metric. | P2 | 198-205 |
| SHP2-18 | `new Date(list_date)` locale-dependent - Safari iOS parses YYYY-MM-DD as UTC. | P2 | 278 |
| SHP2-19 | `estimated_total` not recalculated when shopper edits a row's quantity in /buy-list. | P2 | 80 |
| SHP2-20 | Two queries (mine + unassigned) race on reassignment mid-load. Should be one OR query with deterministic tie-break. | P2 | hook 109-135 |
| SHP2-21 | `isYours` computed in JS, not server. RLS belt-and-braces missing. | P3 | hook 119-135 |

### B.3 Chain reactions

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| SHP2-22 | **CRITICAL: ticking an item purchased does NOT bump `inventory_items.current_stock`.** Admin `/admin/shopping` does. Net effect: staff dashboard is "vibes only" - tick has no system-side effect on inventory / kitchen demand / cashflow / admin shopping view. **Two roles operating the same "purchase" action with different downstream effects.** | **P0** | hook 188-202 |
| SHP2-23 | No emit of `cateringms:shopping-updated`. Admin /admin/shopping in another tab doesn't flip when staff ticks. | **P1** | hook 188-202 |
| SHP2-24 | `completeList` doesn't fan out to cashflow / payables / admin badge. | **P1** | hook 294-313 |
| SHP2-25 | No realtime sub on `shopping_list_items` for the active list - multi-device tick stale until tab refocus. | **P1** | hook (missing) |
| SHP2-26 | No realtime sub on `shopping_lists`. Admin reassignment of the list doesn't surface. | P2 | hook (missing) |
| SHP2-27 | `focus` event is the only freshness mechanism. Should pair with `visibilitychange` + 60s poll fallback. | P2 | hook 182-186 |
| SHP2-28 | "Mark list complete" doesn't create `supplier_payables` or link the receipt. | **P1** | hook 294-313 |
| SHP2-29 | No emit on add-item / add-items - bulk-add to a list elsewhere doesn't propagate. | P2 | hook 230-292 |
| SHP2-30 | Print button no analytics event. | P3 | 223-236 |

### B.4 Role / visibility mapping

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| SHP2-31 | No allowedRoles guard. (Already SHP2-7.) | **P1** | 111-487 |
| SHP2-32 | Admin trio cannot view this page "as the shopper". No `?as=user_uuid` impersonation. | P2 | hook 92, 114 |
| SHP2-33 | No COGS / margin leak - per Skylight finance-visibility rule the boundary is correct. ✓ | none | 198-205 |
| SHP2-34 | `Estimated cost` rendered with 0 decimals - "R 1 423" when source has "R 1 423.45". | P2 | 202 |
| SHP2-35 | No PII access logging on (future) supplier contact peek. | P3 | (future) |
| SHP2-36 | `(user as any).company_id` trusts auth context shape. | P3 | 59 |

### B.5 Cross-dashboard placement

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| SHP2-37 | **No supplier-contact peek.** Shopper in-store can't one-tap-dial the supplier from the dashboard. | **P1** | (missing) |
| SHP2-38 | **No kitchen-demand peek.** No "buying for these N events" line. | **P1** | (missing) |
| SHP2-39 | No outstanding-receipts peek. | P2 | 214-219 |
| SHP2-40 | No buy-list shortfall count badge. | P2 | 208-213 |
| SHP2-41 | "List date" metric tile carries low information density. | P2 | 274-280 |
| SHP2-42 | TeamWelcomeBanner may be dead weight without a SHOPPING variant. | P3 | 137 |
| SHP2-43 | Four buttons in the action row overflow on tablets. | P2 | 207-246 |
| SHP2-44 | No recent-runs history strip. | P3 | (missing) |

### B.6 UX / UI (shopper in a supermarket, one-handed, supermarket lighting)

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| SHP2-45 | Checkbox is 20px tap target. Row should be the toggle (44px). | **P1** | 328-364 |
| SHP2-46 | No swipe-right-to-tick gesture. | P2 | 327-365 |
| SHP2-47 | **No search-while-walking input.** Sibling pages use useFuzzyItems. | **P1** | 304-369 |
| SHP2-48 | **No per-supplier grouping / filter.** Shopper at 3 supermarkets sees one flat list. | **P1** | 304-369 |
| SHP2-49 | **No barcode scan FAB.** | **P1** | (missing) |
| SHP2-50 | No voice notes per item. | P2 | (missing) |
| SHP2-51 | **No "out of stock here" flag.** | **P1** | (missing) |
| SHP2-52 | **No offline grace.** Losing signal mid-aisle = silent failed update + revert on refresh. Need IndexedDB queue. | **P1** | hook 188-202 |
| SHP2-53 | Print sheet has no per-supplier grouping. | P2 | 434-461 |
| SHP2-54 | Print sheet has no estimated total / cost column. | P2 | 434-461 |
| SHP2-55 | Print sheet footer not page-break-protected. | P3 | 462-464 |
| SHP2-56 | Print button copy is bare "Print". | P3 | 234-235 |
| SHP2-57 | No haptic on tick. | P2 | 83-85 |
| SHP2-58 | Filter chips order reads off. | P3 | 285 |
| SHP2-59 | Hero contrast marginal under supermarket lighting (WCAG 4.4:1). | P2 | 187-205 |
| SHP2-60 | No "complete + auto-snap receipt" combined flow. | P2 | 87-109, 384-419 |
| SHP2-61 | Dead-end empty state in "Bought" filter. | P3 | 312-325 |
| SHP2-62 | No skeleton in loading state. | P3 | 140-146 |
| SHP2-63 | No keyboard shortcut for power users. | P3 | 327-365 |
| SHP2-64 | No InfoTooltip on dashboard - all sibling pages have them. | P3 | 187-205 |

### B.7 Performance

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| SHP2-65 | `shopping_list_items` SELECT * with no column projection. | P3 | hook 161 |
| SHP2-66 | `shopping_lists` SELECT *. | P3 | hook 112, 127 |
| SHP2-67 | `load()` does 2-3 round-trips. Should be one RPC. | P2 | hook 109-172 |
| SHP2-68 | No useMemo on bought/remaining/filteredItems. | P3 | 69-75 |
| SHP2-69 | Inline onCheckedChange arrow breaks React.memo. | P3 | 338 |
| SHP2-70 | No request abort on focus-event refetch. | P3 | hook 182-186 |
| SHP2-71 | Print block re-renders full items array as DOM on every render. 500-item list = 500 hidden rows. | P2 | 425-465 |

### B.8 Missing features

| # | Finding | Severity |
|---|---|---|
| SHP2-72 | Barcode scan (SHP2-49). | **P1** |
| SHP2-73 | Voice notes (SHP2-50). | P2 |
| SHP2-74 | "Out of stock here" (SHP2-51). | **P1** |
| SHP2-75 | Per-supplier grouping (SHP2-48). | **P1** |
| SHP2-76 | Receipt OCR auto-fill of actual_total. | **P1** |
| SHP2-77 | Offline queue (SHP2-52). | **P1** |
| SHP2-78 | In-store substitution memory. | P2 |
| SHP2-79 | Cash-float tracking. | P2 |
| SHP2-80 | "Need more cash" one-tap to admin. | P2 |
| SHP2-81 | Per-item damage photo. | P3 |
| SHP2-82 | Allergen / spec callout on item row. | P2 |
| SHP2-83 | "Sub-list per stop" route-optimised tour. | P2 |
| SHP2-84 | Mileage / fuel claim capture. | P2 |
| SHP2-85 | "Can't find it" escalation. | P3 |

---

## C. Priority fix list

**P0** (broken / data-integrity-critical):
- **SHP2-22**: Tick-to-purchase must bump `inventory_items.current_stock`

**P1** (UX critical + one-source-of-truth + missing-feature):
- SHP2-7 / SHP2-31: ProtectedRoute wrapper
- SHP2-14 / SHP2-15: Soft-delete guards
- SHP2-23 / SHP2-24: Cross-tab event emits
- SHP2-25: Realtime sub on shopping_list_items
- SHP2-28: completeList writes payables + links receipt
- SHP2-37: Supplier-contact peek
- SHP2-38: Kitchen-demand peek
- SHP2-45: Row-tap toggle (44px)
- SHP2-47: Search-while-walking
- SHP2-48 / SHP2-75: Per-supplier grouping
- SHP2-49 / SHP2-72: Barcode scan FAB
- SHP2-51 / SHP2-74: "Out of stock here"
- SHP2-52 / SHP2-77: Offline queue
- SHP2-76: ReceiptScanner OCR auto-fill

**P2 / P3**: see findings tables.

---

## D. First-wave PRs

| PR | Title | Scope |
|---|---|---|
| SHP2-B | **Inventory chain-reaction on tick** (SHP2-22, P0) | `togglePurchased` bumps `inventory_items.current_stock` by quantity (decrement on untick). Mirrors admin /admin/shopping pattern. Also emits cateringms:shopping-updated. |
| SHP2-C | **Realtime sub + cross-tab signal** (SHP2-23, 24, 25, 26, 29) | Hook installs Supabase realtime channel on `shopping_list_items` filtered by `shopping_list_id`. Emits on add / toggle / complete. |
| SHP2-D | **Role guard + soft-delete guards** (SHP2-7, 14, 15, 31) | ProtectedRoute wrapper + `.is("deleted_at", null)` on both queries. |
| SHP2-E | **Mark Complete = receipt scan in one flow** (SHP2-60, 76, 28) | Dialog adds ReceiptScanner + writes supplier_payables. |
| SHP2-F | **Per-supplier grouping + supplier peek card** (SHP2-37, 48, 53, 75) | Collapsible sections by `preferred_supplier_id` + tap-to-call supplier peek. |
| SHP2-G | **Row-tap + search + haptic + offline queue** (SHP2-45, 47, 52, 57, 77) | Row-level onClick, fuzzy search input, navigator.vibrate, IndexedDB queue. |
| SHP2-H | **Barcode scan FAB** (SHP2-49, 72) | BarcodeDetector camera modal. |
| SHP2-I | **"Out of stock here" affordance** (SHP2-51, 74) | Per-row kebab + admin notification. |
| SHP2-J | **Cross-page peeks** (SHP2-38, 39, 40, 41, 44) | Replace List date tile with 3-up peek strip. |

---

## E. Cross-page chain-reaction verification list

When the shopper ticks an item purchased on the dashboard, the following surfaces should react without manual refresh. Verify each:

1. `inventory_items.current_stock` increments. **Before SHP2-B: NO.**
2. `/team-portal/shopping/inventory` row updates. **Before SHP2-B: NO.**
3. `/team-portal/shopping/buy-list` drops item from "below par". **Before SHP2-B: NO.**
4. `/team-portal/shopping/kitchen-demand` recalculates. **Before SHP2-B: NO.**
5. `/admin/shopping` row reflects purchased. **Before SHP2-C: NO.**
6. `/admin/inventory` stock + transaction log. **Before SHP2-B: NO.**
7. `/admin/financial-dashboard` cashflow refresh. **Before SHP2-C: NO.**
8. Multi-device sync. **Before SHP2-C: only on focus.**

When "Mark list complete":

9. `shopping_lists.status = completed`. **Today: YES** ✓
10. `supplier_payables` row created. **Before SHP2-E: NO.**
11. Receipt URL linked. **Before SHP2-E: NO** (separate /receipts flow).
12. Variance logged. **Before SHP2-E: NO.**
13. Cashflow committed -> actual. **Before SHP2-E: NO.**
14. Admin badge clears. **Before SHP2-C: NO.**

---

**Sign-off:** 80 numbered findings (SHP2-6 through SHP2-85). P0 = 1 item
(SHP2-22, inventory chain gap), P1 = 14 items, first-wave PRs = 9.
The single highest-leverage change in the entire shopping subsystem is
closing SHP2-22 - one toggle becoming a real downstream effect.
