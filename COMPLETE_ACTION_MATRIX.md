# CateringMS Platform - Complete Action-Trigger-Notification Matrix

## Executive Summary
This document maps EVERY user action across all 4 journeys in the CateringMS platform. Each action shows:
- What triggers it
- What happens in the system
- Who gets notified
- How they're notified (Email/WhatsApp/SMS/In-Portal)
- What the next actions are

---

## THE 4 CORE USER JOURNEYS

### Journey 1: CateringMS Platform Admins (Super Admins)
**Role:** Platform owners managing all catering companies

### Journey 2: Catering Company Admins  
**Role:** Business owners who signed up for CateringMS

### Journey 3: Company Staff
**Roles:** Kitchen Staff, Drivers, Cleaning Staff, Shopping Staff

### Journey 4: Clients
**Role:** Event organizers booking catering services

---

## JOURNEY 1: CateringMS PLATFORM ADMIN ACTIONS

### 1.1 Company Signs Up (Triggered by Company Admin)

**ACTION:** New catering company completes signup form
**TRIGGERS:**
- `companies` table: New record created
- `profiles` table: Admin user profile created
- `company_subscriptions` table: Trial subscription record created
- `company_trial_tracking` table: Trial tracking initialized

**WHO GETS NOTIFIED:**
1. **CateringMS Platform Admin** (You/Alex)
   - Method: Email + In-Portal Dashboard
   - Content: "New company signed up: [Company Name]"
   - Action Available: Review company, approve/reject, set up payment

2. **New Company Admin**
   - Method: Email (Welcome email)
   - Content: "Welcome to CateringMS! Your company slug is: [slug]"
   - Action Available: Login to their portal at `cateringms.com/[slug]/auth/login`

**INTEGRATION REQUIRED:**
- ✅ Email service (SendGrid/Resend)
- ✅ Payment gateway (PayFast/Stripe) - for trial end and subscriptions

**CODE IMPLEMENTATION:**
- Service: `src/services/companyService.ts` → `createCompany()`
- Email: `src/services/emailAutomationService.ts` → `sendWelcomeEmail()`
- Dashboard: `src/pages/cateringms-platform/company-database.tsx`

**NEXT ACTIONS:**
- Company Admin: Complete onboarding, add staff, configure settings
- Platform Admin: Monitor trial usage, prepare for payment collection

---

### 1.2 Trial Period Ending (3 Days Before Expiry)

**ACTION:** Automated check runs daily (cron job or scheduled function)
**TRIGGERS:**
- Email notification sent to company admin
- In-portal banner shown to company admin

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: Email + In-Portal Banner
   - Content: "Your trial expires in 3 days. Upgrade to continue service."
   - Action Available: Click "Upgrade Now" → Go to payment page

2. **CateringMS Platform Admin**
   - Method: In-Portal Dashboard
   - Content: "Company [Name] trial expires in 3 days"
   - Action Available: Send reminder, offer assistance

**INTEGRATION REQUIRED:**
- ✅ Automated email service
- ✅ Scheduled function (Edge Function or cron)

**CODE IMPLEMENTATION:**
- Service: `src/services/subscriptionService.ts` → `checkTrialExpiry()`
- Email: `src/services/billingEmailService.ts` → `sendTrialExpiringEmail()`
- Banner: `src/components/TrialExpiryBanner.tsx`

**NEXT ACTIONS:**
- Company Admin: Upgrade subscription
- Platform Admin: Follow up if no action taken

---

### 1.3 Trial Expired - No Payment

**ACTION:** Trial end date reached, no payment received
**TRIGGERS:**
- `company_subscriptions` table: Status changed to 'expired'
- Company portal access restricted
- Email sent to company admin

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: Email + Portal Lockout Screen
   - Content: "Your trial has expired. Upgrade to restore access."
   - Action Available: Pay now to restore access

2. **CateringMS Platform Admin**
   - Method: In-Portal Dashboard + Email
   - Content: "Company [Name] trial expired - no payment"
   - Action Available: Contact company, offer assistance, archive if needed

**INTEGRATION REQUIRED:**
- ✅ Payment gateway
- ✅ Portal access control

**CODE IMPLEMENTATION:**
- Service: `src/services/subscriptionService.ts` → `handleTrialExpiry()`
- Guard: `src/lib/authGuards.ts` → `checkSubscriptionStatus()`

**NEXT ACTIONS:**
- Company Admin: Make payment to restore
- Platform Admin: Archive or delete company after grace period

---

### 1.4 Payment Received (Subscription Upgrade)

**ACTION:** Company admin completes payment
**TRIGGERS:**
- `company_subscriptions` table: Status changed to 'active'
- `payment_ledger` table: Payment record created
- Portal access restored
- Receipt generated

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: Email + In-Portal Confirmation
   - Content: "Payment received! Your subscription is now active."
   - Action Available: Continue using platform

2. **CateringMS Platform Admin**
   - Method: In-Portal Dashboard + Email
   - Content: "Payment received from [Company Name]: R[Amount]"
   - Action Available: Send invoice, update records

**INTEGRATION REQUIRED:**
- ✅ Payment gateway webhook (PayFast/Stripe)
- ✅ Receipt generation
- ✅ Email service

**CODE IMPLEMENTATION:**
- Service: `src/services/paymentProcessingService.ts` → `handlePaymentSuccess()`
- Webhook: `src/pages/api/webhooks/payment-confirmation.ts`
- Email: `src/services/billingEmailService.ts` → `sendPaymentReceiptEmail()`

**NEXT ACTIONS:**
- Company Admin: Use platform features
- Platform Admin: Monitor monthly recurring payments

---

### 1.5 Monthly Recurring Payment

**ACTION:** Automated monthly charge (subscription renewal)
**TRIGGERS:**
- Payment gateway charges card
- `payment_ledger` table: New payment record
- Receipt emailed to company

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: Email
   - Content: "Monthly subscription payment successful: R[Amount]"
   - Action Available: View receipt, manage subscription

2. **CateringMS Platform Admin**
   - Method: In-Portal Dashboard
   - Content: "Recurring payment received from [Company]"
   - Action Available: Monitor revenue

**INTEGRATION REQUIRED:**
- ✅ Payment gateway recurring billing
- ✅ Automated email

**CODE IMPLEMENTATION:**
- Service: `src/services/subscriptionService.ts` → `handleRecurringPayment()`
- Webhook: `src/pages/api/webhooks/payment-confirmation.ts`

**NEXT ACTIONS:**
- Company Admin: Continue using service
- Platform Admin: Track MRR (Monthly Recurring Revenue)

---

### 1.6 Payment Failed (Card Declined)

**ACTION:** Monthly payment attempt fails
**TRIGGERS:**
- `company_subscriptions` table: Status flagged as 'payment_failed'
- Grace period begins (3-7 days)
- Email sent to company admin

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: Email + In-Portal Banner
   - Content: "Payment failed. Please update payment method."
   - Action Available: Update card details, retry payment

2. **CateringMS Platform Admin**
   - Method: In-Portal Dashboard + Email Alert
   - Content: "Payment failed for [Company Name]"
   - Action Available: Contact company, offer help

**INTEGRATION REQUIRED:**
- ✅ Payment gateway failure webhook
- ✅ Retry logic

**CODE IMPLEMENTATION:**
- Service: `src/services/paymentProcessingService.ts` → `handlePaymentFailure()`
- Email: `src/services/billingEmailService.ts` → `sendPaymentFailedEmail()`

**NEXT ACTIONS:**
- Company Admin: Update payment method within grace period
- Platform Admin: Follow up after 3 days if not resolved

---

### 1.7 Grace Period Expired - Suspend Account

**ACTION:** Grace period ends, payment still failed
**TRIGGERS:**
- `company_subscriptions` table: Status changed to 'suspended'
- Portal access restricted (read-only mode)
- All automated services paused

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: Email + Portal Lockout
   - Content: "Account suspended due to payment failure. Pay now to restore."
   - Action Available: Make payment immediately

