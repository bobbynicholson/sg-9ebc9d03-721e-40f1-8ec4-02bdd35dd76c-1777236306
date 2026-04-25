# 🗺️ Platform Feature Mapping - "If This, Then That" Audit
**Generated:** 2026-04-25  
**Purpose:** Comprehensive mapping of all business logic flows, triggers, and automations

---

## 📊 EXECUTIVE SUMMARY

This document maps ALL conditional logic, automated workflows, and data flows across the CateringMS platform. It identifies:
- ✅ Implemented features
- ⚠️ Partially implemented features
- ❌ Missing implementations
- 🔗 Integration points

---

## 🔐 AUTHENTICATION & AUTHORIZATION

### **User Registration Flow**
**Trigger:** User submits company signup form (`/company-signup`)

**If → Then Chain:**
1. ✅ Form submitted → Create company record in `companies` table
2. ✅ Company created → Create owner user in `auth.users`
3. ✅ Auth user created → Trigger `handle_new_user()` → Create profile in `profiles`
4. ✅ Profile created → Set `role = 'company_admin'`, `company_id = new_company.id`
5. ✅ Email confirmation enabled → Send confirmation email
6. ⚠️ Email confirmed → Redirect to onboarding (partially implemented)
7. ❌ Onboarding completed → Mark company as active (missing trigger)

**Files Involved:**
- `src/pages/company-signup.tsx` (form)
- `src/services/companyService.ts` (company creation)
- `src/services/authService.ts` (user creation)
- `supabase/migrations/*_migration_*.sql` (trigger definition)

**Missing Implementations:**
- [ ] Onboarding completion flag
- [ ] Welcome email automation
- [ ] Trial period activation

---

### **Login Flow**
**Trigger:** User submits login form (`/auth/login`)

**If → Then Chain:**
1. ✅ Email entered → Query `profiles` table (case-insensitive)
2. ✅ Profile found → Attempt `supabase.auth.signInWithPassword()`
3. ✅ Auth success → Get user role from profile
4. ✅ Role = `super_admin` → Redirect to `/super-admin/dashboard`
5. ✅ Role = `company_admin` → Redirect to `/{company_slug}/admin/dashboard`
6. ✅ Role = staff → Redirect to `/{company_slug}/team-portal/{role}/dashboard`
7. ✅ Role = `client` → Redirect to `/{company_slug}/client-portal/dashboard`
8. ❌ Invalid credentials → Show error (no retry limit)
9. ❌ Account locked → Show locked message (feature not implemented)

**Files Involved:**
- `src/pages/auth/login.tsx`
- `src/middleware.ts` (role-based routing)
- `src/services/authService.ts`

**Missing Implementations:**
- [ ] Login attempt tracking
- [ ] Account lockout after failed attempts
- [ ] Two-factor authentication
- [ ] Remember me functionality

---

### **Session Management**
**Trigger:** User navigates to protected route

**If → Then Chain:**
1. ✅ Middleware intercepts request → Check `supabase.auth.getSession()`
2. ✅ No session → Redirect to `/auth/login?message=login_required`
3. ✅ Session exists → Get user profile from `profiles` table
4. ✅ No profile → Redirect to login (orphaned auth user)
5. ✅ Profile found → Validate role-based access
6. ✅ Super admin → Allow all routes
7. ✅ Company admin → Allow own company routes only
8. ✅ Staff/Client → Allow own company portal only
9. ⚠️ Session expired → Redirect to login (no session refresh)

**Files Involved:**
- `src/middleware.ts` (session validation)
- `src/contexts/AuthContext.tsx` (client-side session)

**Missing Implementations:**
- [ ] Automatic session refresh before expiry
- [ ] "Session about to expire" warning
- [ ] Multiple device session management
- [ ] Force logout from all devices

---

## 📦 ORDER MANAGEMENT WORKFLOW

### **Order Creation Flow**
**Trigger:** Company admin creates order from quote or manually

**If → Then Chain:**
1. ✅ Quote converted → Create order from `quotes` table data
2. ✅ Order created → Copy `quote_items` to `order_items`
3. ✅ Order created → Set `status = 'pending'`
4. ✅ Order saved → Send notification to company admin
5. ⚠️ Order confirmed → Deduct inventory (partial implementation)
6. ⚠️ Order confirmed → Allocate equipment (partial implementation)
7. ❌ Order confirmed → Create delivery record (missing trigger)
8. ❌ Order confirmed → Send client confirmation email (missing)
9. ❌ Payment received → Update order status (missing webhook)

