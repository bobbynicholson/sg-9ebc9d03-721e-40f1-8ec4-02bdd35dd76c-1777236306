# P2-13 admin/orders.tsx Phase C - migration guide

**Status as of 2026-05-18:** ready to execute in a session that has paired
browser smoke. Discovery work is done; the extraction itself is mechanical.

## What this guide replaces

The original P2-13 split plan deferred Phase C ("extract OrderDetailsModal")
because the modal is a 1,709-line closure-heavy inner component on a
daily-driver page and the audit team estimated 4 hours of discovery + 4
hours of careful prop drilling. This guide collapses the discovery
half: the closure-captured-symbol list below is authoritative, so the
next session can go straight to the mechanical extraction.

## Boundaries

- File: `src/pages/admin/orders.tsx`
- Current body of inner `OrderDetailsModal`: lines 1821 to 3529 (1,709
  lines).
- One call site: `<OrderDetailsModal />` at line 3925 (no props today).

## Closure-captured symbols (the prop surface)

Enumerated by a `defined-inside` vs `referenced-inside-but-defined-outside`
scan over `src/pages/admin/orders.tsx`. The 16 symbols below are the real
captures; the rest of the raw-match list was single-letter loop variables
and locally-shadowed names (a, e, i, key, o, p, row, etc - all local to
the modal body).

### Functions / handlers (8)

| Identifier                      | Source                          | Notes                                                          |
|---------------------------------|---------------------------------|----------------------------------------------------------------|
| `loadOrders`                    | parent useCallback              | reloads the orders array after the modal does a mutation       |
| `setCancelDialogOpen`           | parent useState setter          | opens `<CancelOrderDialog>`                                    |
| `setDuplicateDate7DayDefault`   | parent useState setter          | pre-seeds the duplicate-event-date input                       |
| `setDuplicateDialogOpen`        | parent useState setter          | opens `<DuplicateOrderDialog>`                                 |
| `setIsModalOpen`                | parent useState setter          | closes the OrderDetailsModal itself                            |
| `setPauseDialogOrderId`         | parent useState setter          | opens `<PauseOrderDialog>` for an order                        |
| `setSelectedOrder`              | parent useState setter          | clears / refreshes the modal-selected order                    |
| `withSlug`                      | `useTenantHref()`               | wraps internal navigation hrefs with the tenant slug           |

### State / data (5)

| Identifier        | Source                | Type                          |
|-------------------|-----------------------|-------------------------------|
| `selectedOrder`   | parent useState       | `AppOrder \| null`            |
| `isModalOpen`     | parent useState       | `boolean`                     |
| `orders`          | parent useState       | `AppOrder[]`                  |
| `user`            | `useAuth()`           | `AuthenticatedUser \| null`   |
| `companyId`       | derived from `user`   | `string \| undefined`         |

### Framework hooks (3)

| Identifier  | Source              | Pass shape                                                           |
|-------------|---------------------|----------------------------------------------------------------------|
| `router`    | `useRouter()`       | Re-call `useRouter()` inside the new component instead of passing    |
| `toast`     | `useToast()`        | Re-call `useToast()` inside the new component                        |
| `supabase`  | module import       | Import directly inside the new file                                  |

`router`, `toast`, `supabase` should be re-imported / re-hooked inside
the new component file rather than passed as props. They have no instance-
specific state in the parent.

### Inner sub-components defined elsewhere in `orders.tsx` (1)

| Identifier              | Defined at                          | Action                                                 |
|-------------------------|-------------------------------------|--------------------------------------------------------|
| `OrderHistoryTimeline`  | inner function in `orders.tsx`      | Either pass as a prop or extract to its own file first |

Recommend extracting `OrderHistoryTimeline` to its own file **before**
Phase C, since it's a small self-contained piece. Then Phase C imports it
directly without a prop drill.

## Mechanical extraction steps

1. **Create** `src/components/admin/orders/OrderDetailsModal.tsx`.

2. **Build the props interface** from the table above:

   ```ts
   interface Props {
     selectedOrder: AppOrder | null;
     isModalOpen: boolean;
     orders: AppOrder[];
     user: AuthenticatedUser | null;
     loadOrders: () => Promise<void>;
     onClose: () => void;                 // wraps setIsModalOpen(false)
     onSelectOrder: (o: AppOrder | null) => void;  // wraps setSelectedOrder
     onOpenCancelDialog: () => void;
     onOpenDuplicateDialog: (defaultDate: string) => void;
     onOpenPauseDialog: (orderId: string) => void;
     withSlug: (href: string) => string;
   }
   ```

   Wrapping the bare setters as semantic callbacks (`onClose`,
   `onOpenCancelDialog`, etc) keeps the modal's intent clear and lets
   the parent re-shape state later without breaking the modal.