2. **CateringMS Platform Admin**
   - Method: In-Portal Dashboard
   - Content: "Company [Name] suspended - payment overdue"
   - Action Available: Contact company, plan archive/deletion

**INTEGRATION REQUIRED:**
- ✅ Access control system
- ✅ Service suspension logic

**CODE IMPLEMENTATION:**
- Service: `src/services/subscriptionService.ts` → `suspendCompany()`
- Guard: `src/lib/authGuards.ts` → `checkSubscriptionStatus()`

**NEXT ACTIONS:**
- Company Admin: Pay immediately to restore
- Platform Admin: Archive company after 30 days if no payment

---

## JOURNEY 2: CATERING COMPANY ADMIN ACTIONS

### 2.1 Admin Logs In First Time

**ACTION:** New company admin logs in for first time after signup
**TRIGGERS:**
- Onboarding wizard displayed
- Tutorial tooltips shown
- Welcome dashboard message

**WHO GETS NOTIFIED:**
- No external notifications (internal UI guidance)

**INTEGRATION REQUIRED:**
- ✅ Onboarding UI system

**CODE IMPLEMENTATION:**
- Service: `src/services/onboardingService.ts` → `initializeOnboarding()`
- Page: `src/pages/[companySlug]/admin/onboarding.tsx`
- Component: `src/components/OnboardingProgressTracker.tsx`

**NEXT ACTIONS:**
- Admin: Complete onboarding steps
  1. Add company details
  2. Upload logo
  3. Configure email templates
  4. Add first staff member
  5. Create first menu item

---

### 2.2 Admin Adds Staff Member

**ACTION:** Admin invites staff member (Kitchen/Driver/Cleaning/Shopping)
**TRIGGERS:**
- `profiles` table: New user profile created with assigned role
- `company_staff` table: Staff member linked to company
- Invitation email sent to staff member

**WHO GETS NOTIFIED:**
1. **New Staff Member**
   - Method: Email
   - Content: "You've been invited to join [Company Name] as [Role]"
   - Action Available: Click link → Sign up at `[slug]/signup?role=[role]`

2. **Company Admin**
   - Method: In-Portal Confirmation
   - Content: "Staff member [Name] invited successfully"
   - Action Available: Track if they've signed up

**INTEGRATION REQUIRED:**
- ✅ Email service
- ✅ User invitation system

**CODE IMPLEMENTATION:**
- Service: `src/services/userManagementService.ts` → `inviteStaffMember()`
- Email: `src/services/emailAutomationService.ts` → `sendStaffInvitationEmail()`

**NEXT ACTIONS:**
- Staff Member: Sign up, complete profile
- Admin: Monitor staff activation

---

### 2.3 Admin Creates/Updates Email Template

**ACTION:** Admin customizes email template for quotes/orders
**TRIGGERS:**
- `email_templates` table: Template saved
- Preview email sent to admin's email (optional)

**WHO GETS NOTIFIED:**
- No immediate notifications (saved for future use)

**INTEGRATION REQUIRED:**
- ✅ Template storage
- ✅ Preview email capability

**CODE IMPLEMENTATION:**
- Service: `src/services/emailAutomationService.ts` → `saveEmailTemplate()`
- Page: `src/pages/admin/email-templates.tsx`

**NEXT ACTIONS:**
- Admin: Test template by creating quote/order
- System: Use template when quote/order emails are triggered

---

### 2.4 Admin Configures WhatsApp Integration

**ACTION:** Admin connects WhatsApp Business API
**TRIGGERS:**
- `company_settings` table: WhatsApp credentials stored
- WhatsApp templates created/imported
- Test message sent to verify connection

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal + WhatsApp Test Message
   - Content: "WhatsApp integration successful!"
   - Action Available: Configure message templates

**INTEGRATION REQUIRED:**
- ✅ WhatsApp Business API
- ✅ Template management system

**CODE IMPLEMENTATION:**
- Service: `src/services/whatsappIntegrationService.ts` → `connectWhatsApp()`
- Service: `src/services/whatsappTemplateService.ts` → `syncTemplates()`

**NEXT ACTIONS:**
- Admin: Set up message templates for quotes, orders, updates
- System: Send WhatsApp notifications when events occur

---

### 2.5 Admin Sets Pricing/Packages

**ACTION:** Admin creates/updates pricing packages
**TRIGGERS:**
- `packages` table: Package records created/updated
- Pricing available for quote generation

**WHO GETS NOTIFIED:**
- No notifications (internal configuration)

**INTEGRATION REQUIRED:**
- None (internal data)

**CODE IMPLEMENTATION:**
- Service: Custom pricing service (to be implemented)
- Page: Admin pricing management page

**NEXT ACTIONS:**
- Admin: Use packages when creating quotes
- System: Display packages to clients requesting quotes

---

## JOURNEY 3: COMPANY STAFF ACTIONS

### 3.1 KITCHEN STAFF ACTIONS

#### 3.1.1 Kitchen Staff Signs Up

**ACTION:** Kitchen staff signs up via invitation link
**TRIGGERS:**
- `profiles` table: Profile created with role 'kitchen'
- Staff member linked to company
- Access granted to kitchen portal

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal + Email
   - Content: "[Staff Name] has joined your team as Kitchen Staff"
   - Action Available: Assign tasks, grant permissions

**INTEGRATION REQUIRED:**
- ✅ User authentication
- ✅ Role-based access control

**CODE IMPLEMENTATION:**
- Service: `src/services/authService.ts` → `signUp()`
- Service: `src/services/userManagementService.ts` → `linkStaffToCompany()`

**NEXT ACTIONS:**
- Kitchen Staff: Access kitchen portal, view assigned tasks
- Admin: Assign first tasks

---

#### 3.1.2 Kitchen Staff Clocks In (Goes On Duty)

**ACTION:** Staff member clicks "Clock In" in kitchen portal
**TRIGGERS:**
- `time_clock` table: Clock-in time recorded
- `kitchen_duty` table: Staff marked as "on duty"
- Dashboard updated to show staff availability

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal Dashboard
   - Content: "[Staff Name] is now on duty"
   - Action Available: Assign urgent tasks

2. **Other Kitchen Staff (Optional)**
   - Method: In-Portal
   - Content: "[Staff Name] joined the shift"
   - Action Available: Coordinate tasks

**INTEGRATION REQUIRED:**
- None (internal system)

**CODE IMPLEMENTATION:**
- Service: `src/services/timeClockService.ts` → `clockIn()`
- Service: `src/services/kitchenDutyService.ts` → `setOnDuty()`
- Component: `src/components/kitchen/DutyToggleWidget.tsx`

**NEXT ACTIONS:**
- Kitchen Staff: View assigned prep tasks
- System: Show staff in "On Duty Board"

---

#### 3.1.3 Kitchen Staff Completes Prep Task

**ACTION:** Staff marks prep task as complete
**TRIGGERS:**
- `prep_tasks` table: Status changed to 'completed'
- Completion time recorded
- Progress tracker updated

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal Dashboard
   - Content: "Prep task '[Task Name]' completed by [Staff Name]"
   - Action Available: Review quality, approve task

2. **Head Chef (if assigned)**
   - Method: In-Portal
   - Content: "Task completed - ready for review"
   - Action Available: Approve or request revision

**INTEGRATION REQUIRED:**
- None (internal system)

**CODE IMPLEMENTATION:**
- Service: Custom prep task service (to be implemented)
- Component: `src/components/kitchen/TaskCompletionButtons.tsx`

**NEXT ACTIONS:**
- Admin/Head Chef: Review and approve
- Kitchen Staff: Move to next task

---

#### 3.1.4 Kitchen Staff Clocks Out

**ACTION:** Staff clicks "Clock Out"
**TRIGGERS:**
- `time_clock` table: Clock-out time recorded
- Total hours calculated
- Staff removed from "on duty" list

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal Dashboard
   - Content: "[Staff Name] clocked out - [X] hours worked"
   - Action Available: Review time sheet, approve hours