**Files Involved:**
- `src/pages/admin/quotes/new.tsx` (quote creation)
- `src/pages/admin/orders.tsx` (order management)
- `src/services/orderService.ts` (order creation logic)
- `src/services/inventoryDeductionService.ts` (inventory deduction)
- `src/services/equipmentTrackingService.ts` (equipment allocation)

**Missing Implementations:**
- [ ] Automatic delivery creation on order confirmation
- [ ] Client notification emails
- [ ] Payment webhook integration
- [ ] Order status automation

---

### **Order Status Updates**
**Trigger:** Order status changes

**If → Then Chain:**
1. ✅ Status = `pending` → No actions
2. ⚠️ Status = `confirmed` → Trigger inventory deduction (incomplete)
3. ⚠️ Status = `confirmed` → Allocate equipment (incomplete)
4. ❌ Status = `confirmed` → Send client email (missing)
5. ❌ Status = `in_preparation` → Notify kitchen staff (missing)
6. ❌ Status = `ready_for_delivery` → Notify driver (missing)
7. ⚠️ Status = `delivered` → Mark delivery complete (partial)
8. ❌ Status = `completed` → Generate invoice (missing auto-trigger)
9. ❌ Status = `cancelled` → Restore inventory (missing)
10. ❌ Status = `cancelled` → Cancel equipment allocation (missing)

**Files Involved:**
- `src/services/orderService.ts`
- `src/services/notificationService.ts`
- `src/services/inventoryDeductionService.ts`
- `src/services/equipmentTrackingService.ts`

**Missing Implementations:**
- [ ] Status-based email automation
- [ ] Status-based notification automation
- [ ] Automatic invoice generation on completion
- [ ] Inventory restoration on cancellation
- [ ] Equipment de-allocation on cancellation

---

## 🚚 DELIVERY & DRIVER WORKFLOW

### **Delivery Assignment Flow**
**Trigger:** Company admin assigns order to driver

**If → Then Chain:**
1. ✅ Driver assigned → Create `deliveries` record
2. ✅ Delivery created → Set `status = 'pending'`
3. ✅ Driver assigned → Send driver notification
4. ⚠️ Driver confirms → Update status to `confirmed` (partial)
5. ❌ Driver declines → Request replacement (feature exists but not auto-triggered)
6. ❌ Driver en route → Send client tracking link (missing)
7. ⚠️ Driver arrives → Mark `arrived_at` timestamp (manual only)
8. ⚠️ Driver completes → Mark `completed_at` timestamp (manual only)
9. ❌ Delivery completed → Send feedback request to client (missing)
10. ❌ Delivery completed → Update driver performance metrics (missing)

**Files Involved:**
- `src/pages/admin/order-assignments.tsx` (assignment UI)
- `src/services/deliveryService.ts` (delivery creation)
- `src/services/driverService.ts` (driver management)
- `src/services/driverConfirmationService.ts` (driver confirmation)
- `src/services/driverReplacementService.ts` (replacement requests)

**Missing Implementations:**
- [ ] Automatic driver decline handling
- [ ] Client tracking link automation
- [ ] Automatic status updates based on GPS
- [ ] Post-delivery feedback automation
- [ ] Driver performance tracking

---

### **Route Optimization Flow**
**Trigger:** Company admin creates route for multiple deliveries

**If → Then Chain:**
1. ✅ Multiple deliveries selected → Calculate optimal route
2. ✅ Route calculated → Display on map with waypoints
3. ✅ Route confirmed → Assign driver to route
4. ⚠️ Route assigned → Send route details to driver (partial)
5. ❌ Driver starts route → Track GPS location (feature exists but not auto-triggered)
6. ❌ Stop completed → Auto-advance to next stop (missing)
7. ❌ Route completed → Mark all deliveries complete (missing)
8. ❌ Route completed → Calculate total distance/time (missing)

**Files Involved:**
- `src/pages/admin/route-planning.tsx` (route UI)
- `src/services/routeOptimizationService.ts` (route calculation)
- `src/services/deliveryService.ts` (delivery management)
- `src/components/tracking/DriverGPSTracker.tsx` (GPS tracking)

**Missing Implementations:**
- [ ] Auto-advance to next stop
- [ ] Bulk delivery completion
- [ ] Route analytics tracking
- [ ] ETA updates based on traffic

---

## 🍽️ KITCHEN MANAGEMENT WORKFLOW

### **Prep List Generation Flow**
**Trigger:** Order confirmed or scheduled prep time reached

