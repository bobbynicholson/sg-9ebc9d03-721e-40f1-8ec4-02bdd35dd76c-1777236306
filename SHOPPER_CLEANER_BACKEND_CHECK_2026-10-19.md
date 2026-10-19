# Shopper and cleaner backend check

## Verdict

**No: the pages are connected to real backend data, but not every feature works correctly.** Shopping settings reads a real saved company row. Some controls are unfinished, some settings are not enforced, and at least one inventory action targets a nonexistent live database column.

Scope: all shopping and cleaning page source files, authenticated page/read checks, settings checked as shopper, cleaner, cleaning manager and company admin where applicable. “All pages” is interpreted in the ongoing shopper/cleaner task context; this is not a whole-application audit of every admin, kitchen, driver, client and platform route.

## Shopping settings: exact answer

URL: http://localhost:3001/spit-braai-delivery/team-portal/shopping/settings

Read-only authenticated probes returned HTTP 200 and one saved `company_shopping_settings` row for shopper, cleaner and company admin. The table is present; the displayed values need not come from browser defaults. Current saved values: receipt required **true**, lead time **2 days**, variance threshold **15%**, notify admin **true**. The saved timestamp is July 2026; this check did not change it.

| Control | Actual implementation |
|---|---|
| Require a receipt to close a list | Consumed in the active-list hook and Active shop completion page. Database/server enforcement is not established by these UI gates. |
| Default lead time | Read by `inventoryService.suggestReorderQuantity` and `suggestMinMaxFromHistory`, but a whole-`src` search found only the method definitions, no callers. The “Live” badge overstates demonstrated behavior. |
| Variance threshold | Consumed by cost-variance logic, but **0% is incorrectly treated as the default 15%**. |
| Notify admin on variance | Consumed by `recordShoppingCostVariance`; notification delivery was not triggered in this check. |
| Auto-create lists | Explicitly disabled / Coming soon; no operational consumer found. |
| Upcoming-event horizon | Explicitly disabled / Coming soon; no operational consumer found. |
| Prefer rated suppliers | Explicitly disabled / Coming soon; no operational consumer found. |
| Auto-notify on low stock | Explicitly disabled / Coming soon; no consumer of this setting found. Existing alerts elsewhere are not proof this toggle controls them. |

Shopping staff intentionally has a view-only form. Editors are owner/company admin/admin/super admin. The page's role guard and migration define that distinction. Real save persistence and live write-policy enforcement were **not** exercised because that would change company policy on the live backend.

### Settings defects confirmed in source or isolated execution

1. **Zero threshold ignored.** Save accepts 0; `getShoppingCostVariance` and `recordShoppingCostVariance` accept only positive thresholds and fall back to 15%. An isolated execution of actual transpiled code saved 0 in a fake database and did not flag a 10% variance.
2. **Read errors hidden.** `getShoppingSettings` silently returns defaults for permission/network errors. The page can display “Synced across your team” while showing fallback values. A mocked permission-denied response confirmed no error is exposed.
3. **Lead-time control has no demonstrated active caller.** Helper methods use it, but no caller was found under `src`. Draft reorder and proactive restock use other quantity formulas.
4. **Normalized save can differ from the displayed saved value.** Save rounds/clamps numeric inputs, but the UI takes its pre-normalized state as the saved snapshot without reading the saved row back. A decimal or out-of-range value can look saved until reload shows a different value.

Evidence: `src/services/shopping/shoppingSettingsService.ts`, `src/lib/shopping/completionRules.ts`, `src/services/shoppingCompletionService.ts`, `src/pages/team-portal/shopping/settings.tsx`, `src/services/inventoryService.ts:944` and `:1003`.

## Additional backend defects

### High: inventory Draft reorder uses a nonexistent column

`src/pages/api/admin/inventory/draft-reorder.ts` builds shopping items with `inventory_item_id` and `item_name`. The shopper hook uses `item_id` and `name`.

An authenticated, zero-row SELECT against the configured live database returned **400 / 42703: column shopping_list_items.inventory_item_id does not exist**, for all three probed roles. The canonical `item_id,name,quantity,unit,purchased` projection returned 200. This proves a schema mismatch without creating a list. When the endpoint reaches the item insert, the draft action cannot succeed as written. The no-low-stock branch is separate and was not exercised.

### High: cleaning settings advertise behavior that has no consumer

Whole-source searches found these four keys only in the settings page and settings service:

- `photoRequiredForVerify`
- `photoRequiredForDamage`
- `autoBillMissing`
- `defaultReplacementCostMultiplier`

Verification and damage creation paths do not read the photo flags. The verification path computes cost directly from replacement cost without this multiplier. These controls can be displayed/saved without enforcing the behavior promised by their labels. Actual `companies.cleaning_settings` reads returned 200 with an empty object; defaults therefore supply the current policies.

The other four settings have consumers: default daily time in schedules; damage notification toggle and threshold in damage reporting; shopping low-stock notification toggle in supplies.

### High: cleaning settings can falsely report successful company sync

`saveCleaningSettings` performs an UPDATE filtered by company ID without selecting/counting affected rows. A Supabase update that changes zero rows without an error is treated as `{ok:true,synced:true}`. Explicit errors fall back to local storage and still return `ok:true`; the page describes all such cases as “company sync pending migration,” even for permission/network failures. This is a code-confirmed failure mode, not a claim that a live cleaner write was attempted or denied.

### High: shopping completion differs by page