**INTEGRATION REQUIRED:**
- None (internal system)

**CODE IMPLEMENTATION:**
- Service: `src/services/timeClockService.ts` → `clockOut()`

**NEXT ACTIONS:**
- Admin: Review and approve hours for payroll
- System: Calculate weekly hours for reporting

---

### 3.2 DRIVER ACTIONS

#### 3.2.1 Driver Signs Up

**ACTION:** Driver signs up via company invitation link
**TRIGGERS:**
- `profiles` table: Profile created with role 'driver'
- `drivers` table: Driver record created
- Driver linked to company
- Access granted to driver portal

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal + Email
   - Content: "[Driver Name] has joined your team"
   - Action Available: Assign first delivery

**INTEGRATION REQUIRED:**
- ✅ User authentication
- ✅ Role-based access control

**CODE IMPLEMENTATION:**
- Service: `src/services/authService.ts` → `signUp()`
- Service: `src/services/driverService.ts` → `createDriverProfile()`

**NEXT ACTIONS:**
- Driver: Complete driver profile (vehicle, license)
- Admin: Verify driver documents, assign deliveries

---

#### 3.2.2 Driver Confirms Availability for Delivery

**ACTION:** Driver receives delivery assignment, confirms acceptance
**TRIGGERS:**
- `order_assignments` table: Driver linked to order
- `driver_confirmations` table: Confirmation recorded
- Departure time calculated

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal + WhatsApp (if configured)
   - Content: "[Driver Name] confirmed delivery for Order #[ID]"
   - Action Available: View delivery details

2. **Client**
   - Method: Email + WhatsApp + In-Portal
   - Content: "Your delivery has been assigned to [Driver Name]"
   - Action Available: Track delivery in real-time

**INTEGRATION REQUIRED:**
- ✅ WhatsApp Business API
- ✅ Email service
- ✅ Real-time notifications

**CODE IMPLEMENTATION:**
- Service: `src/services/driverConfirmationService.ts` → `confirmDelivery()`
- Service: `src/services/realtimeNotificationService.ts` → `sendDriverConfirmedNotification()`

**NEXT ACTIONS:**
- Driver: Calculate departure time, start journey
- Client: Track driver location
- Admin: Monitor delivery progress

---

#### 3.2.3 Driver Starts GPS Tracking

**ACTION:** Driver clicks "Start Journey"
**TRIGGERS:**
- `driver_locations` table: Location tracking begins
- Real-time GPS updates every 30 seconds
- Client tracking link activated

**WHO GETS NOTIFIED:**
1. **Client**
   - Method: SMS + WhatsApp + Email
   - Content: "Your driver has started the journey! Track here: [link]"
   - Action Available: Click link to view live map

2. **Company Admin**
   - Method: In-Portal Dashboard
   - Content: "Driver en route for Order #[ID]"
   - Action Available: Monitor delivery progress

**INTEGRATION REQUIRED:**
- ✅ GPS tracking system
- ✅ Google Maps API
- ✅ Real-time database updates
- ✅ SMS service (Twilio)
- ✅ WhatsApp Business API

**CODE IMPLEMENTATION:**
- Component: `src/components/tracking/DriverGPSTracker.tsx`
- Service: `src/services/driverService.ts` → `startTracking()`
- Service: `src/services/realtimeNotificationService.ts` → `sendTrackingLinkNotification()`

**NEXT ACTIONS:**
- Client: Watch driver approach in real-time
- Driver: Complete delivery
- Admin: Monitor ETA accuracy

---

#### 3.2.4 Driver Arrives at Venue

**ACTION:** Driver arrives (GPS detects proximity or manual confirmation)
**TRIGGERS:**
- `order_assignments` table: Status updated to 'arrived'
- Arrival time recorded

**WHO GETS NOTIFIED:**
1. **Client**
   - Method: SMS + WhatsApp + In-Portal
   - Content: "Your driver has arrived!"
   - Action Available: Coordinate with driver

2. **Company Admin**
   - Method: In-Portal
   - Content: "Driver arrived for Order #[ID]"
   - Action Available: Monitor unloading/setup

**INTEGRATION REQUIRED:**
- ✅ Geofencing (proximity detection)
- ✅ SMS/WhatsApp services

**CODE IMPLEMENTATION:**
- Service: `src/services/driverService.ts` → `markArrived()`
- Service: `src/services/proximityService.ts` → `detectArrival()`

**NEXT ACTIONS:**
- Driver: Unload equipment, set up
- Client: Inspect delivery
- Admin: Track completion time

---

#### 3.2.5 Driver Completes Delivery

**ACTION:** Driver clicks "Complete Delivery"
**TRIGGERS:**
- `order_assignments` table: Status changed to 'completed'
- Completion time recorded
- Driver earnings calculated
- GPS tracking stops

**WHO GETS NOTIFIED:**
1. **Client**
   - Method: Email + WhatsApp + In-Portal
   - Content: "Delivery completed! Enjoy your event!"
   - Action Available: Rate driver, report issues

2. **Company Admin**
   - Method: In-Portal Dashboard
   - Content: "Order #[ID] delivered successfully by [Driver]"
   - Action Available: Review delivery, process payment

3. **Driver**
   - Method: In-Portal
   - Content: "Delivery completed! You earned R[Amount]"
   - Action Available: View earnings summary

**INTEGRATION REQUIRED:**
- ✅ Earnings calculation
- ✅ Email/WhatsApp services

**CODE IMPLEMENTATION:**
- Service: `src/services/driverService.ts` → `completeDelivery()`
- Component: `src/components/DriverEarnings.tsx`

**NEXT ACTIONS:**
- Client: Use equipment for event
- Driver: Available for next delivery
- Admin: Process driver payment

---

#### 3.2.6 Driver Reports Issue (Replacement Request)

**ACTION:** Driver unable to complete delivery, requests replacement
**TRIGGERS:**
- `driver_replacement_requests` table: Request created
- Status: 'pending'
- Urgent notification to admin

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: SMS + WhatsApp + Email + In-Portal URGENT ALERT
   - Content: "🚨 URGENT: Driver [Name] needs replacement for Order #[ID]"
   - Action Available: Assign replacement driver immediately

2. **Available Drivers**
   - Method: SMS + WhatsApp
   - Content: "Emergency delivery needed - can you help?"
   - Action Available: Accept replacement delivery

**INTEGRATION REQUIRED:**
- ✅ Urgent notification system
- ✅ SMS/WhatsApp rapid delivery

**CODE IMPLEMENTATION:**
- Service: `src/services/driverReplacementService.ts` → `createReplacementRequest()`
- Component: `src/components/driver/DriverReplacementRequest.tsx`

**NEXT ACTIONS:**
- Admin: Find replacement driver ASAP
- Available Drivers: Accept or decline
- Client: Notified of delay (if applicable)

---

### 3.3 CLEANING STAFF ACTIONS

#### 3.3.1 Cleaning Staff Signs Up

**ACTION:** Cleaning staff signs up via invitation
**TRIGGERS:**
- `profiles` table: Profile created with role 'cleaning'
- Staff linked to company
- Access to cleaning portal granted

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal + Email
   - Content: "[Staff Name] joined as Cleaning Staff"
   - Action Available: Assign cleaning tasks

**CODE IMPLEMENTATION:**
- Service: `src/services/authService.ts` → `signUp()`

**NEXT ACTIONS:**
- Cleaning Staff: Access cleaning portal
- Admin: Assign first cleaning task

---

#### 3.3.2 Cleaning Staff Clocks In

**ACTION:** Staff clocks in for cleaning shift
**TRIGGERS:**
- `time_clock` table: Clock-in recorded
- Staff marked as available for cleaning tasks

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal
   - Content: "[Staff Name] is on cleaning duty"
   - Action Available: Assign equipment cleaning tasks