**If → Then Chain:**
1. ⚠️ Order confirmed → Generate prep list items (partial)
2. ❌ Prep time reached → Send notification to kitchen staff (missing)
3. ❌ Recipe attached → Auto-populate ingredients from recipe (missing)
4. ❌ Ingredients listed → Check inventory availability (missing)
5. ❌ Inventory low → Add to shopping list (missing)
6. ⚠️ Task completed → Update duty log (manual only)
7. ❌ All tasks completed → Notify company admin (missing)

**Files Involved:**
- `src/pages/team-portal/kitchen/dashboard.tsx` (kitchen dashboard)
- `src/services/kitchenDutyService.ts` (duty management)
- `src/services/aiRecipeScalingService.ts` (recipe scaling)

**Missing Implementations:**
- [ ] Automatic prep list generation
- [ ] Scheduled prep notifications
- [ ] Recipe-to-ingredients automation
- [ ] Inventory checking integration
- [ ] Shopping list automation
- [ ] Completion notifications

---

### **Recipe Management Flow**
**Trigger:** Admin creates/updates recipe

**If → Then Chain:**
1. ✅ Recipe created → Store in `recipes` table
2. ⚠️ Recipe created → Link to inventory items (partial)
3. ❌ Recipe updated → Update all linked prep lists (missing)
4. ❌ Recipe deleted → Warn if used in active orders (missing)
5. ❌ Order quantity changes → Auto-scale recipe (feature exists but not triggered)
6. ❌ Scaled recipe → Update inventory requirements (missing)

**Files Involved:**
- `src/pages/admin/inventory-recipes.tsx` (recipe UI)
- `src/services/aiRecipeScalingService.ts` (scaling logic)

**Missing Implementations:**
- [ ] Automatic recipe scaling on order changes
- [ ] Recipe-to-inventory linkage
- [ ] Cascading updates on recipe changes
- [ ] Deletion warnings

---

## 📦 INVENTORY MANAGEMENT WORKFLOW

### **Inventory Deduction Flow**
**Trigger:** Order confirmed

**If → Then Chain:**
1. ⚠️ Order confirmed → Query order items
2. ⚠️ Order items found → Map to inventory items (partial mapping)
3. ⚠️ Inventory items found → Deduct quantities (implemented but not auto-triggered)
4. ❌ Inventory below threshold → Create low stock alert (missing)
5. ❌ Inventory below threshold → Add to shopping list (missing)
6. ❌ Inventory updated → Log transaction in `inventory_transactions` (missing)
7. ❌ Order cancelled → Restore inventory quantities (missing)

**Files Involved:**
- `src/services/inventoryDeductionService.ts` (deduction logic)
- `src/services/inventoryService.ts` (inventory management)
- `src/pages/admin/inventory-tracking.tsx` (inventory UI)

**Missing Implementations:**
- [ ] Automatic inventory deduction on order confirmation
- [ ] Low stock alerts
- [ ] Automatic shopping list creation
- [ ] Transaction logging
- [ ] Inventory restoration on cancellation

---

### **Shopping List Automation**
**Trigger:** Inventory falls below reorder threshold

**If → Then Chain:**
1. ❌ Inventory < reorder_level → Create shopping list item (missing trigger)
2. ❌ Shopping list item created → Calculate required quantity (missing)
3. ❌ Shopping list item created → Notify shopping staff (missing)
4. ⚠️ Item purchased → Update inventory (manual only)
5. ❌ Item purchased → Log transaction with receipt (partial - receipt scanner exists)
6. ❌ Item purchased → Update supplier last purchase date (missing)

**Files Involved:**
- `src/components/shopping/LowStockAlerts.tsx` (alerts UI)
- `src/services/shoppingService.ts` (shopping management)
- `src/components/ReceiptScanner.tsx` (receipt scanning)

**Missing Implementations:**
- [ ] Automatic shopping list generation
- [ ] Required quantity calculation
- [ ] Shopping staff notifications
- [ ] Purchase transaction logging
- [ ] Supplier tracking updates

---

## 🧾 BILLING & INVOICING WORKFLOW

### **Invoice Generation Flow**
**Trigger:** Order completed or manual invoice creation

