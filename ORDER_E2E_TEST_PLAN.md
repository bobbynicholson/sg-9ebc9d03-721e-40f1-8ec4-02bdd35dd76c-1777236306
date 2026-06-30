# Catering Order — Complete E2E Test Plan (114 cases)

Each item: role that acts, where to do it, expected result (status change + in-app notification + email).
Known gaps and prod caveats are flagged inline.

## 15 ORDER SCENARIOS (run these, together they cover all 114 cases)
Run each order through P0-P8, then the extra cases it is built to hit.

| # | Order | What it proves | Extra cases |
|---|-------|----------------|-------------|
| ORD-1 | Standard happy path | Baseline full lifecycle, owned gear, PayFast | P0-P8 all |
| ORD-2 | Food only, no equipment | Cleaning + collection auto-skip, no orphans | 45 |
| ORD-3 | Hire-in equipment | Supplier hire, collection, payables, supplier-clean skip | 11,14,73,83 |
| ORD-4 | Waiter-only service | No auto-collection, waiter reminder | 46,103 |
| ORD-5 | Multi-stop same day | Route planning, trip timer, delivery sheet | 64,86,87 |
| ORD-6 | Staged payment plan | 3+ instalments, reminders, sums to total | 66,70 |
| ORD-7 | Yoco gateway | Yoco webhook path | 69 |
| ORD-8 | Stripe + manual EFT | Two payment methods on one order | 67,69,106 |
| ORD-9 | Rush (<12h) | Lead-hours alert, SLA, no stale reminders | 50,104 |
| ORD-10 | Cancelled + refunded | Downstream cancels cleanly, refund reconciles | 39,40 |
| ORD-11 | Amended (guest change) | Price/prep/shopping cascade, approve+reject | 41 |
| ORD-12 | Partial then overpay | No false paid, credit handled | 43,44 |
| ORD-13 | Outsourced delivery | External provider decline + reassign + reminders | 89 |
| ORD-14 | Large multi-day | Production aggregation, recipe scaling, shortage, 2-driver | 63,76,78,81,84 |
| ORD-15 | White-label + repeat client | Branded emails left-aligned, region scope, magic link, chat | 52,95,98,99,112 |
| ORD-AGG | After all 15 | Reports/KPIs, money-health, accounting sync, settlements, no data inconsistency | 72,106 |

## Prod caveats before you start
- No `RESEND_API_KEY` in prod: app emails are generated/queued but NOT delivered. Verify via `outgoing_email_queue`, `email_automation_log`, and `/admin/money-health` email drain, not an inbox.
- No `ANTHROPIC_API_KEY` in prod: AI features (recipe scaling, receipt scan) 500. See task P13.3.
- In-app notifications and WhatsApp paths are the ones that actually reach a person right now.

## 3 wiring gaps (missing features, not bugs to chase)
- Hire-in equipment booked: no notification.
- Pre-event cleaning scheduled: no comms until delivery.
- Waiter on-site service: no notification/email.

---

## P0 Setup
1. Verify test client + real email exists
2. Verify order has 1 menu item + 1 equipment item
3. Verify all staff role logins work (kitchen mgr/staff, cleaning mgr/staff, driver, waiter, admin/owner, client)
4. Record order number for tracking

## P1 Sales to confirmed (Admin)
5. Client accepts quote via magic link
6. Admin converts quote to order (status = pending)
7. Deposit invoice generated + emailed (client in-app + PDF email)
8. Pay deposit (PayFast) or record manual payment
9. Deposit-paid notifications (admin+client in-app, 2 emails) + status flip pending->confirmed
10. Confirm cascade (prep tasks, cleaning handover, 7d+1d reminders, kitchen reminder, auto-invoice, kitchen+driver broadcasts)
11. Book hire-in equipment (GAP: no notify)

## P2 Pre-event cleaning + hire-in
12. Cleaning manager schedules pre-event cleaning (GAP: no notify)
13. Cleaning staff marks owned equipment cleaned
14. Driver collects hire-in gear (client in-app + cleaning broadcast + collection_complete email)

## P3 Kitchen
15. Kitchen manager assigns prep / sets chef (chef in-app "New Order Assignment")
16. Kitchen staff move prep tasks to in_progress (status preparing)
17. Kitchen staff mark ALL prep tasks done (status ready)
18. "Ready" notifications (admin, driver, client + order_ready email, urgent alert if 2+ in 30min)
19. Kitchen pre-event reminder email queued (24h)

## P4 Dispatch / delivery
20. Admin assigns driver (driver+client in-app, driver WhatsApp, no email)
21. Driver On the road (status in_transit, client in-app + order_in_transit email + WhatsApp ETA)
22. Driver Delivered (status delivered, client+admin in-app, cleaning broadcast, order_delivered email + WhatsApp, POD-missing alert)
23. Delivered side-effects (review queued 24h, collection trip auto-created, cleaning jobs queued, inventory deducted once, driver clock-out)

## P5 Waiter
24. Waiter on-site service (GAP: no comms)

## P6 Return + post-event cleaning
25. Collection scheduled + driver notify
26. Driver/waiter marks equipment returned (client in-app + cleaning broadcast + collection_complete email)
27. Cleaning manager assigns post-event cleaning ("Cleaning job assigned")
28. Cleaning staff marks cleaning complete ("Cleaning job completed")