**CODE IMPLEMENTATION:**
- Component: `src/components/cleaning/CleaningDutyWidget.tsx`
- Service: `src/services/timeClockService.ts` → `clockIn()`

**NEXT ACTIONS:**
- Cleaning Staff: View assigned equipment
- Admin: Monitor cleaning progress

---

#### 3.3.3 Cleaning Staff Starts Equipment Verification

**ACTION:** Staff scans/selects equipment to clean
**TRIGGERS:**
- `equipment_cleaning_logs` table: Cleaning task created
- Equipment status: 'being_cleaned'

**WHO GETS NOTIFIED:**
- No immediate notifications (internal tracking)

**CODE IMPLEMENTATION:**
- Component: `src/components/cleaning/EquipmentVerificationPanel.tsx`
- Service: `src/services/equipmentTrackingService.ts` → `startCleaning()`

**NEXT ACTIONS:**
- Cleaning Staff: Complete cleaning checklist
- System: Track cleaning time

---

#### 3.3.4 Cleaning Staff Marks Equipment Clean

**ACTION:** Staff completes cleaning, marks equipment as clean
**TRIGGERS:**
- `equipment_cleaning_logs` table: Status 'completed'
- `equipment_inventory` table: Status 'available'
- Equipment ready for next order

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal Dashboard
   - Content: "[Equipment Name] cleaned by [Staff Name] - now available"
   - Action Available: View equipment availability

**CODE IMPLEMENTATION:**
- Service: `src/services/equipmentTrackingService.ts` → `completeCleaning()`

**NEXT ACTIONS:**
- Admin: Equipment available for next booking
- System: Update inventory availability

---

#### 3.3.5 Cleaning Staff Reports Broken Equipment

**ACTION:** Staff finds damaged equipment during cleaning
**TRIGGERS:**
- `broken_equipment` table: Report created
- Equipment status: 'broken'
- Equipment removed from available inventory
- Urgent admin notification

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal URGENT + Email
   - Content: "⚠️ Equipment broken: [Equipment Name] reported by [Staff]"
   - Action Available: Review damage, order replacement, repair

**INTEGRATION REQUIRED:**
- ✅ Equipment tracking system
- ✅ Urgent notifications

**CODE IMPLEMENTATION:**
- Component: `src/components/cleaning/BrokenEquipmentDashboard.tsx`
- Service: `src/services/equipmentService.ts` → `reportBroken()`

**NEXT ACTIONS:**
- Admin: Assess damage, decide repair vs replace
- System: Update available inventory
- Prevent equipment from being assigned to orders

---

### 3.4 SHOPPING STAFF ACTIONS

#### 3.4.1 Shopping Staff Signs Up

**ACTION:** Shopping staff signs up via invitation
**TRIGGERS:**
- `profiles` table: Profile created with role 'shopping'
- Staff linked to company
- Access to shopping portal granted

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal + Email
   - Content: "[Staff Name] joined as Shopping Staff"
   - Action Available: Assign shopping lists

**CODE IMPLEMENTATION:**
- Service: `src/services/authService.ts` → `signUp()`

**NEXT ACTIONS:**
- Shopping Staff: Access shopping portal
- Admin: Create first shopping list

---

#### 3.4.2 Shopping Staff Receives Shopping List

**ACTION:** Admin creates shopping list for upcoming order
**TRIGGERS:**
- `shopping_lists` table: List created
- Items linked to specific order
- Staff assigned to list

**WHO GETS NOTIFIED:**
1. **Shopping Staff**
   - Method: In-Portal + WhatsApp (if configured)
   - Content: "New shopping list assigned: [X] items for Order #[ID]"
   - Action Available: View list, start shopping

**INTEGRATION REQUIRED:**
- ✅ WhatsApp notifications

**CODE IMPLEMENTATION:**
- Service: `src/services/shoppingService.ts` → `createShoppingList()`

**NEXT ACTIONS:**
- Shopping Staff: Review list, go shopping
- System: Track shopping progress

---

#### 3.4.3 Shopping Staff Marks Items Purchased

**ACTION:** Staff checks off items as they shop
**TRIGGERS:**
- `shopping_list_items` table: Status updated to 'purchased'
- Progress tracker updated
- Receipt scanning available

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal Dashboard (real-time)
   - Content: "Shopping progress: [X] of [Y] items purchased"
   - Action Available: Monitor spending

**CODE IMPLEMENTATION:**
- Service: `src/services/shoppingService.ts` → `markItemPurchased()`
- Component: `src/components/ReceiptScanner.tsx`

**NEXT ACTIONS:**
- Shopping Staff: Complete list
- Admin: Review receipts and costs

---

#### 3.4.4 Shopping Staff Uploads Receipt

**ACTION:** Staff scans/uploads receipt for reimbursement
**TRIGGERS:**
- `receipts` table: Receipt image stored
- OCR processing (optional)
- Amount added to reimbursement request

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal
   - Content: "Receipt uploaded by [Staff]: R[Amount]"
   - Action Available: Review and approve reimbursement

**INTEGRATION REQUIRED:**
- ✅ File storage (Supabase Storage)
- ✅ OCR service (optional - Google Vision API)

**CODE IMPLEMENTATION:**
- Component: `src/components/ReceiptScanner.tsx`
- Service: Custom receipt service (to be implemented)

**NEXT ACTIONS:**
- Admin: Approve reimbursement
- Finance: Process payment to staff

---

#### 3.4.5 Shopping Staff Completes Shopping

**ACTION:** All items purchased, shopping list marked complete
**TRIGGERS:**
- `shopping_lists` table: Status 'completed'
- Total cost calculated
- Items marked as "in stock"

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal + Email
   - Content: "Shopping completed for Order #[ID] - Total: R[Amount]"
   - Action Available: Review costs, approve reimbursement

2. **Kitchen Staff** (if applicable)
   - Method: In-Portal
   - Content: "Ingredients arrived - ready for prep"
   - Action Available: Start food preparation

**CODE IMPLEMENTATION:**
- Service: `src/services/shoppingService.ts` → `completeShoppingList()`

**NEXT ACTIONS:**
- Admin: Approve costs
- Kitchen: Start prep work
- Finance: Reimburse shopping staff

---

## JOURNEY 4: CLIENT ACTIONS

### 4.1 Client Lands on Company Website

**ACTION:** Client visits catering company's website (via slug URL)
**TRIGGERS:**
- Page view tracked
- Analytics recorded

**WHO GETS NOTIFIED:**
- No notifications (anonymous browsing)

**INTEGRATION REQUIRED:**
- ✅ Analytics (optional)

**CODE IMPLEMENTATION:**
- Dynamic routing: `src/pages/[companySlug]/index.tsx`

**NEXT ACTIONS:**
- Client: Browse services, request quote
- System: Track conversion funnel

---

### 4.2 Client Requests Quote

**ACTION:** Client fills out quote request form
**TRIGGERS:**
- `leads` table: New lead created
- `quotes` table: New quote record created (status: 'draft')
- Admin notified immediately

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: Email + WhatsApp + SMS + In-Portal
   - Content: "🎉 New quote request from [Client Name]!"
   - Action Available: Review details, create custom quote

2. **Client**
   - Method: Email (auto-reply)
   - Content: "We received your quote request! We'll get back to you within 24 hours."
   - Action Available: Wait for custom quote

**INTEGRATION REQUIRED:**
- ✅ Email service
- ✅ WhatsApp Business API
- ✅ SMS service (optional)

**CODE IMPLEMENTATION:**
- Service: `src/services/quoteService.ts` → `createQuoteRequest()`
- Service: `src/services/leadService.ts` → `createLead()`
- Service: `src/services/emailAutomationService.ts` → `sendQuoteRequestConfirmation()`

**NEXT ACTIONS:**
- Admin: Create custom quote with pricing
- Client: Wait for quote email

---

### 4.3 Admin Creates Custom Quote

