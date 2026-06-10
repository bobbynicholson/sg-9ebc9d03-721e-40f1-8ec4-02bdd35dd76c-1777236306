# CateringMS — Skills Reference

> What this system can do, by persona. Use this as a quick reference when picking up a task.

---

## Owner / Company Admin

| Skill | Key files / endpoints |
|---|---|
| Company profile + branding | `src/pages/admin/company-profile.tsx` |
| Menu catalog (items, allergens, pricing modes) | `src/pages/admin/menu.tsx` |
| Equipment catalog (stock, hire-in) | `src/pages/admin/equipment.tsx` |
| Supplier master list | `src/pages/admin/suppliers.tsx` |
| Quote builder (auto-save, per-guest pricing, surge, discount) | `src/pages/admin/quotes/new.tsx` |
| Quote list + follow-up intelligence chips | `src/pages/admin/quotes/index.tsx` |
| Order management + status transitions | `src/services/order/orderWorkflow.ts` |
| Financial dashboard (P&L, cashflow, margin) | `src/pages/admin/financial-dashboard.tsx` |
| Invoice management (auto-generate, mark paid) | `src/pages/admin/invoices/index.tsx` |
| Refund engine (tier-based, credit option) | `src/services/refundService.ts` |
| Staff roster + clock-in/out | `src/pages/admin/staff.tsx` |
| Payroll (BCEA overtime, SA public holidays) | `src/pages/admin/wages.tsx` |
| Driver settlement | `src/pages/admin/driver-settlement.tsx` |
| Email templates (per-tenant override) | `src/pages/admin/email-templates.tsx` |
| Audit logs | `src/pages/admin/audit-logs.tsx` |
| Region management (multi-kitchen) | `src/pages/admin/regions.tsx` |
| Accounting integrations (Xero / QuickBooks / Sage) | `src/pages/api/accounting/` |
| Subscription management | `src/pages/admin/subscription.tsx` |
| API keys + webhooks | `src/pages/admin/integrations.tsx` |
| Embed lead-capture form | `src/pages/api/public/embed/` |
| Document numbering prefixes | `src/pages/api/admin/numbering-settings.ts` |

---

## Sales Admin

| Skill | Key files / endpoints |
|---|---|
| Lead pipeline (new / follow-up / convert) | `src/pages/admin/leads/` |
| Quote build from lead | `src/pages/admin/quotes/new.tsx?leadId=` |
| Quote send (branded email + magic link) | `src/services/email/` |
| Quote-change request handling | `src/pages/api/client-tokens/request-change.ts` |
| Client roster | `src/pages/admin/clients.tsx` |
| Booking calendar | `src/pages/admin/calendar.tsx` |

---

## Kitchen Staff

| Skill | Key files / endpoints |
|---|---|
| Today's prep dashboard (by order + by ingredient) | `/team-portal/kitchen/prep-list` |
| Urgency tiers (critical / high / watch / ok) | `src/services/kitchen/kitchenPrepService.ts` |
| Prep task status updates (pending → in_progress → done) | `src/pages/team-portal/kitchen/` |
| Allergen gate (mandatory tick before `ready`) | `src/services/order/orderWorkflow.ts` |
| Recipe scaling (guest count × multiplier) | `src/services/kitchen/recipeService.ts` |
| Shopping list creation from shortfall | `kitchenPrepService.createShoppingListFromShortfall()` |
| Realtime order refresh | `src/hooks/useOrderRefreshSignal.ts` |
| Kitchen pay + settlement | `src/services/kitchen/kitchenPayService.ts` |

---

## Shopping Staff

| Skill | Key files / endpoints |
|---|---|
| Inventory demand outlook (7/14/30-day) | `/team-portal/shopping/buy-list` |
| Active shopping list (grouped by supplier) | `/team-portal/shopping/dashboard` |
| Barcode-scan + auto-mark purchased | `src/pages/team-portal/shopping/` |
| Supplier payables creation on list completion | `src/services/shopping/` |
| Receipt capture (image upload to Supabase Storage) | `src/pages/team-portal/shopping/` |
| Tax-purchase allocation (resale / operational / combined) | `menu_items.cost_allocation_type` |

---

## Driver

