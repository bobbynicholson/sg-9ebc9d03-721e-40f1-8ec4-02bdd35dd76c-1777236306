# User and page inventory

Generated from the Next.js src/pages route files. API endpoints, framework files, and font assets are excluded. Dynamic segments remain in bracket form (for example, /q/[token]). Legacy aliases and redirect routes are included because users can still arrive from old bookmarks or email links.

**UI route modules:** 229

## Audience map

| Audience / role | Route modules | Shared interface shell |
|---|---:|---|
| Blog | 2 | Public site header/footer and page templates |
| Cleaning team | 12 | OperationalPortalPageShell via CleaningPageShell |
| Client links, orders, and payments | 13 | Focused quote, order, invoice, and payment flows |
| Clients | 10 | Client navigation and shared portal components |
| Company administrators and operators | 94 | PortalHeader / PortalShell; admin navigation |
| Cross-role team pages | 1 | Public site header/footer and page templates |
| Drivers | 9 | OperationalPortalPageShell via DriverPageShell |
| Kitchen team | 14 | OperationalPortalPageShell via KitchenPageShell |
| Platform administrators | 21 | Platform navigation and shared portal components |
| Public website and regional pages | 28 | Public site header/footer and page templates |
| Shopping team | 13 | OperationalPortalPageShell via ShoppingPageShell |
| Sign-in, accounts, and onboarding | 9 | AuthShell or account shell |
| Waiter team | 3 | OperationalPortalPageShell via WaiterPageShell |

## Coverage notes

This is a route-module inventory, not one row per account. Protected pages render for the roles allowed by their route guards; aliases and redirects are listed because existing links can still reach them.

- Company-admin and platform-admin screens share `PortalShell` and `PortalHeader` alongside their role navigation, with `PageWorkbench` on standard content pages. Kitchen, driver, waiter, shopping, and cleaning screens now share `OperationalPortalPageShell`; each role supplies its own navigation and brand accent while retaining the same responsive frame.
- The delivery-sheet print route uses a deliberately reduced layout so printed output stays usable. Route aliases and redirects reuse their canonical page rather than introducing a second visual implementation.
- Public marketing pages use the shared `LandingHeader` and `LandingFooter`. Regional homepages reuse the same sections and keep their regional pricing URLs.
- Sign-in and onboarding routes use the shared `AuthShell`; tenant branding changes the logo, name and accent while the layout stays consistent.
- Company admin, platform admin, client, driver, kitchen, shopping, cleaning and waiter routes use their shared portal shells where a canonical page is rendered. Legacy routes generally redirect or re-export those canonical pages.
- The pricing route previously waited for live pricing data before rendering. It now displays its built-in plan values immediately and refreshes them in the background, so an unavailable pricing API does not leave users at a spinner.

## Complete route list

### Blog (2)

- /blog — src/pages/blog/index.tsx
- /blog/[slug] — src/pages/blog/[slug].tsx

### Cleaning team (12)

- /team-portal/cleaning — src/pages/team-portal/cleaning/index.tsx
- /team-portal/cleaning/damage — src/pages/team-portal/cleaning/damage.tsx
- /team-portal/cleaning/dashboard — src/pages/team-portal/cleaning/dashboard.tsx
- /team-portal/cleaning/equipment — src/pages/team-portal/cleaning/equipment.tsx
- /team-portal/cleaning/handovers/[id] — src/pages/team-portal/cleaning/handovers/[id].tsx
- /team-portal/cleaning/management — src/pages/team-portal/cleaning/management.tsx
- /team-portal/cleaning/notifications — src/pages/team-portal/cleaning/notifications.tsx
- /team-portal/cleaning/schedules — src/pages/team-portal/cleaning/schedules.tsx
- /team-portal/cleaning/settings — src/pages/team-portal/cleaning/settings.tsx
- /team-portal/cleaning/supplies — src/pages/team-portal/cleaning/supplies.tsx
- /team-portal/cleaning/tasks — src/pages/team-portal/cleaning/tasks.tsx
- /team-portal/cleaning/workflows — src/pages/team-portal/cleaning/workflows.tsx