**ACTION:** Admin reviews lead, creates custom quote with pricing
**TRIGGERS:**
- `quotes` table: Quote updated with line items and total
- Status changed to 'sent'
- Quote PDF generated
- Email sent to client

**WHO GETS NOTIFIED:**
1. **Client**
   - Method: Email + WhatsApp (if configured)
   - Content: "Your custom quote is ready! Total: R[Amount]"
   - Action Available: Review quote, accept/decline

**INTEGRATION REQUIRED:**
- ✅ PDF generation
- ✅ Email service with PDF attachment
- ✅ WhatsApp document sending (optional)

**CODE IMPLEMENTATION:**
- Service: `src/services/quoteService.ts` → `sendQuoteToClient()`
- Service: `src/services/emailAutomationService.ts` → `sendQuoteEmail()`
- Component: Quote generation UI

**NEXT ACTIONS:**
- Client: Review quote, decide to accept or negotiate
- Admin: Wait for client response

---

### 4.4 Client Accepts Quote

**ACTION:** Client clicks "Accept Quote" in email or portal
**TRIGGERS:**
- `quotes` table: Status changed to 'accepted'
- `orders` table: New order created from quote
- Order status: 'pending_deposit'
- Payment link generated

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: Email + WhatsApp + In-Portal
   - Content: "🎉 Quote accepted by [Client Name]! Order #[ID] created."
   - Action Available: Send payment link, assign staff

2. **Client**
   - Method: Email + WhatsApp
   - Content: "Quote accepted! Pay deposit to confirm booking: [Payment Link]"
   - Action Available: Pay deposit (20-50% typically)

**INTEGRATION REQUIRED:**
- ✅ Payment gateway (PayFast/Stripe)
- ✅ Payment link generation
- ✅ Email/WhatsApp services

**CODE IMPLEMENTATION:**
- Service: `src/services/quoteService.ts` → `acceptQuote()`
- Service: `src/services/orderService.ts` → `createOrderFromQuote()`
- Service: `src/services/paymentProcessingService.ts` → `generatePaymentLink()`

**NEXT ACTIONS:**
- Client: Pay deposit within 48 hours
- Admin: Monitor payment status
- System: Set payment deadline reminder

---

### 4.5 Client Declines Quote

**ACTION:** Client clicks "Decline" or responds with objections
**TRIGGERS:**
- `quotes` table: Status changed to 'declined'
- Decline reason recorded (if provided)

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal + Email
   - Content: "Quote declined by [Client Name]. Reason: [Reason]"
   - Action Available: Follow up, send revised quote, mark as lost

**CODE IMPLEMENTATION:**
- Service: `src/services/quoteService.ts` → `declineQuote()`

**NEXT ACTIONS:**
- Admin: Follow up with client, understand objections
- Admin: Send revised quote with adjusted pricing (if applicable)

---

### 4.6 Client Pays Deposit

**ACTION:** Client completes deposit payment via payment link
**TRIGGERS:**
- `payment_ledger` table: Deposit payment recorded
- `orders` table: Status changed to 'confirmed'
- Order locked in
- Confirmation email/WhatsApp sent

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: Email + WhatsApp + In-Portal
   - Content: "💰 Deposit received for Order #[ID]: R[Amount]"
   - Action Available: Start order preparation, assign staff

2. **Client**
   - Method: Email + WhatsApp
   - Content: "Deposit received! Your event is confirmed for [Date]."
   - Action Available: View order details, track progress

3. **All Relevant Staff** (Kitchen, Shopping, Drivers)
   - Method: In-Portal
   - Content: "New confirmed order: [Event Name] on [Date]"
   - Action Available: View assigned tasks

**INTEGRATION REQUIRED:**
- ✅ Payment gateway webhook
- ✅ Receipt generation
- ✅ Email/WhatsApp services

**CODE IMPLEMENTATION:**
- Webhook: `src/pages/api/webhooks/payment-confirmation.ts`
- Service: `src/services/paymentProcessingService.ts` → `handleDepositPayment()`
- Service: `src/services/orderService.ts` → `confirmOrder()`

**NEXT ACTIONS:**
- Admin: Assign kitchen staff, shopping staff, driver
- Kitchen: Add prep tasks
- Shopping: Create shopping list
- Driver: Note delivery date/time

---

### 4.7 Order Preparation Begins

**ACTION:** Admin assigns staff to order tasks
**TRIGGERS:**
- `prep_tasks` table: Tasks created for kitchen staff
- `shopping_lists` table: Shopping list created
- `order_assignments` table: Driver assigned
- Equipment reserved

**WHO GETS NOTIFIED:**
1. **Kitchen Staff**
   - Method: In-Portal + WhatsApp
   - Content: "New prep tasks assigned for [Event Name]"
   - Action Available: View tasks, start prep

2. **Shopping Staff**
   - Method: In-Portal + WhatsApp
   - Content: "Shopping list ready for Order #[ID]"
   - Action Available: Start shopping

3. **Driver**
   - Method: In-Portal + WhatsApp
   - Content: "Delivery assigned: [Date] at [Time] to [Address]"
   - Action Available: Confirm availability, calculate departure time

4. **Client** (optional)
   - Method: Email
   - Content: "Your order is in preparation! Everything is on track."
   - Action Available: Track progress

**CODE IMPLEMENTATION:**
- Service: `src/services/orderService.ts` → `assignStaffToOrder()`
- Service: `src/services/realtimeNotificationService.ts` → `notifyStaffAssignment()`

**NEXT ACTIONS:**
- Staff: Complete assigned tasks
- Admin: Monitor progress
- Client: Wait for delivery day

---

### 4.8 Client Tracks Order Progress

**ACTION:** Client logs into client portal or clicks tracking link
**TRIGGERS:**
- Progress dashboard loaded
- Real-time updates shown

**WHO GETS NOTIFIED:**
- No notifications (client viewing only)

**CODE IMPLEMENTATION:**
- Page: `src/pages/portal/client/my-orders.tsx`
- Component: `src/components/JobProgressTracker.tsx`

**NEXT ACTIONS:**
- Client: Monitor prep, shopping, delivery status
- System: Send updates when milestones reached

---

### 4.9 Delivery Day - Driver Departs

**ACTION:** Driver starts journey to venue
**TRIGGERS:**
- GPS tracking starts
- Client tracking link sent
- Real-time location updates

**WHO GETS NOTIFIED:**
1. **Client**
   - Method: SMS + WhatsApp + Email
   - Content: "Your driver is on the way! Track here: [Link]"
   - Action Available: Watch live GPS tracking

2. **Company Admin**
   - Method: In-Portal Dashboard
   - Content: "Delivery started for Order #[ID]"
   - Action Available: Monitor ETA

**INTEGRATION REQUIRED:**
- ✅ GPS tracking
- ✅ Google Maps API
- ✅ Real-time database
- ✅ SMS/WhatsApp services

**CODE IMPLEMENTATION:**
- See section 3.2.3 (Driver GPS Tracking)

**NEXT ACTIONS:**
- Client: Track driver in real-time
- Driver: Complete delivery
- Admin: Monitor progress

---

### 4.10 Delivery Completed - Event Day Success

**ACTION:** Driver completes delivery and setup
**TRIGGERS:**
- Order marked as 'delivered'
- Final payment reminder sent (if balance remaining)
- Post-event feedback request scheduled

**WHO GETS NOTIFIED:**
1. **Client**
   - Method: Email + WhatsApp
   - Content: "Delivery complete! Enjoy your event! 🎉"
   - Action Available: Rate service, report issues

2. **Company Admin**
   - Method: In-Portal + Email
   - Content: "Order #[ID] delivered successfully!"
   - Action Available: Request final payment, schedule follow-up

**CODE IMPLEMENTATION:**
- See section 3.2.5 (Driver Completes Delivery)

**NEXT ACTIONS:**
- Client: Use equipment for event
- Admin: Schedule equipment pickup (if applicable)
- System: Send final payment reminder next day

