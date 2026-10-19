# Shopper and cleaner flow audit

Date: 19 October 2026. Workspace reviewed as-is, including existing uncommitted changes.

## Conclusion

There are real correctness gaps, primarily around completion, stock consistency, and misleading success messages. Successful page loads do not prove these write workflows are correct. This task audits and reports; no application fixes or business-record changes were made.

## Findings, in recommended fix order

### 1. High: cleaning can restore stock without completing a job

**Evidence:** `src/services/cleaningJobsService.ts:433`. Completion updates only `in_progress` jobs, but a zero-row update stops execution only when the earlier snapshot already said `complete`. A queued/cancelled job, or a concurrent completion loser with a stale `in_progress` snapshot, continues into inventory restoration and notifications.

**Impact:** equipment can appear available without a valid completion, or be counted twice after simultaneous completions. The owned-quantity cap limits the maximum but does not guarantee the correct available count.

**Verification:** isolated execution of the actual transpiled service with mock database responses reproduced both the queued-job and concurrent-loser paths: each returned `{ok:true}` and attempted to change availability from 2 to 4 despite changing zero job rows. A snapshot already marked complete correctly skipped stock writes.

**Fix:** require a successfully transitioned row before any side effect. Make the job transition and stock adjustment one idempotent database transaction. Test queued, cancelled, missing, repeated, and concurrent completions.

### 2. High: cleaning completion and equipment restoration can disagree

**Evidence:** `src/services/cleaningJobsService.ts:444`, `:456`, `:458`, `:519`; `src/components/cleaning/CleaningJobsQueue.tsx:132`.

The service commits completion first, then reads and rewrites equipment availability separately. Inventory failures are warnings; the result remains successful. The queue then says “Equipment back in inventory.” A retry after completion is already visible skips restoration, so it does not repair a failed stock write. Two different jobs for the same equipment can also read the same availability and overwrite each other's additions.

**Verification:** mocked inventory-write failure reproduced a successful return. Lost updates follow from the separate read/absolute-write sequence; no concurrent live experiment was performed.

**Fix:** transactional, atomic stock adjustment with the completion transition; otherwise expose a durable reconciliation state and accurate user feedback.

### 3. High: shopping tick and stock adjustment are not one transaction

**Evidence:** `src/hooks/useActiveShoppingList.ts:347-396`.

The purchased flag changes before stock adjustment. The same-item compare-and-set is a useful safeguard, but failed stock updates do not reverse the tick or surface an actionable error. Every RPC error triggers a legacy read/absolute-write fallback, even when the error is not a missing function. That fallback ignores update errors and can lose concurrent increments. An ambiguous RPC failure also makes blindly applying a fallback unsafe.

**Impact:** “purchased” can disagree with actual inventory; subsequent identical ticks cannot repair it because they no longer win the flag transition.

**Verification:** source-confirmed failure path; live inventory was not modified.

**Fix:** one transactional RPC for the flag transition and stock delta, with idempotency and explicit failures. Avoid a non-atomic fallback for arbitrary RPC errors.

### 4. High: shopping completion can duplicate payables or claim a payable was recorded when it failed

**Evidence:** `src/hooks/useActiveShoppingList.ts:578-627`; `src/lib/shopping/receiptStatus.ts:33`; `src/pages/team-portal/shopping/dashboard.tsx:336`.

List completion updates by ID without checking that the list is still active. Each successful call then attempts a new supplier-payable insert, with only a textual list reference in notes. Two sessions can both complete the same list and both attempt to record the spend. Payable failure is merely logged, while the UI still says “List complete · payable recorded” and “Cashflow is updated.”

**Verification:** source-confirmed; deployed database constraints were not audited, so actual duplicate acceptance remains to be verified in a disposable database.

**Fix:** stable list-to-payable key with a uniqueness constraint and transactional/idempotent completion. Return the actual payable result to the UI. Test parallel completion and payable-write failure.

### 5. Medium: shopper list read failures look like no work exists

**Evidence:** `src/hooks/useActiveShoppingList.ts:162`, `:177`, `:192`.

Assigned-list and unassigned-list queries discard Supabase's returned `error`. If both yield no data due to a query/permission failure, the hook clears the list and error state. Supabase query errors normally resolve as result objects rather than throwing, so the surrounding catch does not solve this.

**Impact:** shoppers may see an empty workload instead of an error and miss assigned work.

**Fix:** inspect each query error; distinguish loading, empty, and failed states and provide retry. Verify with mocked failed reads.

### 6. Medium: malformed spend text can become a valid zero or a different amount

**Evidence:** `src/lib/shopping/completionRules.ts:14`; `src/pages/team-portal/shopping/dashboard.tsx:305`.

`parseMoneyInput` removes all characters except digits, period, and minus before converting. `abc` becomes `Number('')`, or 0; `12abc34` becomes 1234. The confirmation handler accepts finite nonnegative results.