## P7 Money + close (Admin)
29. Final invoice sent (client in-app + PDF email)
30. Pay balance + verify auto-complete delivered->completed (admin+client in-app, 2 emails)
31. Receipt issued (client in-app + PDF email)
32. Admin marks Completed + after-sales scheduled ("Order closed out")
33. After-sales sequence queued (0/1/3/6/9/12 months, respects max_months + skip ids)

## P8 Cross-checks
34. Notification bell per role
35. Run order-timeline.mjs, all 22 stages correct
36. Money reconciliation (deposit + balance = total, paid matches invoices.amount_paid)
37. Clean names (no "Untitled") + status path pending->confirmed->preparing->ready->in_transit->delivered->completed
38. Emails generated despite no Resend key (check queue, not inbox)

## P9 Edge / negative
39. Cancel order at each stage (downstream tasks cancelled not orphaned)
40. Refund after payment (money still reconciles)
41. Amendment / change request (price cascade; approve + reject paths)
42. Pause + resume (no duplicate cascade)
43. Partial / under payment (no false "paid", no auto-flip)
44. Overpayment (credit handled, no crash)
45. No-equipment order path (cleaning/collection auto-skip, no orphans)
46. Waiter-only service (no collection auto-created)
47. Reassign driver (old+new notified, no double WhatsApp)
48. POD missing alert (admin high); add POD, confirm resolves
49. Comms paused / quarantine (emails skip, in-app still fires)
50. Rush order lead-hours alert (<12h)
51. Multiple ready orders urgent alert (dedup)
52. Region scoping on broadcasts (cross-tenant isolation / RLS)
53. Notification dedup under retries (idempotent invoice/inventory/payment)
54. Wrong-role access blocked (middleware + RLS)

## P10 Pre-order (Lead + Quote)
55. Lead intake via embed/web form (lead created + admin notified + analytics)
56. Lead assignment + stale lead digest cron
57. Quote builder -> quote sent email + quote PDF clean
58. Quote followup + expiry (stale quote) crons
59. Quote decline / reject (public token)
60. Quote change-request before acceptance (public token)

## P11 Documents / PDFs (two systems, hygiene)
61. Quote / Invoice / Receipt PDFs render clean (ZAR, no chrome, clean breaks)
62. BEO generated + allergens + counts
63. Kitchen production sheet (per order + aggregated daily)
64. Delivery sheet / delivery note print (auto print dialog)
65. Packing list / crates + return load (counts out = back; flag if UI missing)

## P12 Payments depth
66. Staged / scheduled payment plan (>2 stages, sums to total)
67. Payment links + claim EFT + verify claim / confirm return
68. PayFast ITN signature validation + reconcile-payfast cron
69. Yoco + Stripe confirmation webhooks
70. Deposit + balance reminder crons (respect quarantine)
71. Recurring invoices cron-generated drafts
72. Accounting sync (Xero/QB/Sage) invoice+payment+credit note
73. Payables ledger (supplier / hire-in invoices)

## P13 Kitchen depth
74. Kitchen schedule roster (duty, late/missed badges, actual vs planned hours)
75. Kitchen shift tasks per shift
76. AI recipe scaling by guest count (NOTE: 500 if ANTHROPIC_API_KEY missing)
77. Kitchen settlement + clock in/out (only own pay visible to staff)

## P14 Shopping / procurement
78. Shopping list generated from prep (aggregates, no dedup race)
79. Shopping completion workflow + stale shopping list alert cron

## P15 Equipment depth
80. Availability calendar / no double-booking
81. Equipment shortage detection + alert (hire-in suggested)
82. Damage logging on return (charge path + stock adjust)
83. Late return + collection reminder crons
84. Vehicles: two-driver / refrigeration / warmer / capacity / ownership
85. Equipment service-due / maintenance reminder cron

## P16 Dispatch depth
86. Route planning / multi-stop optimization
87. Route stops + trip timer (start/pause/cancel/complete) + earnings
88. Driver interest / claim unassigned job (removes broadcast, admin notified)
89. Outsource assignment + decline + pre/post-event reminders
90. Driver settlement / payslip / rest logs / vehicle maintenance

## P17 Reviews / feedback / support
91. Pending reviews auto-process (24h) + review request email
92. Delivery feedback modal (food/driver/timeliness)
93. Complaints portal end-to-end
94. Support tickets (public)

## P18 Client portal depth
95. Repeat client login + my-orders (RLS scoped)
96. Live tracking page (status/map/ETA)
97. Billing page accuracy (matches admin + invoice, ZAR)
98. Magic link expiry + reuse rejection
99. Order chat (client <-> admin) + new-message notify

## P19 Calendar / availability
100. Order appears on admin calendar + public holidays block availability

## P20 Ops crons / SLA / reminders
101. Auto-complete delivered cron (fully-paid delivered -> completed + after-sales)
102. Event approaching + day-before (+ 1-week) reminders
103. Waiter service reminder cron
104. Order SLA monitor + late event check
105. Batch expiry alert + currency check crons

## P21 Data integrity / reconciliation
106. Money-health dashboard: order/invoice/payment mismatch detection
107. Order timeline immutable event log (append-only, accurate)
108. Realtime channel updates across roles (correct channel suffix, no stale UI)
109. Temperature + waste logs (FLAG: tables exist, UI may be incomplete)

## P22 Notifications / comms settings
110. Email notification preferences per-user toggles respected
111. Comms guard: blocked_contacts + per-channel pause (email/WhatsApp/SMS)
112. White-label branded emails left-aligned + correct brand

## P23 Status guards / review workflows
113. Illegal status transitions blocked (allowed-transition map)
114. Cancellation request approval workflow (client request -> admin review)
