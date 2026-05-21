# Notification destinations

Source of truth for where every in-app notification deep-links. The bell
component uses `notification.link` to navigate; the notifications page
also uses `related_entity_type` + `related_entity_id` to render
contextual CTAs (Review / Edit / View). Without those entity pointers,
the row only gets a generic "Open" button, so set them on every row
that has a sensible target.

## Rules

1. Never link to a generic dashboard with query params nothing reads --
   pick the entity page or set `link: null` so the bell falls back to
   the inbox view.
2. `notification_type` should match the Postgres enum where possible
   (see `NOTIFICATION_TYPE_ENUM_VALUES` in `notificationService.ts`).
   Off-enum values still insert against the text column.
3. Cross-team broadcasts (admin team needs to see) use
   `broadcastNotification` with `targetRoles`, never
   `createNotification` with `recipient_id = company_id`.

## Order routes

There is no `/admin/orders/[id]` per-order page. Operators land on
`/admin/orders?orderId={id}` and the dashboard's deep-link consumer
opens the order in the right column. Amendments and cancellations add
extra params so the dashboard can highlight the specific request.

| Route                                                            | Used for                          |
| ---------------------------------------------------------------- | --------------------------------- |
| `/admin/orders?orderId={id}`                                     | order context (status, payment)   |
| `/admin/orders?orderId={id}&amendment={requestId}`               | amendment review                  |
| `/admin/orders?orderId={id}&cancellation={requestId}`            | cancellation / postponement       |
| `/admin/orders?orderId={id}&replacementRequest={requestId}`      | driver replacement coordination   |

## Quote routes

`/admin/quotes/[id]` is the dedicated detail page. Use the
`#change-requests` anchor for change-request rows so the inline panel
scrolls into view.

| Route                                          | Used for                  |
| ---------------------------------------------- | ------------------------- |
| `/admin/quotes/{id}`                           | quote review              |
| `/admin/quotes/{id}#change-requests`           | client change request     |

## Lead routes

| Route                          | Used for                  |
| ------------------------------ | ------------------------- |
| `/admin/leads?leadId={id}`     | new lead, lead status     |

## Client portal

| Route                                          | Used for                  |
| ---------------------------------------------- | ------------------------- |
| `/client-portal/my-orders?orderId={id}`        | client-facing order ping  |
| `/client-portal/tracking?orderId={id}`         | live driver tracking      |
| `/client-portal/billing?invoiceId={id}`        | invoice issued            |

## Team portal

| Route                                                            | Used for                          |
| ---------------------------------------------------------------- | --------------------------------- |
| `/team-portal/driver/deliveries?orderId={id}`                    | driver-facing order updates      |
| `/team-portal/driver/routes`                                     | optimised route assignment        |
| `/team-portal/kitchen/prep-list`                                 | chef assignment                   |

## Type / destination mapping