---

### 4.11 Client Pays Final Balance

**ACTION:** Client pays remaining balance after event
**TRIGGERS:**
- `payment_ledger` table: Final payment recorded
- `orders` table: Status changed to 'completed'
- Order fully paid
- Receipt generated

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: Email + In-Portal
   - Content: "💰 Final payment received for Order #[ID]: R[Amount]"
   - Action Available: Close order, request review

2. **Client**
   - Method: Email
   - Content: "Payment received! Thank you for choosing us!"
   - Action Available: Leave review, book again

**INTEGRATION REQUIRED:**
- ✅ Payment gateway
- ✅ Receipt generation

**CODE IMPLEMENTATION:**
- Service: `src/services/paymentProcessingService.ts` → `handleFinalPayment()`

**NEXT ACTIONS:**
- Admin: Request review/testimonial
- Client: Consider rebooking for future events
- System: Add client to loyalty program (if applicable)

---

### 4.12 Post-Event Follow-Up (After-Sales)

**ACTION:** Automated email sent 24 hours after event
**TRIGGERS:**
- Automated email template
- Feedback form link
- Discount code for next booking (optional)

**WHO GETS NOTIFIED:**
1. **Client**
   - Method: Email + WhatsApp
   - Content: "How was your event? We'd love your feedback!"
   - Action Available: Leave review, book again with discount

**INTEGRATION REQUIRED:**
- ✅ Scheduled email automation
- ✅ Feedback form integration

**CODE IMPLEMENTATION:**
- Service: `src/services/emailAutomationService.ts` → `sendPostEventFollowUp()`
- Service: `src/lib/afterSalesAutomation.ts`

**NEXT ACTIONS:**
- Client: Leave review
- Admin: Monitor feedback, respond to issues
- Marketing: Use testimonial with permission

---

### 4.13 Client Leaves Review

**ACTION:** Client submits feedback/review
**TRIGGERS:**
- `reviews` table: Review stored
- Rating saved
- Admin notified

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: In-Portal + Email
   - Content: "New review from [Client]: [Rating] stars"
   - Action Available: Respond to review, request permission to use as testimonial

**CODE IMPLEMENTATION:**
- Service: Custom review service (to be implemented)

**NEXT ACTIONS:**
- Admin: Respond to feedback
- Marketing: Feature positive reviews on website
- Improvement: Address negative feedback

---

### 4.14 Client Books Again (Repeat Business)

**ACTION:** Client requests new quote for another event
**TRIGGERS:**
- New lead created
- System recognizes returning client
- VIP/loyalty status applied
- Previous order history loaded

**WHO GETS NOTIFIED:**
1. **Company Admin**
   - Method: Email + WhatsApp + In-Portal
   - Content: "🎉 Repeat customer! [Client Name] requested new quote"
   - Action Available: Offer loyalty discount, prioritize quote

2. **Client**
   - Method: Email
   - Content: "Welcome back! We're preparing your quote with a loyalty discount."
   - Action Available: Wait for quote

**CODE IMPLEMENTATION:**
- Service: `src/services/quoteService.ts` → `createQuoteRequest()` (with loyalty logic)
- Service: `src/services/leadService.ts` → `detectReturningClient()`

**NEXT ACTIONS:**
- Admin: Create quote with loyalty discount
- Client: Receive quote faster (priority)

---

## INTEGRATION REQUIREMENTS SUMMARY

### 1. Payment Gateway Integration (CRITICAL)

**Primary: PayFast (South Africa)**
- Subscription payments (monthly recurring)
- One-time payments (deposits, final payments)
- Webhook handling for payment confirmation
- Refund processing
- Payment link generation

**Implementation Status:**
- ✅ PayFast service created: `src/lib/payfastService.ts`
- ✅ Payment webhook: `src/pages/api/webhooks/payment-confirmation.ts`
- ✅ Payment processing service: `src/services/paymentProcessingService.ts`
- ⚠️ NEEDS TESTING: Actual PayFast account connection

**Alternative: Stripe (International)**
- Same functionality as PayFast
- For international clients

**Required Actions:**
1. Get PayFast merchant credentials
2. Configure webhook URL in PayFast dashboard
3. Test subscription flow end-to-end
4. Test deposit + final payment flow

---

### 2. Email Service Integration (CRITICAL)

**Options:**
- SendGrid (recommended)
- Resend
- Amazon SES
- Postmark

**Email Types to Send:**
1. **Company signup emails**
   - Welcome email with login URL
   - Trial reminder emails
   - Payment reminder emails
   - Subscription confirmation

2. **Staff invitation emails**
   - Invitation link with role
   - Welcome email after signup

3. **Client emails**
   - Quote request confirmation
   - Custom quote with PDF
   - Payment confirmation
   - Order confirmation
   - Delivery tracking link
   - Post-event follow-up
   - Receipt/invoice emails

4. **Admin notification emails**
   - New quote request
   - Payment received
   - Order completed
   - Driver replacement needed
   - Equipment broken

**Implementation Status:**
- ✅ Email automation service: `src/services/emailAutomationService.ts`
- ✅ Billing email service: `src/services/billingEmailService.ts`
- ✅ Template management: `src/pages/admin/email-templates.tsx`
- ⚠️ NEEDS: Email provider credentials in `.env.local`

**Required Actions:**
1. Choose email provider (SendGrid recommended)
2. Get API key
3. Configure sender domain
4. Set up email templates
5. Test all email flows

---

### 3. WhatsApp Business API Integration (HIGH PRIORITY)

**Provider Options:**
- Twilio
- 360Dialog
- MessageBird
- WhatsApp Cloud API (Meta)

**WhatsApp Message Types:**
1. Quote request notification (to admin)
2. Custom quote sent (to client)
3. Payment confirmation (to admin and client)
4. Order confirmation (to client and staff)
5. Delivery tracking link (to client)
6. Driver arrival notification (to client)
7. Post-event follow-up (to client)

**Implementation Status:**
- ✅ WhatsApp integration service: `src/services/whatsappIntegrationService.ts`
- ✅ WhatsApp template service: `src/services/whatsappTemplateService.ts`
- ✅ Template manager: `src/components/admin/WhatsAppTemplateManager.tsx`
- ⚠️ NEEDS: WhatsApp Business API credentials

**Required Actions:**
1. Get WhatsApp Business API access
2. Create message templates
3. Get templates approved by Meta
4. Configure webhook for message status
5. Test message delivery

---

### 4. SMS Service Integration (MEDIUM PRIORITY)

**Provider: Twilio**

**SMS Use Cases:**
1. Urgent driver replacement notifications
2. Delivery tracking link (immediate)
3. Payment reminders (urgent)
4. Critical admin alerts

**Implementation Status:**
- 🔴 NOT IMPLEMENTED YET
- Need to create SMS service similar to WhatsApp

**Required Actions:**
1. Get Twilio account
2. Get SMS-capable phone number
3. Create SMS service
4. Test SMS delivery

---

### 5. GPS Tracking / Maps Integration (IMPLEMENTED)

**Provider: Google Maps API**

**Features:**
- Real-time driver location tracking
- Client tracking page
- Route calculation
- ETA estimation
- Geofencing (arrival detection)

**Implementation Status:**
- ✅ GPS tracker component: `src/components/tracking/DriverGPSTracker.tsx`
- ✅ Client tracking page: `src/pages/tracking/client.tsx`
- ✅ Driver tracking page: `src/pages/tracking/driver.tsx`
- ✅ Admin tracking page: `src/pages/tracking/admin.tsx`
- ✅ Google Maps service: `src/services/googleMapsService.ts`
- ⚠️ NEEDS: Google Maps API key in `.env.local`

**Required Actions:**
1. Enable Google Maps JavaScript API
2. Enable Places API (for address autocomplete)
3. Enable Directions API (for route calculation)
4. Add API key to environment variables
5. Test real-time tracking

---

### 6. File Storage Integration (IMPLEMENTED)