**If → Then Chain:**
1. ⚠️ Order completed → Check if invoice exists (partial)
2. ⚠️ Invoice missing → Generate from order data (implemented but not auto-triggered)
3. ✅ Invoice generated → Store in `invoices` and `invoice_items` tables
4. ❌ Invoice generated → Send to client via email (missing auto-send)
5. ⚠️ Invoice sent → Set `sent_at` timestamp (manual only)
6. ⚠️ Payment received → Mark as paid (manual only)
7. ❌ Payment received → Send receipt email (missing)
8. ❌ Payment received → Sync to Xero/QuickBooks (feature exists but not auto-triggered)
9. ❌ Invoice overdue → Send reminder (missing)
10. ❌ Invoice 30 days overdue → Escalate to admin (missing)

**Files Involved:**
- `src/pages/admin/invoices.tsx` (invoice UI)
- `src/services/invoiceGenerationService.ts` (generation logic)
- `src/services/invoiceService.ts` (invoice management)
- `src/services/billingEmailService.ts` (email automation)
- `src/services/accountingIntegrationService.ts` (Xero/QB sync)

**Missing Implementations:**
- [ ] Automatic invoice generation on order completion
- [ ] Auto-send invoice emails
- [ ] Payment received automation
- [ ] Receipt email automation
- [ ] Automatic accounting sync
- [ ] Overdue invoice reminders
- [ ] Escalation workflow

---

### **Payment Processing Flow**
**Trigger:** Client clicks "Pay Invoice" button

**If → Then Chain:**
1. ✅ Pay button clicked → Redirect to `/pay/invoice/[id]`
2. ✅ Payment page loaded → Fetch invoice details
3. ✅ PayFast selected → Initialize PayFast payment
4. ✅ Payment submitted → Redirect to PayFast
5. ⚠️ Payment success → PayFast webhook hits `/api/webhooks/payment-confirmation`
6. ⚠️ Webhook received → Verify payment signature (implemented)
7. ⚠️ Signature valid → Update invoice `paid_at` timestamp (implemented)
8. ❌ Invoice paid → Send receipt email (missing)
9. ❌ Invoice paid → Create payment ledger entry (missing)
10. ❌ Invoice paid → Sync to accounting software (missing)

**Files Involved:**
- `src/pages/pay/invoice/[id].tsx` (payment page)
- `src/pages/api/webhooks/payment-confirmation.ts` (webhook handler)
- `src/services/paymentProcessingService.ts` (payment logic)
- `src/lib/payfastService.ts` (PayFast integration)

**Missing Implementations:**
- [ ] Automatic receipt email
- [ ] Payment ledger entry creation
- [ ] Automatic accounting sync on payment
- [ ] Failed payment retry logic

---

## 🔔 NOTIFICATION SYSTEM

### **Notification Triggers**
**Current Implementation Status:**

**✅ Implemented Notifications:**
1. Driver assignment notification → Driver
2. Order confirmation → Company admin
3. User invitation → Invited user

**⚠️ Partially Implemented:**
1. Low stock alert → Shopping staff (UI exists, auto-trigger missing)
2. Equipment shortage → Company admin (UI exists, auto-trigger missing)

**❌ Missing Notifications:**
1. Order confirmed → Client
2. Order ready for pickup → Client
3. Driver en route → Client
4. Delivery completed → Client
5. Invoice generated → Client
6. Payment received → Client
7. Invoice overdue → Client
8. Prep time approaching → Kitchen staff
9. Cleaning schedule due → Cleaning staff
10. Equipment maintenance due → Company admin
11. Subscription expiring → Company admin
12. Trial ending soon → Company admin

**Files Involved:**
- `src/services/notificationService.ts` (notification creation)
- `src/services/emailService.ts` (email sending)
- `src/services/billingEmailService.ts` (billing emails)
- `src/components/notifications/NotificationBell.tsx` (in-app notifications)

**Missing Implementations:**
- [ ] Email notification templates for all triggers
- [ ] SMS notifications (WhatsApp integration exists but not used)
- [ ] Push notifications
- [ ] Notification preferences per user
- [ ] Notification scheduling

---

## 📧 EMAIL AUTOMATION SYSTEM

### **After-Sales Email Flow**
**Trigger:** Order status changes

**If → Then Chain:**
1. ✅ Status = `confirmed` → Queue confirmation email template
2. ❌ 24 hours before delivery → Send reminder email (missing)
3. ❌ Status = `delivered` → Send "How was it?" survey (missing)
4. ❌ Survey completed → Store feedback (missing)
5. ❌ 7 days after delivery → Send "Order again" email (missing)
6. ❌ 30 days after delivery → Send loyalty offer (missing)

