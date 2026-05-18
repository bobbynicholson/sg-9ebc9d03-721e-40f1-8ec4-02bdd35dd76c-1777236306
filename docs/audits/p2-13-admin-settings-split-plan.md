# P2-13 admin/settings.tsx split plan

**Date:** 2026-05-18
**Status:** plan only -- execution stays out of any single session;
each phase below ships as its own PR after operator review.

`src/pages/admin/settings.tsx` is 1,352 lines and renders a
10-tab settings panel for the catering company. Three of the tabs
(`inventory`, `dispatch`, `cancellation`) are already extracted as
sub-components -- the remaining seven live inline and account for
most of the file's bulk. This plan walks the extraction phase-by-
phase, keeping each PR shippable and reviewable.

## What's in the file today

| Range          | Lines | Role                                                                          |
|----------------|------:|-------------------------------------------------------------------------------|
| 1-46           |   46  | Imports + ProtectedSettingsPage wrapper                                       |
| 47-574         |  528  | State (multiple useState clusters per tab), data loading, TabsList chrome    |
| 575-667        |   93  | **company tab** -- company info form + region/timezone                       |
| 668-776        |  108  | **notifications tab** -- in-app + email default toggles + recipient picker   |
| 777-882        |  105  | **automation tab** -- comms-pause + auto-followup toggles                     |
| 883-982        |  99   | **pricing tab** -- VAT rate, deposit %, currency display                     |
| 983-1084       |  101  | **operations tab** -- working hours, order cutoff, capacity                  |
| 1085-1087      |   3   | inventory tab -- already a sub-component (`InventorySettingsTab`)            |
| 1088-1091      |   3   | dispatch tab -- already a sub-component (`DispatchSettingsTab`)              |
| 1092-1095      |   3   | cancellation tab -- already a sub-component (`CancellationPolicyTab`)         |
| 1097-1247      |  150  | **financial tab** -- bank, payment terms, invoice numbering                  |
| 1248-1351      |  104  | **email-automation tab** -- daily cap, after-sales drip, reminder cadence    |
| 1352           |   1   | closing tags                                                                  |

About **760 inline lines** across 7 tabs are extractable. Combined
with the ~430 lines of state + loading + chrome at the top, the
page should drop to ~450-500 lines once Phase A-G land.

## Phase order (smallest tab first, biggest last)

The state-coupling pattern is similar across all 7 tabs: each
reads from a `formData` object plus an `onSave` handler. Some
also pull tenant-scoped enums (currency, regions, etc.) from
parent state.

Easiest -> hardest:

### Phase A -- notifications tab (~108 lines)

Mostly Switch toggles + a recipient role picker. Self-contained;
only needs the notification settings sub-slice of formData plus
its onSave handler.

| File                                                                | Lines |
|---------------------------------------------------------------------|------:|
| `src/components/admin/settings/NotificationsSettingsTab.tsx`        |  ~130 |
| net delta on page                                                   | -108  |

### Phase B -- automation tab (~105 lines)

Comms-pause + auto-followups toggle stack. Similar shape to
notifications.

### Phase C -- pricing tab (~99 lines)

VAT rate input, default deposit %, currency display. Numeric +
select inputs only; no nested state.

### Phase D -- operations tab (~101 lines)

Working hours, capacity, order cutoff. Same pattern as pricing.

### Phase E -- company tab (~93 lines)

Company name, address, region, timezone. Sibling tab to the
existing inventory/dispatch/cancellation sub-components - the
"identity" tab.

### Phase F -- email-automation tab (~104 lines)

Daily send cap, after-sales drip, reminder cadence. Slightly more
state than the others because cadence is a list editor; otherwise
mechanical.

### Phase G -- financial tab (~150 lines)

The biggest one. Bank details, payment terms, invoice numbering,
currency. Some sub-sections nest (e.g. bank account list editor).
Save for last; treat as 1-2 PRs depending on how the bank list
editor extracts.

## Shared sibling -- types file

Phase A bundles a `src/components/admin/settings/types.ts` with the
form-data interfaces every tab consumes. Subsequent phases import
from it.

## Order of operations

1. **PR 1 (start here).** Phase A + types. Lands the folder pattern
   + ~108 LOC saved.
2. **PR 2.** Phase B (automation).
3. **PR 3.** Phase C (pricing).
4. **PR 4.** Phase D (operations).
5. **PR 5.** Phase E (company).
6. **PR 6.** Phase F (email-automation).
7. **PR 7.** Phase G (financial).

Bobby can drop in operator smoke testing between any two PRs;
each tab is independently verifiable in the UI.

## Expected LOC trajectory

| After PR | Page lines |
|---------:|-----------:|
| baseline |     1,352  |
| PR 1     |     1,244  |
| PR 2     |     1,139  |
| PR 3     |     1,040  |
| PR 4     |       939  |
| PR 5     |       846  |
| PR 6     |       742  |
| PR 7     |       592  |

Page mental shape afterwards: state + data loading + tab switcher
+ "assemble these sub-components". Same as where
account/settings.tsx + admin/inventory-tracking.tsx + admin/
platform/company-database.tsx have already landed.

## Risks + mitigations

- **Form state coupling.** Each tab edits a slice of one big
  `formData` object on the parent. Lift the slice as a prop:
  `<NotificationsSettingsTab data={formData.notifications}
  onChange={(next) => setFormData({ ...formData, notifications:
  next })} onSave={handleNotificationsSave} />`. Same pattern as
  inventory-tracking dialogs already shipped.
- **Save handler placement.** Each tab has its own Save button +
  per-tab save handler. Pass the handler as a prop; do NOT move it
  into the sub-component (it touches parent state for the success
  toast).
- **TabsList chrome stays in the page.** Only the TabsContent
  bodies get extracted. The triggers + active-tab state + the
  scroll-into-view UX stay where they are.
- **Wave 70 conflicts.** This file is iterated on regularly per
  running-todo. Rebase each PR right before merge.

## Out of scope

- Splitting `SettingsPage` itself into multiple controllers (one
  per tab). The shared formData object means a controller split
  is a state refactor, not a JSX split.
- Lifting the company / financial / etc. settings data layer into
  a dedicated hook. That's its own design decision.

## Definition of done

After PRs 1-7 land:
- `src/pages/admin/settings.tsx` is under 600 lines.
- Every tab body lives in `src/components/admin/settings/`.
- Behaviour byte-for-byte unchanged.

P2-13 line in audit Appendix A ticks off cleanly.