**Provider: Supabase Storage**

**Use Cases:**
- Company logos
- Receipt uploads (shopping staff)
- Equipment photos
- Invoice PDFs
- Email attachments

**Implementation Status:**
- ✅ Supabase storage configured
- ✅ Receipt scanner: `src/components/ReceiptScanner.tsx`
- ✅ File upload utilities in services

---

### 7. Real-Time Notifications (IMPLEMENTED)

**Provider: Supabase Realtime**

**Features:**
- Live order status updates
- GPS location updates
- Staff status changes (on duty / off duty)
- Admin dashboard live updates

**Implementation Status:**
- ✅ Realtime service: `src/services/realtimeNotificationService.ts`
- ✅ Notification center: `src/components/tracking/NotificationCenter.tsx`
- ✅ Notification bell: `src/components/notifications/NotificationBell.tsx`

---

### 8. Analytics Integration (OPTIONAL)

**Options:**
- Google Analytics
- Mixpanel
- Segment

**Tracking:**
- Quote request conversion rate
- Payment completion rate
- Order completion rate
- User behavior flow
- Revenue tracking

**Implementation Status:**
- ✅ Analytics service: `src/services/analyticsService.ts`
- ⚠️ NEEDS: Analytics provider setup

---

### 9. Xero Integration (OPTIONAL - FUTURE)

**Purpose:** Automated bookkeeping

**Features:**
- Auto-create invoices
- Track expenses
- Sync payments
- Generate financial reports

**Implementation Status:**
- ✅ Xero integration service: `src/services/xeroIntegrationService.ts`
- ⚠️ NEEDS: Xero OAuth setup

---

## CRITICAL BUGS TO FIX

### Bug Priority Matrix

Based on code analysis, here are the critical bugs that need fixing:

#### CRITICAL (Fix Immediately - Blocks Core Functionality)

1. **Payment Integration Not Connected**
   - Issue: No actual PayFast/Stripe credentials configured
   - Impact: Cannot process payments, trial upgrades fail
   - Fix: Add payment credentials, test webhook flow
   - Files: `.env.local`, payment services

2. **Email Service Not Configured**
   - Issue: No email provider credentials
   - Impact: No notifications sent, users confused
   - Fix: Add SendGrid/Resend API key
   - Files: `.env.local`, email services

3. **Company Signup Flow Incomplete**
   - Issue: Missing post-signup email, unclear next steps
   - Impact: New companies don't know how to access portal
   - Fix: Send welcome email with login URL after signup
   - Files: `src/services/companyService.ts`

4. **Trial Expiry Logic Not Automated**
   - Issue: No scheduled function checking trial expiry
   - Impact: Trials don't expire automatically
   - Fix: Create Edge Function or cron job
   - Files: Create scheduled function

#### HIGH (Fix Before Launch - Major Features Broken)

5. **WhatsApp Integration Missing Credentials**
   - Issue: WhatsApp service built but not connected
   - Impact: No WhatsApp notifications sent
   - Fix: Add WhatsApp API credentials
   - Files: `.env.local`, WhatsApp services

6. **Google Maps API Not Configured**
   - Issue: GPS tracking won't work without API key
   - Impact: Clients can't track deliveries
   - Fix: Add Google Maps API key
   - Files: `.env.local`

7. **Receipt Scanning/OCR Not Implemented**
   - Issue: UI exists but no backend processing
   - Impact: Shopping staff can't get reimbursed easily
   - Fix: Implement receipt processing or remove feature
   - Files: `src/components/ReceiptScanner.tsx`

#### MEDIUM (Fix Soon - UX Issues)

8. **Onboarding Flow Not Mandatory**
   - Issue: Admins can skip onboarding, miss critical setup
   - Impact: Companies don't configure properly
   - Fix: Make onboarding mandatory before portal access
   - Files: `src/pages/[companySlug]/admin/onboarding.tsx`

9. **Staff Invitation Email Not Sent**
   - Issue: Staff invitation logic incomplete
   - Impact: Staff don't know how to join
   - Fix: Complete invitation email sending
   - Files: `src/services/userManagementService.ts`

10. **Driver Replacement Request Flow Incomplete**
    - Issue: Replacement request created but not distributed
    - Impact: No available drivers notified
    - Fix: Complete notification logic to all available drivers
    - Files: `src/services/driverReplacementService.ts`

#### LOW (Polish - Nice to Have)

11. **Post-Event Follow-Up Not Automated**
    - Issue: After-sales emails not scheduled automatically
    - Impact: Manual follow-up required
    - Fix: Create scheduled function for post-event emails
    - Files: `src/lib/afterSalesAutomation.ts`

12. **Analytics Not Tracking**
    - Issue: Analytics service exists but not configured
    - Impact: No data on user behavior
    - Fix: Add analytics provider credentials
    - Files: `.env.local`, analytics service

---

## NEXT STEPS: LAUNCH READINESS PLAN

### Phase 1: Critical Integrations (Week 1)

**Day 1-2: Payment Integration**
- [ ] Get PayFast merchant account
- [ ] Add PayFast credentials to `.env.local`
- [ ] Test subscription payment flow end-to-end
- [ ] Test deposit + final payment flow
- [ ] Configure webhook URL in PayFast dashboard
- [ ] Test payment failure and retry logic

**Day 3-4: Email Integration**
- [ ] Choose email provider (SendGrid recommended)
- [ ] Get API key and sender domain
- [ ] Add credentials to `.env.local`
- [ ] Test all email templates:
  - [ ] Company welcome email
  - [ ] Trial expiry reminders
  - [ ] Quote request confirmation
  - [ ] Custom quote email with PDF
  - [ ] Payment confirmation
  - [ ] Order confirmation
  - [ ] Delivery tracking link
  - [ ] Post-event follow-up
- [ ] Verify email deliverability

**Day 5-7: Company Signup Flow**
- [ ] Fix post-signup email sending
- [ ] Test complete signup journey
- [ ] Verify trial tracking works
- [ ] Test login URL generation
- [ ] Test onboarding wizard
- [ ] Verify admin can access portal immediately

### Phase 2: High-Priority Features (Week 2)

**Day 8-10: WhatsApp Integration**
- [ ] Get WhatsApp Business API access
- [ ] Add credentials to `.env.local`
- [ ] Create and submit message templates for approval
- [ ] Test WhatsApp message sending
- [ ] Verify all notification triggers work

**Day 11-12: GPS Tracking**
- [ ] Enable Google Maps APIs
- [ ] Add API key to `.env.local`
- [ ] Test real-time GPS tracking
- [ ] Test client tracking page
- [ ] Verify geofencing arrival detection

**Day 13-14: Staff Invitation Flow**
- [ ] Complete staff invitation email logic
- [ ] Test kitchen staff signup
- [ ] Test driver signup
- [ ] Test cleaning staff signup
- [ ] Test shopping staff signup
- [ ] Verify role-based portal access

### Phase 3: User Journey Testing (Week 3)

**Day 15-16: Journey 1 - CateringMS Platform Admin**
- [ ] Test company signup
- [ ] Test trial tracking
- [ ] Test payment collection
- [ ] Test trial expiry and suspension
- [ ] Test company database management

**Day 17-18: Journey 2 - Catering Company Admin**
- [ ] Test admin first login
- [ ] Test onboarding wizard completion
- [ ] Test staff invitation
- [ ] Test email template customization
- [ ] Test quote creation
- [ ] Test order management
- [ ] Test payment tracking

**Day 19-20: Journey 3 - Company Staff**
- [ ] Test kitchen staff journey (clock in, tasks, clock out)
- [ ] Test driver journey (confirm, track, deliver)
- [ ] Test cleaning staff journey (verify, clean, report broken)
- [ ] Test shopping staff journey (list, purchase, receipt, complete)