### Client links, orders, and payments (13)

- /c/account — src/pages/c/account.tsx
- /c/order/[id] — src/pages/c/order/[id].tsx
- /order/[id] — src/pages/order/[id].tsx
- /p/[slug] — src/pages/p/[slug].tsx
- /p/accept/[token] — src/pages/p/accept/[token].tsx
- /pay/i/[token] — src/pages/pay/i/[token].tsx
- /pay/i/[token]/success — src/pages/pay/i/[token]/success.tsx
- /pay/invoice/[id] — src/pages/pay/invoice/[id].tsx
- /pay/invoice/[id]/success — src/pages/pay/invoice/[id]/success.tsx
- /q/[token] — src/pages/q/[token].tsx
- /subscription/checkout — src/pages/subscription/checkout.tsx
- /subscription/success — src/pages/subscription/success.tsx
- /u/[token] — src/pages/u/[token].tsx

### Clients (10)

- /client/subscription-invoices — src/pages/client/subscription-invoices.tsx
- /client-portal — src/pages/client-portal/index.tsx
- /client-portal/billing — src/pages/client-portal/billing.tsx
- /client-portal/dashboard — src/pages/client-portal/dashboard.tsx
- /client-portal/feedback — src/pages/client-portal/feedback.tsx
- /client-portal/my-orders — src/pages/client-portal/my-orders.tsx
- /client-portal/notifications — src/pages/client-portal/notifications.tsx
- /client-portal/profile — src/pages/client-portal/profile.tsx
- /client-portal/quotes — src/pages/client-portal/quotes.tsx
- /client-portal/tracking — src/pages/client-portal/tracking.tsx

### Company administrators and operators (94)