**Files Involved:**
- `src/pages/admin/email-automation-dashboard.tsx` (automation UI)
- `src/pages/admin/email-automation-settings.tsx` (settings)
- `src/services/emailService.ts` (email sending)
- `src/lib/afterSalesAutomation.ts` (automation logic)
- `src/lib/afterSalesTemplates.ts` (email templates)

**Missing Implementations:**
- [ ] Scheduled email triggers
- [ ] Survey integration
- [ ] Feedback storage
- [ ] Loyalty program emails
- [ ] Email performance tracking

---

## 🏢 MULTI-TENANCY & COMPANY ISOLATION

### **Company Data Isolation**
**Trigger:** Any database query

**If → Then Chain:**
1. ✅ User authenticated → Get user profile
2. ✅ Profile loaded → Extract `company_id`
3. ✅ Query executed → RLS policy filters by `company_id`
4. ✅ User = `super_admin` → Bypass RLS (see all companies)
5. ✅ User = `company_admin` → See only own company data
6. ✅ User = staff/client → See only own company data

**RLS Policy Coverage:**
- ✅ 77/77 tables with `company_id` have RLS policies
- ✅ All policies enforce `company_id = get_user_company_id(auth.uid())`
- ✅ All policies allow `super_admin` override

**Files Involved:**
- `supabase/migrations/*_migration_*.sql` (RLS policies)
- `src/middleware.ts` (route-based company isolation)
- `src/lib/companyIsolation.ts` (isolation utilities)

**What Works:**
- ✅ Company admins cannot see other companies' data
- ✅ Super admins can see all companies
- ✅ URL-based routing enforces company context
- ✅ All database queries automatically filtered

**Missing Implementations:**
- [ ] Company-specific subdomain routing
- [ ] Company-specific branding per login page
- [ ] Company-specific email templates
- [ ] Inter-company data sharing (for partnerships)

---

## 🔗 THIRD-PARTY INTEGRATIONS

### **Accounting Software Sync**
**Trigger:** Invoice created or payment received

**If → Then Chain:**
1. ✅ Xero/QB connected → Store credentials in `accounting_integrations`
2. ⚠️ Invoice created → Sync to accounting software (manual only)
3. ❌ Payment received → Sync payment to accounting (missing auto-sync)
4. ❌ Sync fails → Retry with exponential backoff (missing)
5. ❌ Sync fails 3 times → Alert admin (missing)
6. ❌ Sync successful → Log sync record (partial)

**Files Involved:**
- `src/pages/admin/integrations.tsx` (integration UI)
- `src/services/accountingIntegrationService.ts` (sync logic)
- `src/services/xeroIntegrationService.ts` (Xero-specific)

**Missing Implementations:**
- [ ] Automatic sync on invoice creation
- [ ] Automatic sync on payment received
- [ ] Retry logic with backoff
- [ ] Sync failure alerts
- [ ] Complete sync logging

---

### **WhatsApp Integration**
**Trigger:** Admin sends WhatsApp message

**If → Then Chain:**
1. ✅ WhatsApp connected → Store API credentials
2. ✅ Template created → Store in `whatsapp_templates`
3. ⚠️ Message sent → Log in `whatsapp_messages` (manual only)
4. ❌ Message delivered → Update delivery status (missing webhook)
5. ❌ Message read → Update read status (missing webhook)
6. ❌ Customer replies → Store in conversation (missing)

**Files Involved:**
- `src/services/whatsappIntegrationService.ts` (API integration)
- `src/services/whatsappTemplateService.ts` (template management)
- `src/components/admin/WhatsAppTemplateManager.tsx` (UI)

**Missing Implementations:**
- [ ] Delivery status webhooks
- [ ] Read receipts
- [ ] Inbound message handling
- [ ] Conversation threading
- [ ] Automatic message triggers

---

## 🎮 GAMIFICATION SYSTEM

### **Points & Achievements Flow**
**Trigger:** Staff completes task

**If → Then Chain:**
1. ⚠️ Task completed → Award points (implemented but not auto-triggered)
2. ❌ Points threshold reached → Unlock achievement (missing)
3. ❌ Achievement unlocked → Send notification (missing)
4. ❌ Leaderboard updated → Notify team (missing)
5. ❌ Monthly winner → Award bonus (missing)

**Files Involved:**
- `src/services/gamificationService.ts` (points logic)
- `src/components/games/CateringDashGame.tsx` (game UI)

**Missing Implementations:**
- [ ] Automatic point awards on task completion
- [ ] Achievement system
- [ ] Leaderboard notifications
- [ ] Reward system

---

## 📊 ANALYTICS & REPORTING