**Day 21: Journey 4 - Client**
- [ ] Test quote request
- [ ] Test quote acceptance
- [ ] Test deposit payment
- [ ] Test order tracking
- [ ] Test GPS tracking
- [ ] Test final payment
- [ ] Test post-event follow-up

### Phase 4: Bug Fixes and Polish (Week 4)

**Day 22-23: Critical Bug Fixes**
- [ ] Fix all critical bugs identified in testing
- [ ] Verify payment webhook reliability
- [ ] Verify email deliverability
- [ ] Fix any broken navigation

**Day 24-25: Medium Priority Fixes**
- [ ] Implement receipt OCR (or remove feature)
- [ ] Complete driver replacement notification flow
- [ ] Make onboarding mandatory
- [ ] Add validation to all forms

**Day 26-28: Final Testing**
- [ ] Complete end-to-end test of all 4 journeys
- [ ] Test on mobile devices
- [ ] Test all notification channels
- [ ] Verify all integrations work together
- [ ] Load testing (simulate multiple users)
- [ ] Security audit
- [ ] Performance optimization

### Phase 5: Launch Preparation (Week 5)

**Day 29: Documentation**
- [ ] Create user guides for each role
- [ ] Create video tutorials
- [ ] Create FAQ section
- [ ] Create support ticket system

**Day 30: Marketing Preparation**
- [ ] Finalize pricing page
- [ ] Prepare launch email campaigns
- [ ] Set up analytics tracking
- [ ] Prepare social media content

**Day 31: Soft Launch**
- [ ] Launch to 1-3 beta companies
- [ ] Monitor closely for bugs
- [ ] Gather feedback
- [ ] Fix any issues immediately

**Day 32-35: Iterate Based on Beta Feedback**
- [ ] Fix beta bugs
- [ ] Improve UX based on feedback
- [ ] Optimize performance
- [ ] Prepare for public launch

**Day 35: PUBLIC LAUNCH 🚀**

---

## NOTIFICATIONS SUMMARY TABLE

| User Action | Who Gets Notified | Method | Content | Next Action |
|-------------|-------------------|---------|---------|-------------|
| **JOURNEY 1: PLATFORM ADMIN** |
| Company signs up | Platform Admin, New Admin | Email, In-Portal | New company registered | Review, approve, setup |
| Trial expiring (3 days) | Company Admin, Platform Admin | Email, Banner | Trial expires soon | Upgrade subscription |
| Trial expired | Company Admin, Platform Admin | Email, Lockout | Trial ended | Pay to restore |
| Payment received | Company Admin, Platform Admin | Email, In-Portal | Payment successful | Continue service |
| Payment failed | Company Admin, Platform Admin | Email, Banner, Alert | Payment declined | Update card |
| Account suspended | Company Admin, Platform Admin | Email, Lockout | Account suspended | Pay now |
| **JOURNEY 2: COMPANY ADMIN** |
| Admin adds staff | Staff Member | Email | Invitation to join | Sign up |
| Admin creates email template | None | - | Template saved | Test with quote |
| Admin connects WhatsApp | Admin | WhatsApp, In-Portal | Integration successful | Configure templates |
| **JOURNEY 3: KITCHEN STAFF** |
| Kitchen staff clocks in | Admin | In-Portal | Staff on duty | Assign tasks |
| Kitchen completes task | Admin, Head Chef | In-Portal | Task completed | Review, approve |
| Kitchen clocks out | Admin | In-Portal | Clock out recorded | Review hours |
| **JOURNEY 3: DRIVER** |
| Driver confirms delivery | Admin, Client | Email, WhatsApp, In-Portal | Driver confirmed | Track delivery |
| Driver starts journey | Client, Admin | SMS, WhatsApp, Email | Driver en route | Track GPS |
| Driver arrives | Client, Admin | SMS, WhatsApp | Driver arrived | Coordinate |
| Driver completes delivery | Client, Admin, Driver | Email, WhatsApp, In-Portal | Delivery complete | Rate, pay final |
| Driver requests replacement | Admin, Available Drivers | SMS, WhatsApp, Email, URGENT | Replacement needed | Accept or decline |
| **JOURNEY 3: CLEANING STAFF** |
| Cleaning clocks in | Admin | In-Portal | Staff on duty | Assign equipment |
| Equipment marked clean | Admin | In-Portal | Equipment available | Ready for next order |
| Equipment reported broken | Admin | In-Portal, Email, URGENT | Equipment damaged | Repair or replace |
| **JOURNEY 3: SHOPPING STAFF** |
| Shopping list assigned | Shopping Staff | In-Portal, WhatsApp | New list | Start shopping |
| Items marked purchased | Admin | In-Portal (real-time) | Shopping progress | Monitor spending |
| Receipt uploaded | Admin | In-Portal | Receipt ready | Review, approve |
| Shopping completed | Admin, Kitchen | In-Portal, Email | Shopping done | Approve, start prep |
| **JOURNEY 4: CLIENT** |
| Client requests quote | Admin | Email, WhatsApp, SMS, In-Portal | New quote request | Create custom quote |
| Admin sends custom quote | Client | Email, WhatsApp | Quote ready | Accept or decline |
| Client accepts quote | Admin, Client | Email, WhatsApp, In-Portal | Quote accepted | Pay deposit |
| Client declines quote | Admin | In-Portal, Email | Quote declined | Follow up |
| Client pays deposit | Admin, Client, Staff | Email, WhatsApp, In-Portal | Deposit received | Start prep |
| Order prep begins | Kitchen, Shopping, Driver, Client | In-Portal, WhatsApp, Email | Order in prep | Complete tasks |
| Driver starts delivery | Client, Admin | SMS, WhatsApp, Email | Driver en route | Track GPS |
| Delivery completed | Client, Admin, Driver | Email, WhatsApp, In-Portal | Delivery done | Pay final, rate |
| Client pays final balance | Admin, Client | Email, In-Portal | Payment received | Request review |
| Post-event follow-up (24h) | Client | Email, WhatsApp | How was event? | Leave review |
| Client leaves review | Admin | In-Portal, Email | New review | Respond, feature |
| Client books again | Admin, Client | Email, WhatsApp, In-Portal | Repeat customer | Priority quote |

---

## AUTOMATION OPPORTUNITIES

### Scheduled Functions Needed

1. **Daily Trial Expiry Check**
   - Run every day at 9 AM
   - Check `company_trial_tracking` table
   - Send reminders 3 days before expiry
   - Lock accounts on expiry date

2. **Monthly Recurring Payments**
   - Run on each company's billing date
   - Charge subscription via payment gateway
   - Handle failures with grace period
   - Send receipts on success

3. **Post-Event Follow-Up**
   - Run daily to check completed orders
   - Send follow-up email 24 hours after event
   - Request feedback and reviews
   - Offer discount for next booking

4. **Driver Availability Reminder**
   - Run 24 hours before each delivery
   - Send reminder to assigned driver
   - Confirm availability
   - Alert admin if driver doesn't respond

5. **Final Payment Reminder**
   - Run daily to check unpaid balances
   - Send payment reminder if balance > 0
   - Escalate after 7 days overdue

6. **Equipment Cleaning Reminder**
   - Run after each order completion
   - Remind cleaning staff of returned equipment
   - Track cleaning completion
   - Alert if equipment not cleaned within 24h

---

## CONCLUSION

This document maps EVERY user action across the entire CateringMS platform. Each action has clear:

✅ **Trigger conditions**
✅ **System changes**
✅ **Notification recipients**
✅ **Notification methods**
✅ **Next actions available**

**Integration requirements are clear:**
- Payment gateway (critical)
- Email service (critical)
- WhatsApp API (high priority)
- Google Maps API (high priority)
- SMS service (medium priority)

**The code is 80% complete.** The remaining 20% is:
1. Adding integration credentials
2. Testing all flows end-to-end
3. Fixing the 12 identified bugs
4. Creating scheduled automation functions

**Follow the 5-week launch plan to go live with confidence.**

---

*Last Updated: 2025-10-18*
*Next Review: Before launch*