- /admin/ai-brain — src/pages/admin/ai-brain.tsx
- /admin/ai-brain/access — src/pages/admin/ai-brain/access.tsx
- /admin/audit-logs — src/pages/admin/audit-logs.tsx
- /admin/calendar — src/pages/admin/calendar.tsx
- /admin/cashflow-dashboard — src/pages/admin/cashflow-dashboard.tsx
- /admin/cleaning-schedule — src/pages/admin/cleaning-schedule.tsx
- /admin/clients — src/pages/admin/clients.tsx
- /admin/client-search — src/pages/admin/client-search.tsx
- /admin/company-profile — src/pages/admin/company-profile.tsx
- /admin/contacts — src/pages/admin/contacts.tsx
- /admin/daily-operations — src/pages/admin/daily-operations.tsx
- /admin/dashboard — src/pages/admin/dashboard.tsx
- /admin/dispatch — src/pages/admin/dispatch.tsx
- /admin/dispatch-queue — src/pages/admin/dispatch-queue.tsx
- /admin/document-imports — src/pages/admin/document-imports.tsx
- /admin/driver-management — src/pages/admin/driver-management.tsx
- /admin/driver-schedule — src/pages/admin/driver-schedule.tsx
- /admin/driver-settlement — src/pages/admin/driver-settlement.tsx
- /admin/email-settings — src/pages/admin/email-settings.tsx
- /admin/email-templates — src/pages/admin/email-templates.tsx
- /admin/equipment — src/pages/admin/equipment.tsx
- /admin/equipment-damages — src/pages/admin/equipment-damages.tsx
- /admin/event-profitability — src/pages/admin/event-profitability.tsx
- /admin/exceptions — src/pages/admin/exceptions.tsx
- /admin/financial-dashboard — src/pages/admin/financial-dashboard.tsx
- /admin/fixed-costs — src/pages/admin/fixed-costs.tsx
- /admin/hr-solutions — src/pages/admin/hr-solutions.tsx
- /admin/integrations — src/pages/admin/integrations.tsx
- /admin/integrations/embed — src/pages/admin/integrations/embed.tsx
- /admin/integrations/embed/[id] — src/pages/admin/integrations/embed/[id].tsx
- /admin/integrations/embed/new — src/pages/admin/integrations/embed/new.tsx
- /admin/inventory — src/pages/admin/inventory.tsx
- /admin/inventory-recipes — src/pages/admin/inventory-recipes.tsx
- /admin/inventory-tracking — src/pages/admin/inventory-tracking.tsx
- /admin/invoices — src/pages/admin/invoices.tsx
- /admin/kitchen-duty-tracking — src/pages/admin/kitchen-duty-tracking.tsx
- /admin/kitchen-schedule — src/pages/admin/kitchen-schedule.tsx
- /admin/kitchen-settings — src/pages/admin/kitchen-settings.tsx
- /admin/kitchen-settlement — src/pages/admin/kitchen-settlement.tsx
- /admin/kitchen-staff — src/pages/admin/kitchen-staff.tsx
- /admin/leads — src/pages/admin/leads/index.tsx
- /admin/leads/new — src/pages/admin/leads/new.tsx
- /admin/live-operations — src/pages/admin/live-operations.tsx
- /admin/menu — src/pages/admin/menu.tsx
- /admin/messaging-templates — src/pages/admin/messaging-templates.tsx
- /admin/money-health — src/pages/admin/money-health.tsx
- /admin/notifications — src/pages/admin/notifications.tsx
- /admin/notification-settings — src/pages/admin/notification-settings.tsx
- /admin/offering — src/pages/admin/offering.tsx
- /admin/onboarding — src/pages/admin/onboarding/index.tsx
- /admin/onboarding/clients — src/pages/admin/onboarding/clients.tsx
- /admin/onboarding/import — src/pages/admin/onboarding/import.tsx
- /admin/onboarding/imports — src/pages/admin/onboarding/imports.tsx
- /admin/onboarding/receipts — src/pages/admin/onboarding/receipts.tsx
- /admin/order-assignments — src/pages/admin/order-assignments.tsx
- /admin/orders — src/pages/admin/orders.tsx
- /admin/orders/[id]/ticket — src/pages/admin/orders/[id]/ticket.tsx
- /admin/orders/delivery-sheet — src/pages/admin/orders/delivery-sheet.tsx
- /admin/outsource-providers — src/pages/admin/outsource-providers/index.tsx
- /admin/outsource-providers/[id] — src/pages/admin/outsource-providers/[id].tsx
- /admin/outstanding-balances — src/pages/admin/outstanding-balances.tsx
- /admin/package — src/pages/admin/package.tsx
- /admin/packages — src/pages/admin/packages/index.tsx
- /admin/packages/[id] — src/pages/admin/packages/[id].tsx
- /admin/payables — src/pages/admin/payables.tsx
- /admin/payment-gateways — src/pages/admin/payment-gateways.tsx
- /admin/public-holidays — src/pages/admin/public-holidays.tsx
- /admin/quotes — src/pages/admin/quotes/index.tsx
- /admin/quotes/[id] — src/pages/admin/quotes/[id].tsx
- /admin/quotes/new — src/pages/admin/quotes/new.tsx
- /admin/recurring-invoices — src/pages/admin/recurring-invoices.tsx
- /admin/refunds — src/pages/admin/refunds.tsx
- /admin/regions — src/pages/admin/regions.tsx
- /admin/reviews — src/pages/admin/reviews.tsx
- /admin/route-planning — src/pages/admin/route-planning.tsx
- /admin/settings — src/pages/admin/settings.tsx
- /admin/shopping — src/pages/admin/shopping.tsx
- /admin/staff — src/pages/admin/staff.tsx
- /admin/staff-hours — src/pages/admin/staff-hours.tsx
- /admin/stock — src/pages/admin/stock.tsx
- /admin/subscription — src/pages/admin/subscription.tsx
- /admin/suppliers — src/pages/admin/suppliers/index.tsx
- /admin/suppliers/[id] — src/pages/admin/suppliers/[id].tsx
- /admin/tax-purchases — src/pages/admin/tax-purchases.tsx
- /admin/teams — src/pages/admin/teams/index.tsx
- /admin/teams/cleaning — src/pages/admin/teams/cleaning.tsx
- /admin/teams/drivers — src/pages/admin/teams/drivers.tsx
- /admin/teams/kitchen — src/pages/admin/teams/kitchen.tsx
- /admin/teams/shopping — src/pages/admin/teams/shopping.tsx
- /admin/tracking — src/pages/admin/tracking.tsx
- /admin/users — src/pages/admin/users.tsx
- /admin/vehicles — src/pages/admin/vehicles.tsx
- /admin/wages — src/pages/admin/wages.tsx
- /admin/white-label — src/pages/admin/white-label.tsx

