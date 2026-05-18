# P2-13 admin/orders.tsx split plan

**Date:** 2026-05-18
**Author:** post-Phase-10 session
**Status:** plan only -- execution stays out of any single session;
each phase below ships as its own PR after operator review.

`src/pages/admin/orders.tsx` is the largest single page in the
codebase at **4,443 lines** (was 2,427 at the time of the original
audit -- doubled in size since). It's also the daily-driver page
for catering admins, so a clean split is non-trivial and a sloppy
split is dangerous. This doc lays out a phased plan so the
extraction can be done safely, incrementally, and with the
browser-verification budget the page deserves.

## What's in the file today

| Range          | Lines  | Role                                                                              |
|----------------|-------:|-----------------------------------------------------------------------------------|
| 1-68           |    68  | Imports                                                                           |
| 69-188         |   120  | Interfaces (`OrderStats`, line-item shapes, etc.)                                 |
| 189-2449       | 2,260  | Main component: state (~70 `useState`), handlers, top toolbar, KPI tiles, list   |
| 2450-3534      | 1,084  | **Order Details Dialog** with 6 inner tabs (details / menu / equipment / amendments / cancellations / history) |
| 3535-3635      |   100  | **Price Adjust Dialog**                                                           |
| 3636-4326      |   691  | Tail of the main JSX (filters, table, action buttons)                             |
| 4327-4387      |    60  | **Duplicate Order Dialog**                                                        |
| 4388-4436      |    48  | Closing tags + small helpers                                                      |
| 4437-end       |     6  | Wrapper component (`AdminOrders` -> `OrderProcessDashboard` inside ProtectedRoute) |

Roughly **70%** of the file is the main component body and the
order-details dialog; the other 30% is the two smaller dialogs +
table rendering + filters + KPI tiles.

## Phased split plan

### Phase A -- safest, biggest LOC win: extract the two smaller dialogs

Both are self-contained: small surface area, one or two pieces of
state, one handler. Same pattern as PRs #40 / #41 / #42 already
landed.

| Extraction                          | New file                                                       | Lines saved |
|-------------------------------------|----------------------------------------------------------------|------------:|
| Price Adjust Dialog                 | `src/components/admin/orders/PriceAdjustDialog.tsx`            | ~100        |
| Duplicate Order Dialog              | `src/components/admin/orders/DuplicateOrderDialog.tsx`         | ~60         |

State to pass via props:

- **Price Adjust:** `priceAdjustOpen`, `setPriceAdjustOpen`,
  selected order's id + current total, `priceAdjustReason`,
  `setPriceAdjustReason`, `priceAdjustDelta`,
  `setPriceAdjustDelta`, the submit handler.
- **Duplicate:** `duplicateDialogOpen`, `setDuplicateDialogOpen`,
  the source order, new event date input + setter, the submit
  handler.

**Risk:** low. No shared internal state, no useEffects, no hook
captures. Net LOC reduction ~160. Ship in one PR.

### Phase B -- types + small interfaces

`OrderStats` plus the order line-item / amendment / cancellation
shapes (currently inline interfaces) move to
`src/components/admin/orders/types.ts`. Imported by both the page
and the dialogs once they land. Trivial extraction; bundle with
Phase A or ship as a 1-file PR.

### Phase C -- Order Details Dialog (the big one)

This is 1,084 lines and has 6 inner Tabs. Two options:

**C1 -- single OrderDetailsDialog component (1 file, lots of props).**

- Wraps the existing JSX in `<OrderDetailsDialog>`.
- Takes ~25 props (open, onOpenChange, selectedOrder, all the
  modal-scoped state + handlers).
- LOC saved on the page: ~1,084.
- Risk: medium. The dialog reads from many useStates the page
  owns; lifting them all up as props is one massive prop drill,
  but it's still safe because behaviour is byte-for-byte.

**C2 -- OrderDetailsDialog as a shell, one component per tab body.**