**Impact:** invalid entries may silently record incorrect actual spend rather than requesting correction.

**Fix:** validate the complete input against supported currency formats, including intentional separators, before parsing. Add cases for letters, empty text, valid currency, negative values, and separators.

### 7. Medium: variance audit insert errors are not checked

**Evidence:** `src/services/shoppingCompletionService.ts:50-70`.

The awaited `audit_logs` insert result is discarded. A normal Supabase `{error}` response does not throw, so the catch is bypassed and processing continues without a durable audit entry.

**Fix:** inspect the insert result and expose/log the returned error explicitly. Decide whether a failed required audit should block completion or create a retry record.

## Working safeguards observed

- Portal middleware limits shopping routes to the shopping/admin roles and explicitly allows kitchen roles to view cleaning routes. That intentional viewing access is not itself a defect.
- Active shopping-list reads include company scope and prefer the current shopper's assigned list.
- Shopping item ticks use a compare-and-set so two identical ticks do not both deliberately apply stock changes in the ordinary success path.
- The active shopper completion hook fetches the company's receipt policy before closing a list.
- Cleaning restoration caps availability at the owned equipment quantity.
- Cleaning handover sign-off counts only completed jobs as returned and explicitly warns when unfinished jobs remain.
- Automatic cleaner clock-out is deliberately gated by the company's whole queue being clear and scoped to the completing actor. Confirm this operational policy with managers; it is not classified here as a proven bug.

## Validation and scope

- Isolated reproduction: `node tmp/shop-clean-audit-proof.cjs`; results: `tmp/shop-clean-audit-proof.json`. Uses the actual service source with fake database responses; no network or live writes.
- Targeted Jest: `equipmentReturnService`, `chatbotCleaningGuidance`, and `notificationAudience`: **3 suites, 25 tests passed**. These existing tests do not cover all defects above.
- Runtime checks and all-role launch results are recorded below after completion.
- No production deployment, migrations, commits, purchasing actions, cleaning completion actions, or financial writes were performed.
- Localhost connects to the configured live backend. Authentication sessions and normal page reads were used; this was not a full write-based end-to-end test.
- No claim is made that every RLS policy, deployed function, database constraint, mobile layout, or failure/retry case has been verified. Full build/typecheck was not run because application code was not changed.

## Local sessions and runtime results

**All 11 role windows are open and authenticated at `http://localhost:3001`.** Each uses a separate browser profile. The existing local server was reused. Launcher process: 52516; leave it running to retain the windows.

| Role | Landing page | Launch/check |
|---|---|---|
| Company admin | `/spit-braai-delivery/admin/dashboard` | Passed |
| Admin | `/spit-braai-delivery/admin/dashboard` | Passed |
| Kitchen staff | `/spit-braai-delivery/team-portal/kitchen/dashboard` | Passed |
| Kitchen manager | `/spit-braai-delivery/team-portal/kitchen/management` | Passed |
| Waiter | `/spit-braai-delivery/team-portal/waiter/dashboard` | Passed |
| Driver | `/spit-braai-delivery/team-portal/driver/dashboard` | Passed |
| Shopping staff | `/spit-braai-delivery/team-portal/shopping/dashboard` | Passed |
| Cleaning staff | `/spit-braai-delivery/team-portal/cleaning/dashboard` | Passed |
| Cleaning manager | `/spit-braai-delivery/team-portal/cleaning/management` | Passed |
| Client | `/spit-braai-delivery/client-portal/dashboard` | Passed |
| Platform owner | `/admin/platform/dashboard` | Passed |

The launcher checked 17 pages across these roles, including additional admin payment-gateway, company-profile, and invoice pages. All 11 role checks passed. The metadata-only payment-gateway endpoint returned the expected results: 200 for company admins/admins, 403 for staff/client roles, and 400 for the platform owner's missing company context. Those expected denials are not page failures.

Additional authenticated crawls: **11/11 shopper pages and 9/9 cleaner pages passed**, with no reported crashes, login redirects, page errors, or failed API responses. Shopper pages: dashboard, buy list, kitchen demand, inventory, orders, suppliers, invoices, receipts, alerts, notifications, settings. Cleaner pages: dashboard, tasks, schedules, equipment, supplies, damage, workflows, notifications, settings. Cleaner manager management was checked by the launcher; record-specific handovers were reviewed in source, not exercised with live completion actions.

Artifacts: `.browser-profiles-local/launch-status.json`, `tmp/local-role-check/report.json`, launcher log `tmp/shop-clean-audit-launch.out.log`, and cleaner crawl results `tmp/shop-clean-audit-cleaning-pages.json`. The existing crawler uses a shared output filename, so its last run holds the cleaner results; the shopper run separately reported 11/11 passing in the execution output.

To reopen all roles later: `node scripts/open-all-users-local.mjs --base http://localhost:3001 --check` with the local server running. Opening one shared browser profile for all roles would overwrite sessions; use this separate-profile launcher.