### **Report Generation Flow**
**Trigger:** Admin views reports page

**If → Then Chain:**
1. ⚠️ Financial dashboard loaded → Calculate metrics (manual refresh)
2. ❌ Date range changed → Recalculate (missing real-time update)
3. ❌ Export clicked → Generate PDF/Excel (missing)
4. ❌ Scheduled report → Email to recipients (missing)

**Files Involved:**
- `src/pages/admin/financial-dashboard.tsx` (financial reports)
- `src/services/analyticsService.ts` (analytics logic)

**Missing Implementations:**
- [ ] Real-time metric updates
- [ ] Export to PDF/Excel
- [ ] Scheduled report emails
- [ ] Custom report builder
- [ ] Report templates

---

## 🔧 EQUIPMENT MANAGEMENT

### **Equipment Tracking Flow**
**Trigger:** Equipment assigned to order

**If → Then Chain:**
1. ⚠️ Order confirmed → Allocate equipment (partial)
2. ❌ Equipment allocated → Mark as `in_use` (missing status update)
3. ❌ Equipment in use → Track location (missing GPS integration)
4. ❌ Delivery completed → Mark as `available` (missing auto-return)
5. ❌ Equipment returned → Check condition (missing inspection flow)
6. ❌ Equipment damaged → Create damage report (feature exists but not auto-triggered)
7. ❌ Equipment maintenance due → Send alert (missing scheduler)

**Files Involved:**
- `src/services/equipmentTrackingService.ts` (tracking logic)
- `src/services/equipmentManagementService.ts` (management)
- `src/pages/admin/equipment-shortages.tsx` (shortage UI)

**Missing Implementations:**
- [ ] Automatic status updates
- [ ] GPS tracking integration
- [ ] Auto-return on delivery completion
- [ ] Inspection flow
- [ ] Automatic damage reporting
- [ ] Maintenance scheduler

---

## 🎯 PRIORITY IMPLEMENTATION ROADMAP

### **PHASE 1: Critical Automations (1-2 weeks)**
1. ✅ RLS policies (COMPLETED)
2. [ ] Automatic invoice generation on order completion
3. [ ] Automatic inventory deduction on order confirmation
4. [ ] Client notification emails (order confirmed, invoice sent)
5. [ ] Driver notification on assignment
6. [ ] Invoice overdue reminders

### **PHASE 2: Core Workflows (2-3 weeks)**
7. [ ] Automatic shopping list generation
8. [ ] Kitchen prep list automation
9. [ ] Equipment allocation and return automation
10. [ ] Payment webhook integration
11. [ ] Accounting software auto-sync
12. [ ] After-sales email automation

### **PHASE 3: Enhanced Features (3-4 weeks)**
13. [ ] GPS tracking automation
14. [ ] Route optimization improvements
15. [ ] Gamification point awards
16. [ ] Analytics dashboard improvements
17. [ ] Report scheduling
18. [ ] WhatsApp automation

### **PHASE 4: Advanced Features (4+ weeks)**
19. [ ] AI-powered recipe scaling
20. [ ] Predictive inventory management
21. [ ] Dynamic pricing
22. [ ] Customer loyalty program
23. [ ] Multi-language support
24. [ ] Mobile app integration

---

## 📋 TESTING CHECKLIST

### **Critical Flows to Test:**
- [ ] Company signup → User creation → Profile creation → Email confirmation
- [ ] Login → Role detection → Correct dashboard redirect
- [ ] Order creation → Inventory deduction → Equipment allocation
- [ ] Order completion → Invoice generation → Payment processing
- [ ] Driver assignment → Notification → Confirmation
- [ ] Company admin can only see own company data
- [ ] Super admin can see all companies

---

## 🎓 DEVELOPER NOTES

**Code Patterns to Follow:**
1. **Service Layer Pattern:** All business logic in `src/services/`
2. **RLS First:** Never query without company_id filter
3. **Trigger Happy:** Use database triggers for cascading updates
4. **Async Everything:** All external calls should be non-blocking
5. **Error Boundaries:** Wrap all async operations in try/catch
6. **Type Safety:** Use generated Supabase types everywhere

**Anti-Patterns to Avoid:**
1. ❌ Direct database calls from React components
2. ❌ Hardcoded company_id values
3. ❌ Missing error handling on external API calls
4. ❌ Synchronous processing of long-running tasks
5. ❌ Storing sensitive data in local storage

---

**Last Updated:** 2026-04-25  
**Next Review:** After Phase 1 completion  
**Maintained By:** Development Team