- `OrderDetailsDialog.tsx` -- shell + tab switcher (~50 lines).
- `tabs/DetailsTab.tsx` (~340 lines).
- `tabs/MenuTab.tsx` (~135 lines).
- `tabs/EquipmentTab.tsx` (~135 lines).
- `tabs/AmendmentsTab.tsx` (~15 lines).
- `tabs/CancellationsTab.tsx` (~15 lines).
- `tabs/HistoryTab.tsx` (~15 lines).
- LOC saved on the page: same ~1,084, but each tab is its own
  component so further work (per-tab improvements) doesn't have
  to re-read the dialog wrapper.
- Risk: medium-high. More prop interfaces to keep in sync, more
  places for state drift on rename.

**Recommendation:** start with C1. If the props list gets unruly,
break out the tab bodies in a follow-up. C2 from scratch is
premature optimisation.

### Phase D -- the main body itself

Even after Phases A-C land, the page is still ~2,400 lines (most
of which is the orders list + KPI tiles + filters + the top
toolbar). Options:

- **D1.** Pull the KPI tile strip out as `<OrderKpiTiles />`
  (probably ~200-300 lines).
- **D2.** Pull the filters bar out as `<OrderFilters />`
  (probably ~150 lines).
- **D3.** Pull the orders table out as `<OrdersTable />`
  (probably ~500-700 lines, plus the action buttons per row).
- **D4.** Leave handlers / loaders inline.

Each of D1-D3 is a smaller version of the dialog pattern. They
take props for the data + the action callbacks. Ship as separate
PRs.

After D, the page should sit around ~800-1,000 lines focused on
state orchestration + data loading + assembling the sub-components.

## Order of operations

1. **PR 1 (this week):** Phase A + B. Lands the two small dialogs +
   the types file. ~250 LOC saved. Sets the
   `src/components/admin/orders/` folder pattern. Low risk.
2. **PR 2:** Phase C1. The Order Details Dialog as a single
   component. ~1,084 LOC saved.
3. **PR 3-5:** Phase D1, D2, D3 each as their own PR.

Total expected LOC trajectory:

| After PR | Page lines | Component lines |
|---------:|-----------:|----------------:|
| baseline |     4,443  |               0 |
| PR 1     |     4,200  |             250 |
| PR 2     |     3,150  |           1,350 |
| PR 3     |     2,900  |           1,600 |
| PR 4     |     2,750  |           1,750 |
| PR 5     |     2,150  |           2,400 |

The total LOC adds slightly (boilerplate of new files), but the
mental load per file drops dramatically and the orders page itself
becomes navigable again.

## Risks + mitigations

- **State drift across props.** Most dangerous in Phase C. Mitigation:
  if a prop is added to the dialog component, run the page's tsc
  check before pushing -- TypeScript will catch any prop the page
  forgot to pass.
- **useEffect captures.** Some handlers in the page reference state
  that lives there (e.g. selectedOrder). Mitigation: every handler
  passed as a prop should be wrapped in `useCallback` only where
  it goes into a useEffect dep array; otherwise just pass the
  function directly. Same as the pattern PRs #40-#42 used.
- **Browser regression.** Phase C touches the dialog the operator
  uses every day. Mitigation: after PR 2 lands, the operator runs
  through a basic smoke (open an order, switch each tab, confirm
  the action buttons work) before continuing to PR 3.
- **Conflict with running-todo features.** This page is being
  actively iterated on (Wave 70 series). Mitigation: each PR
  rebases off main right before merge; if a Wave 70.X PR touches
  the same lines, that PR wins and this split rebases.

## Out of scope

- Splitting up the `OrderProcessDashboard` component into smaller
  React components (vs. extracting JSX into sub-files). The
  component is one big controller -- breaking it into multiple
  components requires a state-lifting refactor that's higher
  risk than the JSX extractions above.
- Replacing the inline useState calls with `useReducer`. Same
  reason -- meaningful state-shape change, not scope here.
- Moving the page out of `pages/admin/orders.tsx`. The route URL
  stays; this is purely a file-organisation exercise.

## Definition of done for the P2-13 admin/orders.tsx line

After PRs 1-5 land:
- `src/pages/admin/orders.tsx` is under 2,500 lines.
- Every dialog has its own file under `src/components/admin/orders/`.
- The page's mental shape is: state + data loading + handlers +
  "assemble these sub-components".
- Behaviour is byte-for-byte unchanged from today.

P2-13 line in the audit Appendix A then ticks off cleanly.