### Cross-role team pages (1)

- /team-portal/general/job-progress — src/pages/team-portal/general/job-progress.tsx

### Drivers (9)

- /team-portal/driver — src/pages/team-portal/driver/index.tsx
- /team-portal/driver/calendar — src/pages/team-portal/driver/calendar.tsx
- /team-portal/driver/dashboard — src/pages/team-portal/driver/dashboard.tsx
- /team-portal/driver/deliveries — src/pages/team-portal/driver/deliveries.tsx
- /team-portal/driver/earnings — src/pages/team-portal/driver/earnings.tsx
- /team-portal/driver/notifications — src/pages/team-portal/driver/notifications.tsx
- /team-portal/driver/routes — src/pages/team-portal/driver/routes.tsx
- /team-portal/driver/schedule — src/pages/team-portal/driver/schedule.tsx
- /team-portal/driver/tracking — src/pages/team-portal/driver/tracking.tsx

### Kitchen team (14)

- /team-portal/kitchen — src/pages/team-portal/kitchen/index.tsx
- /team-portal/kitchen/calendar — src/pages/team-portal/kitchen/calendar.tsx
- /team-portal/kitchen/dashboard — src/pages/team-portal/kitchen/dashboard.tsx
- /team-portal/kitchen/duty — src/pages/team-portal/kitchen/duty.tsx
- /team-portal/kitchen/handovers — src/pages/team-portal/kitchen/handovers.tsx
- /team-portal/kitchen/management — src/pages/team-portal/kitchen/management.tsx
- /team-portal/kitchen/menu — src/pages/team-portal/kitchen/menu.tsx
- /team-portal/kitchen/notifications — src/pages/team-portal/kitchen/notifications.tsx
- /team-portal/kitchen/orders/[id]/ticket — src/pages/team-portal/kitchen/orders/[id]/ticket.tsx
- /team-portal/kitchen/prep-list — src/pages/team-portal/kitchen/prep-list.tsx
- /team-portal/kitchen/production — src/pages/team-portal/kitchen/production.tsx
- /team-portal/kitchen/settings — src/pages/team-portal/kitchen/settings.tsx
- /team-portal/kitchen/stock — src/pages/team-portal/kitchen/stock.tsx
- /team-portal/kitchen/today — src/pages/team-portal/kitchen/today.tsx

### Platform administrators (21)

- /admin/platform — src/pages/admin/platform/index.tsx
- /admin/platform/audit-logs — src/pages/admin/platform/audit-logs.tsx
- /admin/platform/cms-blog — src/pages/admin/platform/cms-blog.tsx
- /admin/platform/cms-pages — src/pages/admin/platform/cms-pages.tsx
- /admin/platform/company-database — src/pages/admin/platform/company-database.tsx
- /admin/platform/currency-monitoring — src/pages/admin/platform/currency-monitoring.tsx
- /admin/platform/dashboard — src/pages/admin/platform/dashboard.tsx
- /admin/platform/financial-dashboard — src/pages/admin/platform/financial-dashboard.tsx
- /admin/platform/messaging-templates — src/pages/admin/platform/messaging-templates.tsx
- /admin/platform/payment-issues — src/pages/admin/platform/payment-issues.tsx
- /admin/platform/pricing-management — src/pages/admin/platform/pricing-management.tsx
- /admin/platform/running-todo — src/pages/admin/platform/running-todo.tsx
- /admin/platform/settings — src/pages/admin/platform/settings.tsx
- /admin/platform/subscription-management — src/pages/admin/platform/subscription-management.tsx
- /admin/platform/tax-rules — src/pages/admin/platform/tax-rules.tsx
- /admin/platform/tech-costs — src/pages/admin/platform/tech-costs.tsx
- /admin/platform/tenant-health — src/pages/admin/platform/tenant-health.tsx
- /admin/platform/trial-management — src/pages/admin/platform/trial-management.tsx
- /admin/platform/user-management — src/pages/admin/platform/user-management.tsx
- /super-admin — src/pages/super-admin.tsx
- /super-admin/admin/dashboard — src/pages/super-admin/admin/dashboard.tsx