| notification_type                | recipient kind  | link template                                                 | related_entity_type / id |
| -------------------------------- | --------------- | ------------------------------------------------------------- | ------------------------ |
| `order_confirmed`                | client          | `/client-portal/my-orders?orderId={id}`                        | order / orderId          |
| `order_preparing`                | admin / client  | `/admin/orders?orderId={id}` or client-portal                  | order / orderId          |
| `order_ready`                    | admin / driver / client | dashboard / driver deliveries / client portal           | order / orderId          |
| `out_for_delivery`               | client          | `/client-portal/my-orders?orderId={id}`                        | order / orderId          |
| `delivered`                      | admin / client  | dashboard / `/client-portal/my-orders?orderId={id}`            | order / orderId          |
| `order_completed`                | admin           | `/admin/orders?orderId={id}`                                   | order / orderId          |
| `order_cancelled`                | admin / client  | dashboard / `/client-portal/my-orders?orderId={id}`            | order / orderId          |
| `dispatch_cluster`               | admin           | `/admin/orders?orderId={id}` (anchor stop)                     | order / orderId          |
| `driver_assigned`                | driver          | `/team-portal/driver/deliveries?orderId={id}`                  | order / orderId          |
| `chef_assigned`                  | kitchen         | `/team-portal/kitchen/prep-list`                               | order / orderId          |
| `driver_acknowledged`            | admin           | `/admin/orders?orderId={id}`                                   | order / orderId          |
| `driver_confirmed`               | admin           | `/admin/orders?orderId={id}`                                   | order / orderId          |
| `driver_status_update`           | admin           | `/admin/orders?orderId={id}`                                   | order / orderId          |
| `driver_arrived`                 | client          | `/client-portal/tracking?orderId={id}`                         | order / orderId          |
| `driver_10_minutes_away`         | client          | `/client-portal/tracking?orderId={id}`                         | order / orderId          |
| `delivery_arrived`               | driver          | `/team-portal/driver/deliveries?orderId={id}`                  | order / orderId          |
| `delivery_*` (status update)     | admin           | `/admin/orders?orderId={id}`                                   | order / orderId          |
| `route_assigned`                 | driver          | `/team-portal/driver/routes`                                   | (none - multi-order)    |
| `driver_replacement_needed`      | admin broadcast | `/admin/orders?orderId={id}&replacementRequest={requestId}`    | order / orderId          |
| `driver_replacement_offer`       | drivers         | `/team-portal/driver/deliveries?orderId={id}&replacementRequest={requestId}` | order / orderId  |
| `driver_replacement_accepted`    | admin / driver  | `/admin/orders?orderId={id}` or driver deliveries              | order / orderId          |
| `payment_received`               | admin           | `/admin/orders?orderId={id}`                                   | order / orderId          |
| `payment_reminder`               | admin           | `/admin/orders?orderId={id}`                                   | order / orderId          |
| `modification_deadline`          | admin           | `/admin/orders?orderId={id}`                                   | order / orderId          |
| `payment_claimed`                | admin           | `/admin/invoices?invoiceId={invoiceId}&claimId={paymentId}`     | invoice / id             |
| `invoice_issued`                 | client          | `/client-portal/billing?invoiceId={id}`                        | invoice / invoiceId      |
| `equipment_damage`               | admin           | `/admin/equipment?tab=shortages&equipmentId={id}`              | equipment / equipmentId  |
| `cleaning_completed`             | admin           | `/admin/orders?orderId={id}`                                   | order / orderId          |
| `kitchen_clock_in`               | admin           | `/admin/kitchen-schedule?shiftId={id}`                         | kitchen_shift / shiftId  |
| `kitchen_clock_out`              | admin           | `/admin/kitchen-schedule?shiftId={id}`                         | kitchen_shift / shiftId  |
| `kitchen_task_completed`         | admin           | `/admin/orders?orderId={id}`                                   | order / orderId          |
| `kitchen_emergency`              | admin           | `/admin/orders?orderId={id}`                                   | order / orderId          |
| `shopping_started`               | admin           | `/admin/shopping?listId={id}`                                  | shopping_list / listId   |
| `shopping_completed`             | admin           | `/admin/shopping?listId={id}`                                  | shopping_list / listId   |
| `shopping_assigned`              | shopper         | `/team-portal/shopping/orders?listId={id}`                     | shopping_list / listId   |
| `lead_new`                       | admin           | `/admin/leads?leadId={id}`                                     | lead / leadId            |
| `lead_status_updated`            | admin           | `/admin/leads?leadId={id}`                                     | lead / leadId            |
| `lead_converted`                 | admin           | `/admin/leads?leadId={id}`                                     | lead / leadId            |
| `quote_change_request`           | admin broadcast | `/admin/quotes/{id}#change-requests`                           | quote / quoteId          |
| `amendment_requested`            | admin broadcast | `/admin/orders?orderId={id}&amendment={requestId}`             | order / orderId          |
| `amendment_approved`             | client          | `/client-portal/my-orders?orderId={id}`                        | order / orderId          |
| `amendment_partial_approved`     | client          | `/client-portal/my-orders?orderId={id}`                        | order / orderId          |
| `amendment_rejected`             | client          | `/client-portal/my-orders?orderId={id}`                        | order / orderId          |
| `cancellation_requested`         | admin broadcast | `/admin/orders?orderId={id}&cancellation={requestId}`          | order / orderId          |
| `postponement_requested`         | admin broadcast | `/admin/orders?orderId={id}&cancellation={requestId}`          | order / orderId          |
| `cancellation_approved`          | client          | `/client-portal/my-orders?orderId={id}`                        | order / orderId          |
| `cancellation_rejected`          | client          | `/client-portal/my-orders?orderId={id}`                        | order / orderId          |
| `postponement_approved`          | client          | `/client-portal/my-orders?orderId={id}`                        | order / orderId          |
| `postponement_rejected`          | client          | `/client-portal/my-orders?orderId={id}`                        | order / orderId          |
| `gamification_points`            | any user        | `/account/achievements?highlight=points`                        | user / id                |
| `gamification_achievement`       | any user        | `/account/achievements?highlight=achievement`                   | user / id                |

## Antipatterns to avoid

- `recipient_id: 'admin'` - not a UUID, the row inserts but no auth
  user ever reads it. Use `broadcastNotification` with `targetRoles`.
- `recipient_id` set to the `company_id` - same problem; treat
  company-wide broadcasts via `broadcastNotification`.
- `link: '/orders/{id}'` - there is no such route. Always use
  `/admin/orders?orderId={id}` (or the client / team portal route).
- Setting `link` without `related_entity_*` - the notifications page
  loses the contextual CTA and falls back to a generic Open button.