Dashboard completion uses `useActiveShoppingList.completeList`, which attempts to create a supplier payable and sends completion notifications. `/shopping/orders` directly updates the list and records variance; that handler does not invoke the same payable/completion-notification flow. The same business event can therefore have different side effects depending on where it is completed. External database triggers were not comprehensively audited; the code paths are demonstrably inconsistent.

### Existing completion/stock issues remain

See `SHOPPER_CLEANER_AUDIT_2026-10-19.md` for the reproduced cleaning zero-row completion bug, non-atomic stock restoration, shopper tick/stock divergence, duplicate-payable risk, hidden list-read errors and invalid-money parsing. No fixes were applied in this check.

## Page-by-page backend coverage

“Connected” means a real backend path exists and page/read checks succeeded where noted. It does **not** mean live mutations or all failure paths passed.

| Page | Backend path / action | Assessment |
|---|---|---|
| Shopping dashboard | Shopping lists/items, inventory; tick and completion hook | Reads connected; stock and completion defects in original audit. |
| Shopping buy list | `inventory_demand_outlook`, inventory costs; list insertion hook | Reads connected; create/add actions not executed. |
| Shopping kitchen demand | `kitchenPrepService` demand aggregation and shortfall list creation | Reads connected; list creation not executed. |
| Shopping inventory | Inventory and movements; stock adjustment; draft-reorder API | Reads connected; **draft reorder schema mismatch confirmed**. |
| Shopping orders / Active shop | Lists and events; receipt storage; completion update | Reads connected; completion side effects differ from dashboard. |
| Shopping restock | Low-stock service; `receiveStock`; receipt storage and notifications | Read path checked; purchase not executed. Receipt insert ignores returned errors in its best-effort handler. |
| Shopping suppliers | `supplierService` company list/create/update | Read path connected; supplier writes not executed. |
| Shopping invoices / Spend | Completed shopping lists and recorded spend | Read path connected; accuracy depends on upstream completion/receipt writes. |
| Shopping receipts | Shared ReceiptScanner; quota/upload/import-status APIs | Read/metadata path checked; upload, AI extraction and reconciliation not executed. |
| Shopping notifications | Company/user notification reads and read-status updates | Reads connected; read-status mutations not intentionally triggered. |
| Shopping settings | `company_shopping_settings` | Live reads confirmed; partial/inactive behavior and defects above. |
| Shopping alerts | Server redirect to buy list | Redirect checked; no separate backend feature. |
| Shopping index | Server redirect to dashboard | Source-reviewed redirect. |
| Cleaning dashboard | Equipment, jobs, handovers and duty components | Reads connected; job completion has reproduced consistency bugs. |
| Cleaning management | TeamManagerWorkspace and work-mode card | Manager read path checked; staff clock and diary writes not executed. |
| Cleaning tasks | `cleaning_schedules`, profile assignment, notifications | Reads connected; assignment/start/finish actions inspected but not written live. |
| Cleaning schedules | `cleaning_schedules`; daily-time setting | Reads connected; schedule creation not executed. |
| Cleaning equipment | Equipment read/update and damage insertion | Reads connected; photo policy not enforced; separate writes can partially succeed. |
| Cleaning supplies | Inventory read/adjust; low-stock notification policy | Reads connected; stock-use writes not executed. |
| Cleaning damage | Equipment-damage records and notifications | Reads connected; photo requirement is not consumed. |
| Cleaning workflows | Equipment categories and cleaning-time reads | Real read path; not a workflow-execution engine. |
| Cleaning notifications | Company/user notification reads and read-status updates | Reads connected; read-status mutations not intentionally triggered. |
| Cleaning settings | `companies.cleaning_settings` plus local-storage fallback | Read confirmed; four unenforced controls and save-feedback defects. |
| Cleaning handovers/[id] | Handover details, job start/complete, sign-off | Source reviewed; existing completion defects apply. No record-specific live write test. |
| Cleaning index | Server redirect to dashboard | Source-reviewed redirect. |

## Validation evidence and limits

- `tmp/shop-clean-backend-probe.json`: authenticated settings and schema reads using normal role sessions, not service-role data queries. Service-role capability was used only to obtain test-user authentication links.
- `tmp/shop-clean-settings-proof.json`: isolated source execution for zero threshold, hidden read error, explicit save-error handling, and malformed money input. No real settings were saved.
- `tmp/shop-clean-backend-pages.json`: fresh authenticated page crawl with backend request paths/statuses and settings control state. No request bodies, tokens, or customer data are stored in this report.
- Earlier targeted tests: 25 passed. They do not cover every mutation discussed here.
- The configured localhost application uses the live backend. No purchase, stock adjustment, policy save, staff clock change, upload, send, deletion, or completion was intentionally performed. Save/transaction correctness still needs disposable test data or a rollback-capable test database.
- No application source changes, migration, deployment, or commit was made.

Fresh crawl result: **25/25 page visits passed across 4 roles**, with **1,685 observed backend responses and zero HTTP 4xx/5xx responses** in that crawl. These counts include shared portal/sidebar/auth data and can include responses completing during navigation; they are not 1,685 independent business-operation tests. The separate deliberate schema probe produced the expected 400 reported above. The initial admin shopping-settings visit captured no form controls before navigation, so its UI state required a longer follow-up check; its authenticated database read was independently verified. Shopper settings showed all eight controls disabled and the values matched the saved database row.

Follow-up admin check: **2/2 settings pages passed**. Shopping settings rendered all eight controls: receipt, lead time, variance and notify-admin were enabled; the four Coming soon controls remained disabled. Values matched the saved row. Evidence: `tmp/shop-clean-backend-admin-pages.json`. This verifies editor UI availability, not live save persistence.