### Public website and regional pages (28)

- / — src/pages/index.tsx
- /[company_slug]/admin/dashboard — src/pages/[company_slug]/admin/dashboard.tsx
- /[company_slug]/admin/users — src/pages/[company_slug]/admin/users.tsx
- /[company_slug]/auth/callback — src/pages/[company_slug]/auth/callback.tsx
- /[company_slug]/client/login — src/pages/[company_slug]/client/login.tsx
- /[company_slug]/login — src/pages/[company_slug]/login.tsx
- /[company_slug]/order/[id] — src/pages/[company_slug]/order/[id].tsx
- /contact — src/pages/contact.tsx
- /demo — src/pages/demo.tsx
- /eu — src/pages/eu/index.tsx
- /eu/pricing — src/pages/eu/pricing.tsx
- /features — src/pages/features.tsx
- /features/email-automation — src/pages/features/email-automation.tsx
- /features/gps-tracking — src/pages/features/gps-tracking.tsx
- /features/inventory-management — src/pages/features/inventory-management.tsx
- /features/kitchen-management — src/pages/features/kitchen-management.tsx
- /features/lead-management — src/pages/features/lead-management.tsx
- /page/[slug] — src/pages/page/[slug].tsx
- /pricing — src/pages/pricing.tsx
- /privacy — src/pages/privacy.tsx
- /security — src/pages/security.tsx
- /support — src/pages/support.tsx
- /terms — src/pages/terms.tsx
- /terms/[company] — src/pages/terms/[company].tsx
- /uk — src/pages/uk/index.tsx
- /uk/pricing — src/pages/uk/pricing.tsx
- /us — src/pages/us/index.tsx
- /us/pricing — src/pages/us/pricing.tsx

### Shopping team (13)

- /team-portal/shopping — src/pages/team-portal/shopping/index.tsx
- /team-portal/shopping/alerts — src/pages/team-portal/shopping/alerts.tsx
- /team-portal/shopping/buy-list — src/pages/team-portal/shopping/buy-list.tsx
- /team-portal/shopping/dashboard — src/pages/team-portal/shopping/dashboard.tsx
- /team-portal/shopping/inventory — src/pages/team-portal/shopping/inventory.tsx
- /team-portal/shopping/invoices — src/pages/team-portal/shopping/invoices.tsx
- /team-portal/shopping/kitchen-demand — src/pages/team-portal/shopping/kitchen-demand.tsx
- /team-portal/shopping/notifications — src/pages/team-portal/shopping/notifications.tsx
- /team-portal/shopping/orders — src/pages/team-portal/shopping/orders.tsx
- /team-portal/shopping/receipts — src/pages/team-portal/shopping/receipts.tsx
- /team-portal/shopping/restock — src/pages/team-portal/shopping/restock.tsx
- /team-portal/shopping/settings — src/pages/team-portal/shopping/settings.tsx
- /team-portal/shopping/suppliers — src/pages/team-portal/shopping/suppliers.tsx

### Sign-in, accounts, and onboarding (9)

- /account/achievements — src/pages/account/achievements.tsx
- /account/settings — src/pages/account/settings.tsx
- /auth/callback — src/pages/auth/callback.tsx
- /auth/install — src/pages/auth/install.tsx
- /auth/login — src/pages/auth/login.tsx
- /auth/register — src/pages/auth/register.tsx
- /auth/reset-password — src/pages/auth/reset-password.tsx
- /auth/select-role — src/pages/auth/select-role.tsx
- /company-signup — src/pages/company-signup.tsx

### Waiter team (3)

- /team-portal/waiter — src/pages/team-portal/waiter/index.tsx
- /team-portal/waiter/dashboard — src/pages/team-portal/waiter/dashboard.tsx
- /team-portal/waiter/notifications — src/pages/team-portal/waiter/notifications.tsx