3. **Move** lines 1821-3529 of `orders.tsx` into the new file:
   - Strip the outer `const OrderDetailsModal = () =>` wrapper.
   - Replace it with `export function OrderDetailsModal({ ...props }: Props) {`.
   - Add `import` lines for every external dependency (lucide icons,
     the UI primitives, `useRouter`, `useToast`, `supabase`,
     `onOrderUpdated`, `AppOrder`, `BookingFactsType`, etc).
   - Replace `setIsModalOpen(false)` with `onClose()`.
   - Replace `setCancelDialogOpen(true)` with `onOpenCancelDialog()`.
   - Replace `setDuplicateDialogOpen(true)` + `setDuplicateDate7DayDefault(d)`
     with `onOpenDuplicateDialog(d)`.
   - Replace `setPauseDialogOrderId(id)` with `onOpenPauseDialog(id)`.
   - Replace `setSelectedOrder(x)` with `onSelectOrder(x)`.

4. **Update the call site** in `orders.tsx` (currently
   `<OrderDetailsModal />` at line 3925):

   ```tsx
   <OrderDetailsModal
     selectedOrder={selectedOrder}
     isModalOpen={isModalOpen}
     orders={orders}
     user={user}
     loadOrders={loadOrders}
     onClose={() => setIsModalOpen(false)}
     onSelectOrder={setSelectedOrder}
     onOpenCancelDialog={() => setCancelDialogOpen(true)}
     onOpenDuplicateDialog={(d) => {
       setDuplicateDate7DayDefault(d);
       setDuplicateDialogOpen(true);
     }}
     onOpenPauseDialog={setPauseDialogOrderId}
     withSlug={withSlug}
   />
   ```

5. **Remove** the now-dead inner function from `orders.tsx`.

6. **tsc check.** Any "Cannot find name 'X'" error inside the new file
   surfaces a captured symbol the table above missed - add it to the
   props interface and the call site, re-run.

## Browser smoke checklist

After tsc passes, the operator (or pair) clicks through the modal on a
real tenant before merge:

- [ ] `/admin/orders` page loads with the order list.
- [ ] Click any order: modal opens with the right order's data.
- [ ] Switch each of the 6 inner tabs (Details, Menu, Equipment,
      Amendments, Cancellations, History).
- [ ] Edit mode: click Edit, change guest count, save, confirm the
      price-adjust dialog flows.
- [ ] Star rating: click a star, confirm the audit_logs row appears.
- [ ] Click Cancel order: `<CancelOrderDialog>` opens.
- [ ] Click Duplicate: `<DuplicateOrderDialog>` opens with today+7 as
      the pre-seeded date.
- [ ] Click Pause: `<PauseOrderDialog>` opens for the right order.
- [ ] Modal close (X / ESC) refreshes the orders list via `loadOrders`.

## Expected LOC impact

- `src/pages/admin/orders.tsx`: 4,015 -> ~2,300 lines (-43%).
- `src/components/admin/orders/OrderDetailsModal.tsx`: 0 -> ~1,750 lines
  (the body + the new imports + the small Prop interface).
- Net: same LOC across the project, but the page becomes navigable and
  the modal becomes a single-purpose component that can be tested in
  isolation.

## Why not just do it now

Discovery is done but the 1,709-line body still warrants a session that
has paired browser smoke before merge. The risk model is bounded
(`Cannot find name` errors catch missed captures at compile time), but
behavioural drift on a daily-driver page costs the operator real money
if something silently regresses. This guide turns the future session
from 4 hours of discovery into 30 minutes of mechanical execution + the
10-minute smoke checklist above.

## Companion phase D (remaining)

`TimelineRow` and `KanbanColumn` are the other two closure-heavy inner
components in `orders.tsx` (used by the timeline + kanban views). They
have the same shape problem as `OrderDetailsModal` (closure captures
parent state). Extract them as a follow-up using the same recipe; the
captured symbols are a subset of the ones listed above (no rating /
edit-mode / booking-facts state, since those are modal-internal).
