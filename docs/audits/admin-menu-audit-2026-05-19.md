# `/admin/menu` (Menu) audit (2026-05-19)

**Scope:** 27th page of the admin per-page audit programme. Second in Catalogue group.

**File:** `src/pages/admin/menu.tsx`.

## Findings

| # | Finding | Severity |
|---|---|---|
| MEN-1 | 26 `as any` casts. No `@ts-nocheck`. | P2 |
| MEN-2 | `cost_per_unit` field role-gated correctly (owner / company_admin / admin / super_admin only); save respects gate. Verified ✓ per Skylight finance-visibility rule. | none |
| MEN-3 | Menu item save doesn't emit `cateringms:menu-updated` or realtime broadcast. Quote builder / order readiness / kitchen tablet / shopping forecast all stay stale across pages. | P2 |
| MEN-4 | `cost_per_unit` snapshotted into `order_items.unit_cost` at quote-accept. Historical reports stable. ✓ | none |
| MEN-5 | Buy-and-sell items require `linked_inventory_item_id`; form catches empty but no runtime check that the linked inventory item still exists / has stock. | P2 |
| MEN-6 | No recipe cost preview (ingredient roll-up vs cost_per_unit). | P3 |

## First-wave PRs
- MEN-A: Emit cateringms:menu-updated on save (MEN-3)
- MEN-B: Type-safety pass (MEN-1)
- MEN-C: Inventory existence check on linked items (MEN-5)
- MEN-D: Recipe cost preview (MEN-6)