| Skill | Key files / endpoints |
|---|---|
| 14-day lookahead + next-pickup banner | `/team-portal/driver/dashboard` |
| Job status flow (assigned → delivered) | `src/pages/team-portal/driver/` |
| GPS pinging (every 60s on active jobs) | `src/hooks/useDriverGPSPing.ts` |
| Kitchen → driver handover gate | `src/services/driverConfirmationService.ts` |
| WhatsApp "on the way" notification to client | `src/services/whatsapp/` |
| Delivery completion + equipment return modes | `src/pages/api/admin/` |
| Driver pay summary (hourly + distance + callout) | `src/services/driver/driverPayService.ts` |
| Driver earnings page | `/team-portal/driver/earnings` |

---

## Cleaning Staff

| Skill | Key files / endpoints |
|---|---|
| Equipment status overview (Available / Cleaning / Damaged) | `/team-portal/cleaning/dashboard` |
| SOP checklist (5-step inspection) | `src/components/cleaning/` |
| Damage reporting | `src/services/cleaning/` |
| Cleaning event handover sign-off | `/team-portal/cleaning/handovers/[id]` |
| Available-quantity math (stock - in-cleaning) | `unitsInActiveCleaning()` |
| Realtime multi-person sync | `src/hooks/useOrderRefreshSignal.ts` |

---

## Client (End Customer)

| Skill | Key files / endpoints |
|---|---|
| Magic-link quote view + accept/decline | `/q/[token]` |
| Quote change request | `/api/client-tokens/request-change` |
| Order status tracking | `/c/order/[id]` |
| Pay invoice (PayFast card / EFT / store credit) | `/pay/i/[token]` |
| Guest count amendment | `/api/client-tokens/amend-guests` |
| Postpone request | `/api/client-tokens/cancel-order` |
| Cancel + refund/credit wizard | `src/components/client/CancellationWizard.tsx` |
| Expired-link self-serve recovery | `src/components/client/ExpiredLinkCard.tsx` |
| Repeat-client portal login | `/client-portal/` |
| Live driver tracking map | `/client-portal/tracking` |

---

## Super Admin (Platform)

| Skill | Key files / endpoints |
|---|---|
| Cross-tenant company database | `/admin/platform/company-database` |
| Trial management + extension | `/admin/platform/trial-management` |
| Subscription + billing state | `/admin/platform/subscription-management` |
| Platform user management | `/admin/platform/user-management` |
| Cross-tenant audit log | `/admin/platform/audit-logs` |
| Smoke test harness | `/admin/platform/smoke-test` |
| Account deletion (POPIA/GDPR) | `/api/admin/export-company-data` |

---

## Cross-Cutting Capabilities

| Capability | Where |
|---|---|
| Realtime order refresh (31 pages) | `src/hooks/useOrderRefreshSignal.ts` |
| Branded email shell (all sends) | `src/services/email/brandedEmailShell.ts` |
| Email template resolver (tenant → global → fallback) | `src/services/email/templateResolver.ts` |
| Central email send + compliance gates | `src/services/emailService.ts` |
| Quote → order propagation | `src/services/quote/propagateQuoteEdit.ts` |
| Order state machine | `src/services/order/orderWorkflow.ts` |
| Cancellation cascade (release all resources) | `src/services/order/releaseResources.ts` |
| Refund engine (tier walk) | `src/services/refundService.ts` |
| RLS tenant isolation | `get_user_company_id(uid)` in migrations |
| Magic-link token minting | `mint_client_order_token()` RPC |
| PayFast ITN webhook | `/api/webhooks/payment-confirmation` |
| Stripe subscription webhook | `/api/webhooks/subscriptions/stripe` |
| Cron jobs (10 active) | `src/pages/api/cron/` |
| CI guardrails (3 checks) | `scripts/check:status-filters` etc. |
| TIGHTEN audit tags | Grep `TIGHTEN I.` — latest is I.128 |

---

## Coding Rules (always apply)

- SA English: colour, organise, fulfil, theatre
- No em dashes (`—`), no `--` double-hyphens in comments
- No `any` casts on new code
- Every new migration needs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- New realtime channels must be tenant-scoped: `.channel(\`...-${companyId}\`)`
- Status string literals must match the DB enum — run `check:status-filters`
- No `--no-verify` on commits
- After every feature/fix: commit + push to `main`
