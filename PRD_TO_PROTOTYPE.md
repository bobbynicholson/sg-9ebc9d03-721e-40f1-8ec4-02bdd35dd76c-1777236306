# Product Requirements Document (PRD) to Prototype
## CateringMS Platform - Complete System Documentation

**Document Version:** 1.0  
**Last Updated:** October 27, 2025  
**Status:** Production Ready

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Product Vision & Goals](#product-vision--goals)
3. [User Personas](#user-personas)
4. [System Architecture](#system-architecture)
5. [Feature Specifications](#feature-specifications)
6. [User Journeys](#user-journeys)
7. [Database Schema](#database-schema)
8. [Technical Stack](#technical-stack)
9. [Integration Ecosystem](#integration-ecosystem)
10. [Security & Compliance](#security--compliance)
11. [Pricing & Business Model](#pricing--business-model)
12. [Roadmap & Future Development](#roadmap--future-development)

---

## 1. Executive Summary

### 1.1 Product Overview
CateringMS is a comprehensive white-label SaaS platform designed to digitize and streamline catering operations. It provides end-to-end management for catering companies, from lead generation to order fulfillment, driver tracking, kitchen operations, and client communication.

### 1.2 Key Value Propositions
- **Multi-tenant Architecture**: Each catering company gets their own branded portal
- **Complete Operational Coverage**: Manages all aspects from sales to delivery
- **Real-time Tracking**: GPS-enabled driver tracking with client-facing views
- **Automated Workflows**: Email automation, notifications, and scheduling
- **Regional Flexibility**: Multi-region support with currency localization
- **White-label Ready**: Fully customizable branding for each company

### 1.3 Target Market
- Small to medium-sized catering businesses (5-100 employees)
- Multi-location catering operations
- Event catering services
- Corporate catering providers
- Geographic Focus: South Africa, UK, USA (expandable)

### 1.4 Success Metrics
- **Customer Acquisition**: 100+ companies onboarded in first 12 months
- **User Engagement**: 70%+ daily active users across all roles
- **Order Processing**: 95%+ on-time delivery rate
- **Customer Satisfaction**: 4.5+ star rating
- **Revenue**: $500K ARR within 18 months

---

## 2. Product Vision & Goals

### 2.1 Vision Statement
"To become the operating system for catering businesses worldwide, enabling seamless operations from first contact to final delivery."

### 2.2 Strategic Goals

#### Short-term (0-6 months)
- ✅ Launch MVP with core features
- ✅ Onboard first 10 pilot customers
- ✅ Establish product-market fit
- ✅ Achieve 95%+ system uptime

#### Mid-term (6-18 months)
- 🎯 Scale to 100+ active companies
- 🎯 Launch mobile apps (iOS/Android)
- 🎯 Integrate with 5+ major accounting platforms
- 🎯 Expand to 3 geographic regions

#### Long-term (18+ months)
- 🎯 Become market leader in catering management
- 🎯 Launch marketplace for equipment/supplies
- 🎯 AI-powered demand forecasting
- 🎯 International expansion to 10+ countries

### 2.3 Core Principles
1. **Simplicity First**: Every feature must be intuitive
2. **Mobile-Ready**: All workflows accessible on mobile
3. **Real-time Data**: Live updates across all touchpoints
4. **Scalable Design**: Built to handle 10,000+ concurrent users
5. **Security-Focused**: Bank-level encryption and compliance

---

## 3. User Personas

### 3.1 Super Admin (Platform Owner)
**Name:** Alex Thompson  
**Role:** Platform Administrator  
**Goals:**
- Monitor all companies on the platform
- Manage subscriptions and billing
- Analyze platform-wide metrics
- Configure pricing and features

**Pain Points:**
- Need visibility across all tenants
- Managing subscription lifecycle
- Handling support escalations

**Key Features:**
- Company database management
- Subscription management dashboard
- Platform-wide analytics
- Pricing configuration
- Currency monitoring
- Trial management

**Access Level:** Full platform access at `/cateringms-platform/`

---

### 3.2 Company Owner/Admin
**Name:** Sarah Johnson  
**Role:** Catering Business Owner  
**Goals:**
- Grow business and increase orders
- Manage team efficiently
- Maintain quality standards
- Monitor financial performance

**Pain Points:**
- Coordinating multiple departments
- Tracking order profitability
- Managing staff schedules
- Client communication

**Key Features:**
- Dashboard with KPIs
- User management
- Financial reports
- Order assignment
- Settings and branding
- Email automation

**Access Level:** Full company access at `/{companySlug}/admin/`

---

### 3.3 Operations Manager
**Name:** Michael Chen  
**Role:** Operations Coordinator  
**Goals:**
- Ensure smooth daily operations
- Coordinate kitchen, drivers, shopping
- Handle urgent issues
- Meet delivery deadlines

**Pain Points:**
- Last-minute changes
- Equipment shortages
- Driver availability
- Quality control

**Key Features:**
- Operations hub
- Job progress tracking
- Equipment management
- Staff coordination
- Real-time notifications

**Access Level:** Operations portal with limited admin access

---

### 3.4 Sales Representative
**Name:** Emma Williams  
**Role:** Sales Manager  
**Goals:**
- Convert leads to clients
- Create accurate quotes
- Follow up systematically
- Track conversion metrics

**Pain Points:**
- Manual quote creation
- Lead follow-up tracking
- Price calculation errors
- Communication gaps

**Key Features:**
- Lead management
- Quote builder
- Email templates
- Follow-up automation
- Client database

**Access Level:** Sales-focused admin access

---

### 3.5 Kitchen Staff
**Name:** Carlos Rodriguez  
**Role:** Head Chef  
**Goals:**
- Prepare orders on time
- Manage inventory
- Coordinate prep lists
- Maintain food safety

**Pain Points:**
- Unclear prep timelines
- Missing ingredients
- Last-minute changes
- Equipment breakdowns

**Key Features:**
- Kitchen dashboard
- Duty toggle
- Prep list management
- Inventory tracking
- Task completion

**Access Level:** Kitchen portal at `/{companySlug}/portal/kitchen`

---

### 3.6 Driver
**Name:** David Patel  
**Role:** Delivery Driver  
**Goals:**
- Complete deliveries efficiently
- Navigate optimal routes
- Confirm deliveries
- Track earnings

**Pain Points:**
- Route planning
- Address accuracy
- Payment tracking
- Vehicle issues

**Key Features:**
- Driver dashboard
- GPS tracking
- Route management
- Delivery confirmation
- Earnings tracker
- Complaint portal

**Access Level:** Driver portal at `/{companySlug}/portal/driver`

---

### 3.7 Shopping Staff
**Name:** Lisa Anderson  
**Role:** Procurement Specialist  
**Goals:**
- Purchase required items
- Track spending
- Find best suppliers
- Manage receipts

**Pain Points:**
- Shopping list accuracy
- Budget constraints
- Receipt management
- Supplier relationships

**Key Features:**
- Shopping dashboard
- Shopping lists
- Supplier management
- Receipt scanner
- Budget tracking

**Access Level:** Shopping portal at `/{companySlug}/portal/shopping`

---

### 3.8 Cleaning Staff
**Name:** Maria Santos  
**Role:** Cleaning Supervisor  
**Goals:**
- Maintain cleanliness standards
- Track cleaning tasks
- Report equipment issues
- Verify supplies

**Pain Points:**
- Task prioritization
- Equipment failures
- Supply shortages
- Time management

**Key Features:**
- Cleaning dashboard
- Task workflow tracker
- Equipment verification
- Broken equipment reporting
- Duty widget

**Access Level:** Cleaning portal at `/{companySlug}/portal/cleaning`

---

### 3.9 Client
**Name:** Jennifer Brown  
**Role:** Corporate Event Coordinator  
**Goals:**
- Order catering easily
- Track delivery status
- Manage payments
- Review past orders

**Pain Points:**
- Unclear delivery times
- Payment confusion
- Order history access
- Communication delays

**Key Features:**
- Order tracking
- Payment schedule
- Order history
- Profile management
- Invoice downloads

**Access Level:** Client portal at `/{companySlug}/portal/client`

---

## 4. System Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer (Next.js)                │
├─────────────────────────────────────────────────────────────┤
│  • Pages Router (SSR/SSG)                                   │
│  • React Components (TypeScript)                            │
│  • Tailwind CSS + Shadcn/UI                                 │
│  • Real-time Updates (Supabase Realtime)                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   API Layer (Next.js API Routes)            │
├─────────────────────────────────────────────────────────────┤
│  • /api/webhooks/* - Payment confirmations                  │
│  • /api/admin/* - Admin operations                          │
│  • /api/send-email - Email service                          │
│  • Authentication middleware                                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Backend Services (Supabase)                │
├─────────────────────────────────────────────────────────────┤
│  • PostgreSQL Database (Multi-tenant)                       │
│  • Row Level Security (RLS)                                 │
│  • Real-time Subscriptions                                  │
│  • Storage (File uploads)                                   │
│  • Edge Functions (Serverless)                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    External Integrations                     │
├─────────────────────────────────────────────────────────────┤
│  • PayFast (Payments - South Africa)                        │
│  • Google Maps API (Geocoding, Routing)                     │
│  • Resend (Email delivery)                                  │
│  • WhatsApp Business API (Notifications)                    │
│  • Xero (Accounting integration)                            │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Multi-Tenant Architecture

**URL Structure:**
- Platform Admin: `/cateringms-platform/*`
- Company Portal: `/{companySlug}/*`
- Company Admin: `/{companySlug}/admin/*`
- Staff Portals: `/{companySlug}/portal/{role}/*`

**Data Isolation:**
- Each company has a unique `company_id` UUID
- All queries filtered by `company_id` via RLS policies
- Company-specific branding stored in `white_label_settings`
- Separate subscription and billing per company

### 4.3 Authentication Flow

```
User Login Request
    ↓
Supabase Auth (Email/Password or OAuth)
    ↓
Profile Lookup (company_id, role, active_role)
    ↓
RLS Policy Check (company_id match)
    ↓
Role-Based Redirect
    ↓
Session Management (JWT tokens)
```

**Role Hierarchy:**
1. **super_admin** - Platform-level access
2. **owner** - Company owner (full access)
3. **admin** - Company admin (full access)
4. **operations_manager** - Operations + limited admin
5. **sales** - Sales/leads/quotes
6. **driver** - Driver portal only
7. **kitchen_staff** - Kitchen portal only
8. **shopping_staff** - Shopping portal only
9. **cleaning_staff** - Cleaning portal only
10. **client** - Client portal only

---

## 5. Feature Specifications

### 5.1 Lead Management

**Purpose:** Capture and nurture potential clients from inquiry to conversion

**User Stories:**
- As a sales rep, I want to capture lead details so I can follow up effectively
- As a sales rep, I want to see lead status so I can prioritize follow-ups
- As an admin, I want to assign leads to sales reps so workload is distributed

**Features:**
- Lead capture form with validation
- Lead status tracking (New, Contacted, Qualified, Quoted, Won, Lost)
- Lead assignment to sales reps
- Activity timeline per lead
- Email integration for follow-ups
- Lead scoring based on engagement
- Conversion tracking

**Technical Implementation:**
- Table: `leads`
- Service: `leadService.ts`
- Pages: `/leads`, `/leads/new`, `/{companySlug}/admin/leads`
- Real-time updates via Supabase subscriptions

**Acceptance Criteria:**
- ✅ Lead form validates all required fields
- ✅ Lead status updates in real-time
- ✅ Email notifications on new leads
- ✅ Lead assignment persists correctly
- ✅ Activity timeline shows chronological history

---

### 5.2 Quote Management

**Purpose:** Generate professional quotes quickly and track approval status

**User Stories:**
- As a sales rep, I want to create quotes in under 2 minutes
- As a sales rep, I want to calculate pricing automatically based on items
- As a client, I want to receive quotes via email with acceptance link

**Features:**
- Dynamic quote builder with item selection
- Pricing calculator with markup rules
- PDF generation for quotes
- Email delivery with tracking
- Quote status (Draft, Sent, Viewed, Accepted, Rejected)
- Quote versioning
- Terms and conditions templates
- Payment terms configuration

**Technical Implementation:**
- Table: `quotes`
- Service: `quoteService.ts`
- Pages: `/quotes`, `/quotes/new`, `/{companySlug}/admin/quotes`
- PDF generation library integration

**Acceptance Criteria:**
- ✅ Quote calculates totals correctly
- ✅ PDF renders professionally
- ✅ Email delivery confirms successfully
- ✅ Client can accept quote with one click
- ✅ Quote conversion to order works seamlessly

---

### 5.3 Order Management

**Purpose:** Central hub for all order operations from creation to completion

**User Stories:**
- As an admin, I want to see all orders at a glance
- As operations staff, I want to assign tasks to departments
- As a client, I want to track my order status in real-time

**Features:**
- Order creation from quotes or manual entry
- Order status workflow (Created, Confirmed, In Progress, Completed, Cancelled)
- Multi-step order processing
- Department assignment (Kitchen, Shopping, Drivers, Cleaning)
- Timeline tracking for each order
- Invoice generation
- Payment tracking
- Order notes and attachments
- Recurring order templates

**Technical Implementation:**
- Tables: `orders`, `order_items`, `order_timeline`
- Service: `orderService.ts`
- Pages: `/orders`, `/{companySlug}/admin/orders`
- Real-time progress tracking

**Acceptance Criteria:**
- ✅ Order creation validates all required fields
- ✅ Status updates trigger notifications
- ✅ Timeline shows accurate progression
- ✅ Payment tracking matches ledger
- ✅ Invoice generation includes all order details

---

### 5.4 Inventory Management

**Purpose:** Track equipment, supplies, and stock levels across all operations

**User Stories:**
- As operations staff, I want to know what equipment is available
- As kitchen staff, I want to track ingredient stock levels
- As an admin, I want to see equipment shortages before events

**Features:**
- Equipment database with categories
- Quantity tracking (Available, In Use, Maintenance, Broken)
- Low stock alerts
- Equipment checkout/check-in
- Maintenance scheduling
- Purchase order creation
- Supplier management
- Barcode/QR code support
- Equipment location tracking

**Technical Implementation:**
- Tables: `inventory`, `equipment_tracking`, `equipment_shortages`
- Services: `inventoryService.ts`, `equipmentManagementService.ts`
- Pages: `/inventory`, `/{companySlug}/admin/inventory`
- Starter inventory templates

**Acceptance Criteria:**
- ✅ Stock levels update in real-time
- ✅ Alerts trigger at configured thresholds
- ✅ Equipment checkout records user and timestamp
- ✅ Broken equipment workflow triggers notifications
- ✅ Purchase orders integrate with suppliers

---

### 5.5 Driver Management & GPS Tracking

**Purpose:** Real-time tracking of drivers and delivery management

**User Stories:**
- As a driver, I want to see my delivery schedule
- As operations staff, I want to track driver locations in real-time
- As a client, I want to see when my order will arrive

**Features:**

#### Driver Management:
- Driver profiles and credentials
- Vehicle assignment
- Delivery route assignment
- Earnings tracking
- Performance metrics
- Availability scheduling

#### GPS Tracking:
- Real-time location updates (30-second intervals)
- Interactive map view (Admin/Operations)
- Client tracking link (view-only)
- Route optimization suggestions
- Geofencing for delivery zones
- Arrival notifications
- Proof of delivery (photos, signatures)

#### Multi-Stop Route Management:
- Add/remove stops dynamically
- Reorder stop sequence
- Estimated arrival times per stop
- Stop completion tracking
- Navigation integration

**Technical Implementation:**
- Tables: `drivers`, `driver_locations`, `routes`, `route_stops`
- Services: `driverService.ts`, `routeStopService.ts`, `proximityService.ts`
- Components: `DriverGPSTracker.tsx`, `ClientTrackingMap.tsx`
- Pages: `/tracking/driver`, `/tracking/admin`, `/tracking/client`
- Geolocation API for browser-based tracking

**Acceptance Criteria:**
- ✅ Driver location updates every 30 seconds when active
- ✅ Admin sees all active drivers on map
- ✅ Client tracking link shows estimated arrival
- ✅ Geofence triggers arrival notifications
- ✅ Multi-stop routes update in real-time
- ✅ Proof of delivery uploads successfully

---

### 5.6 Kitchen Management

**Purpose:** Coordinate kitchen operations and food preparation

**User Stories:**
- As kitchen staff, I want to see today's prep list
- As a chef, I want to mark tasks complete as we finish them
- As operations staff, I want to know if kitchen is on schedule

**Features:**
- Daily prep list generation
- Recipe scaling based on order quantities
- Ingredient requirements calculation
- Task completion tracking
- Duty toggle (on/off duty)
- On-duty board showing active staff
- Timer functionality
- Food safety checklist
- Waste tracking

**Technical Implementation:**
- Tables: `kitchen_tasks`, `kitchen_duty_logs`
- Service: `kitchenDutyService.ts`
- Components: `DutyToggleWidget.tsx`, `TaskCompletionButtons.tsx`
- Pages: `/kitchen`, `/{companySlug}/portal/kitchen`

**Acceptance Criteria:**
- ✅ Prep list auto-generates from orders
- ✅ Recipe scaling calculates correctly
- ✅ Task completion updates order status
- ✅ Duty toggle logs timestamps
- ✅ On-duty board shows real-time staff

---

### 5.7 Shopping Management

**Purpose:** Streamline procurement and supply purchasing

**User Stories:**
- As shopping staff, I want a consolidated shopping list
- As shopping staff, I want to scan receipts for easy tracking
- As operations staff, I want to know shopping budget status

**Features:**
- Shopping list generation from orders
- Supplier database
- Receipt scanning (OCR)
- Budget tracking per order
- Purchase history
- Supplier comparison
- Shopping cart functionality
- Delivery scheduling

**Technical Implementation:**
- Tables: `shopping_lists`, `suppliers`, `receipts`
- Service: `shoppingService.ts`
- Component: `ReceiptScanner.tsx`
- Pages: `/shopping`, `/{companySlug}/portal/shopping`

**Acceptance Criteria:**
- ✅ Shopping list aggregates all order requirements
- ✅ Receipt scanner extracts key information
- ✅ Budget alerts when approaching limit
- ✅ Supplier ratings update with feedback
- ✅ Purchase history searchable by date/supplier

---

### 5.8 Cleaning Management

**Purpose:** Track cleaning tasks and equipment maintenance

**User Stories:**
- As cleaning staff, I want to see my cleaning checklist
- As cleaning staff, I want to report broken equipment immediately
- As operations staff, I want to verify cleaning completion

**Features:**
- Cleaning workflow tracker
- Equipment verification panel
- Broken equipment dashboard
- Duty widget (on/off duty)
- Task prioritization
- Photo documentation
- Supply inventory tracking
- Cleaning standards checklist

**Technical Implementation:**
- Tables: `cleaning_tasks`, `cleaning_duty_logs`, `broken_equipment`
- Service: `equipmentTrackingService.ts`
- Components: `CleaningDutyWidget.tsx`, `CleaningWorkflowTracker.tsx`
- Pages: `/cleaning`, `/{companySlug}/portal/cleaning`

**Acceptance Criteria:**
- ✅ Workflow tracker shows sequential steps
- ✅ Equipment verification requires photos
- ✅ Broken equipment notifications trigger immediately
- ✅ Duty toggle logs timestamps
- ✅ Task completion updates order status

---

### 5.9 Client Portal

**Purpose:** Self-service portal for clients to manage orders and payments

**User Stories:**
- As a client, I want to view my order history
- As a client, I want to track my current order
- As a client, I want to manage my payment schedule

**Features:**
- Order history with filters
- Active order tracking
- Payment schedule view
- Invoice downloads
- Profile management
- Favorite orders
- Reorder functionality
- Communication hub

**Technical Implementation:**
- Tables: `clients`, `orders`, `payment_ledger`
- Service: `clientManagementService.ts`
- Pages: `/{companySlug}/portal/client/*`

**Acceptance Criteria:**
- ✅ Order history loads within 2 seconds
- ✅ Tracking updates in real-time
- ✅ Payment schedule shows accurate amounts
- ✅ Invoices download as PDF
- ✅ Profile updates save correctly

---

### 5.10 Email Automation

**Purpose:** Automated communication throughout the order lifecycle

**User Stories:**
- As an admin, I want to configure email templates
- As a sales rep, I want emails to send automatically
- As a client, I want to receive timely updates

**Features:**

#### Email Templates:
- Quote sent
- Quote reminder
- Order confirmation
- Payment received
- Delivery scheduled
- Order completed
- Follow-up request

#### Automation Settings:
- Trigger configuration
- Delay timers
- Conditional logic
- A/B testing
- Unsubscribe management
- Template versioning

#### After-Sales Emails:
- Thank you emails
- Review requests
- Upsell opportunities
- Re-engagement campaigns

**Technical Implementation:**
- Tables: `email_templates`, `email_automation_settings`, `email_logs`
- Services: `emailAutomationService.ts`, `emailService.ts`
- Integration: Resend API
- Pages: `/{companySlug}/admin/email-templates`

**Acceptance Criteria:**
- ✅ Templates support variable substitution
- ✅ Automation triggers fire reliably
- ✅ Email logs track delivery status
- ✅ Unsubscribe links work correctly
- ✅ A/B tests calculate winner accurately

---

### 5.11 Payment Processing

**Purpose:** Multi-gateway payment processing with ledger tracking

**User Stories:**
- As a client, I want to pay online securely
- As an admin, I want to track payment status
- As an accountant, I want accurate financial records

**Features:**

#### Payment Gateways:
- PayFast (South Africa)
- Stripe (International)
- PayPal (International)
- Manual payments

#### Payment Management:
- Payment schedule creation
- Installment tracking
- Refund processing
- Payment reminders
- Receipt generation
- Payment ledger

#### Financial Tracking:
- Revenue analytics
- Outstanding payments
- Payment trends
- Gateway fees tracking

**Technical Implementation:**
- Tables: `payment_gateways`, `payment_ledger`, `payment_schedules`
- Services: `paymentProcessingService.ts`, `paymentLedgerService.ts`, `payfastService.ts`
- Webhooks: `/api/webhooks/payment-confirmation`
- Pages: `/{companySlug}/admin/payment-gateways`

**Acceptance Criteria:**
- ✅ Payment gateway integration tests pass
- ✅ Webhooks verify signatures correctly
- ✅ Ledger balances reconcile accurately
- ✅ Refunds process within 24 hours
- ✅ Payment links expire after configured time

---

### 5.12 Notification System

**Purpose:** Real-time notifications across all channels

**User Stories:**
- As a user, I want to be notified of important events
- As an admin, I want to configure notification preferences
- As a user, I want to choose my notification channels

**Features:**

#### Notification Types:
- In-app notifications (bell icon)
- Email notifications
- WhatsApp notifications
- SMS notifications (future)

#### Notification Categories:
- Orders (new, updated, completed)
- Payments (received, overdue)
- Equipment (broken, shortages)
- Staff (duty changes, task assignments)
- System (maintenance, updates)

#### Notification Management:
- Preference settings per user
- Quiet hours configuration
- Notification batching
- Read/unread tracking
- Notification history

**Technical Implementation:**
- Tables: `notifications`, `notification_settings`
- Services: `notificationService.ts`, `realtimeNotificationService.ts`, `whatsappIntegrationService.ts`
- Component: `NotificationBell.tsx`
- Real-time: Supabase subscriptions

**Acceptance Criteria:**
- ✅ Notifications appear in real-time
- ✅ Bell icon shows unread count
- ✅ Preferences save correctly
- ✅ Email notifications deliver within 5 minutes
- ✅ WhatsApp integration sends successfully

---

### 5.13 White-Label Customization

**Purpose:** Allow each company to brand the platform

**User Stories:**
- As a company owner, I want my brand colors throughout
- As a company owner, I want my logo on all pages
- As a client, I want to see consistent company branding

**Features:**
- Logo upload (header, footer, email)
- Color scheme customization
- Typography selection
- Email signature
- Custom domain (future)
- Favicon customization
- Loading screen branding

**Technical Implementation:**
- Table: `white_label_settings`
- Context: `BrandingContext.tsx`
- Pages: `/{companySlug}/admin/white-label`
- CSS variables for theming

**Acceptance Criteria:**
- ✅ Logo uploads in correct formats
- ✅ Colors apply across all pages
- ✅ Email templates use custom branding
- ✅ Changes preview before saving
- ✅ Branding persists across sessions

---

### 5.14 Regional Management

**Purpose:** Support multiple geographic regions with local settings

**User Stories:**
- As an admin, I want to serve multiple regions
- As an admin, I want region-specific pricing
- As a user, I want to see my local currency

**Features:**
- Region configuration (ZA, UK, US)
- Currency management
- Tax rate configuration
- Regional pricing rules
- Service area mapping
- Timezone handling
- Language localization (future)

**Technical Implementation:**
- Tables: `regions`, `regional_settings`
- Service: `regionService.ts`
- Library: `regionManagement.ts`, `currencyUtils.ts`
- Component: `RegionSwitcher.tsx`
- Pages: `/{companySlug}/admin/regions`

**Acceptance Criteria:**
- ✅ Currency displays correctly per region
- ✅ Tax calculations use correct rates
- ✅ Service areas render on map
- ✅ Timezone conversions work accurately
- ✅ Region switching updates all pages

---

### 5.15 Analytics & Reporting

**Purpose:** Business intelligence and performance tracking

**User Stories:**
- As an admin, I want to see revenue trends
- As operations staff, I want to track efficiency metrics
- As a driver, I want to see my performance stats

**Features:**

#### Financial Reports:
- Revenue by period
- Outstanding payments
- Gateway fee analysis
- Profit margins
- Cost breakdowns

#### Operational Reports:
- Order completion rates
- Average delivery time
- Staff productivity
- Equipment utilization
- Customer satisfaction

#### Dashboards:
- Executive dashboard (KPIs)
- Operations dashboard (real-time)
- Sales dashboard (pipeline)
- Driver dashboard (earnings)

**Technical Implementation:**
- Service: `analyticsService.ts`, `aiFinancialService.ts`
- Pages: `/{companySlug}/admin/financial-dashboard`, `/{companySlug}/admin/reports`
- Chart library: Recharts or Chart.js

**Acceptance Criteria:**
- ✅ Reports generate within 5 seconds
- ✅ Data accuracy matches ledger
- ✅ Charts render responsively
- ✅ Export to CSV/PDF works
- ✅ Real-time dashboards update live

---

### 5.16 User Management

**Purpose:** Manage all platform users and their permissions

**User Stories:**
- As an admin, I want to create staff accounts
- As an admin, I want to assign roles and permissions
- As an admin, I want to deactivate users when they leave

**Features:**
- User creation with role assignment
- Bulk user import
- Password reset management
- Role-based access control (RBAC)
- User activity logs
- Session management
- Two-factor authentication (future)
- User directory

**Technical Implementation:**
- Tables: `profiles`, `user_roles`
- Services: `userManagementService.ts`, `roleService.ts`
- Pages: `/{companySlug}/admin/users`, `/{companySlug}/admin/users/new`
- API: `/api/admin/create-user`

**Acceptance Criteria:**
- ✅ User creation sends welcome email
- ✅ Role assignment applies correct permissions
- ✅ Password reset link expires after 24 hours
- ✅ Deactivated users cannot login
- ✅ Activity logs record all actions

---

### 5.17 Subscription Management

**Purpose:** Handle company subscriptions and billing

**User Stories:**
- As a company owner, I want to upgrade my plan
- As a company owner, I want to see my billing history
- As platform admin, I want to manage all subscriptions

**Features:**
- Subscription plans (Starter, Professional, Enterprise)
- Plan comparison
- Upgrade/downgrade flow
- Billing cycle management
- Invoice generation
- Payment method management
- Usage tracking
- Trial period management

**Technical Implementation:**
- Tables: `subscriptions`, `subscription_plans`, `subscription_invoices`
- Service: `subscriptionService.ts`, `billingEmailService.ts`
- Pages: `/{companySlug}/admin/subscription`, `/subscription/checkout`

**Acceptance Criteria:**
- ✅ Plan upgrade processes immediately
- ✅ Prorated charges calculate correctly
- ✅ Invoices generate on billing date
- ✅ Trial expiry notifications send timely
- ✅ Payment failures retry appropriately

---

## 6. User Journeys

### 6.1 Company Onboarding Journey

```
Step 1: Company Signup
└── Visit /company-signup
    └── Fill form (company name, email, industry)
    └── Choose company slug (URL: /{slug})
    └── Select region (ZA/UK/US)
    └── Submit
    └── Account created + confirmation email

Step 2: Welcome & Trial Start
└── Redirect to /{slug}/admin/onboarding
    └── Trial starts (14/30 days based on plan)
    └── Guided onboarding wizard appears

Step 3: Onboarding Wizard
└── Step 1: Company Profile
    └── Upload logo
    └── Set brand colors
    └── Configure basic settings
    
└── Step 2: Add Team Members
    └── Invite admin users
    └── Create driver accounts
    └── Setup kitchen staff
    
└── Step 3: Configure Services
    └── Define service areas
    └── Set pricing rules
    └── Add equipment inventory
    
└── Step 4: Setup Integrations
    └── Connect payment gateway
    └── Configure email service
    └── Link accounting software (optional)
    
└── Step 5: Create First Quote
    └── Add test client
    └── Build sample quote
    └── Send quote email

Step 4: Go Live
└── Complete onboarding checklist
    └── Subscription payment (if trial expired)
    └── System goes live
    └── Start accepting real orders
```

**Touchpoints:**
- Welcome email with login credentials
- Onboarding progress tracker (visible in sidebar)
- Help tooltips throughout wizard
- Optional setup call with support
- Completion certificate

**Success Metrics:**
- 80%+ complete onboarding within 7 days
- 90%+ convert from trial to paid
- <5% drop-off during wizard

---

### 6.2 Sales Journey (Lead → Order)

```
Step 1: Lead Capture
└── Lead submits inquiry form
    └── Auto-assigned to sales rep
    └── Sales rep receives email notification
    └── Lead appears in /leads dashboard

Step 2: Initial Contact
└── Sales rep calls/emails lead
    └── Logs contact in lead timeline
    └── Qualifies lead (budget, date, size)
    └── Marks status as "Contacted"

Step 3: Quote Creation
└── Sales rep goes to /quotes/new
    └── Selects client (or creates new)
    └── Adds items from catalog
    └── Sets pricing and terms
    └── Previews PDF
    └── Sends quote via email

Step 4: Quote Follow-up
└── Automated reminder email after 3 days
    └── Sales rep follows up by phone
    └── Logs follow-up in lead timeline
    └── Quote status: "Sent" → "Viewed"

Step 5: Quote Acceptance
└── Client clicks "Accept Quote" in email
    └── Redirected to acceptance page
    └── Signs digital agreement
    └── Quote converts to order automatically

Step 6: Order Creation
└── Order created with status "Confirmed"
    └── Operations team receives notification
    └── Invoice generated and sent to client
    └── Payment schedule created
    └── Order appears in operations hub
```

**Automation Points:**
- Lead auto-assignment based on rep availability
- Quote reminder emails (Day 3, 7, 14)
- Quote expiry notifications
- Order confirmation email to client
- Internal team notifications

**Success Metrics:**
- Lead response time <2 hours
- Quote creation time <15 minutes
- Quote-to-order conversion rate >35%
- Average sales cycle <10 days

---

### 6.3 Order Fulfillment Journey

```
Step 1: Order Confirmed
└── Order status: "Confirmed"
    └── Appears in operations hub
    └── Auto-assigned to operations manager

Step 2: Pre-Event Planning (T-7 days)
└── Operations manager reviews order
    └── Creates tasks for departments:
        - Kitchen: Prep list
        - Shopping: Purchase list
        - Drivers: Delivery assignment
        - Cleaning: Equipment checklist

Step 3: Shopping Phase (T-3 days)
└── Shopping staff receives list
    └── Purchases items
    └── Scans receipts
    └── Marks items as "Purchased"
    └── Budget tracking updates

Step 4: Kitchen Prep (T-1 day)
└── Kitchen staff clocks in
    └── Views prep list
    └── Completes tasks sequentially
    └── Marks items as "Completed"
    └── Chef verifies quality

Step 5: Pre-Delivery Setup (Event Day -2h)
└── Cleaning staff verifies equipment
    └── Checks all items against manifest
    └── Reports any broken equipment
    └── Loads delivery vehicle
    └── Completes vehicle checklist

Step 6: Delivery Phase
└── Driver starts route
    └── GPS tracking activates
    └── Client receives tracking link
    └── Driver navigates to location
    └── Geofence triggers arrival notification

Step 7: Setup & Service
└── Driver arrives at venue
    └── Unloads equipment
    └── Sets up catering station
    └── Client inspects and signs off
    └── Driver uploads photos

Step 8: Post-Event Cleanup
└── Driver returns to collect
    └── Cleaning staff inspects returned items
    └── Reports any damages
    └── Equipment checked back in
    └── Cleaning tasks assigned

Step 9: Order Completion
└── Operations manager reviews
    └── All tasks marked complete
    └── Client payment confirmed
    └── Order status: "Completed"
    └── Follow-up email sent to client
```

**Real-time Tracking:**
- Job progress tracker shows % complete
- Timeline view shows all milestones
- Department status indicators
- Delay alerts and notifications

**Success Metrics:**
- On-time delivery rate >95%
- Order completion within SLA 98%+
- Client satisfaction score >4.5/5
- Equipment damage rate <2%

---

### 6.4 Driver Daily Journey

```
Morning (Start of Shift)
└── Driver opens /{slug}/portal/driver
    └── Views today's deliveries
    └── Checks vehicle and equipment
    └── Clocks in via duty toggle

Pre-Delivery
└── Receives delivery assignment
    └── Reviews order details
    └── Checks pickup location
    └── Confirms departure time
    └── Starts GPS tracking

Active Delivery
└── Navigates to pickup location
    └── Loads items and verifies
    └── Confirms pickup in app
    └── Route to delivery location
    └── Client tracking link active

Arrival
└── Geofence triggers notification
    └── Unloads at venue
    └── Client signs off
    └── Photos uploaded as proof
    └── Marks delivery as complete

Multiple Stops (if applicable)
└── Views next stop on route
    └── Navigates to Stop 2
    └── Repeats delivery process
    └── All stops tracked in timeline

Return Journey
└── Collects equipment if needed
    └── Returns to depot
    └── Unloads vehicle
    └── Clocks out via duty toggle

End of Day
└── Reviews earnings for the day
    └── Checks schedule for tomorrow
    └── Logs out
```

**Support Features:**
- In-app navigation
- Emergency contact button
- Issue reporting
- Chat with operations
- Earnings tracker

---

### 6.5 Client Order Tracking Journey

```
Order Placed
└── Client receives order confirmation email
    └── Email contains tracking link
    └── Link format: /tracking/client?orderId=xxx

Pre-Event Day
└── Client opens tracking link
    └── Views order status: "In Progress"
    └── Sees preparation milestones
    └── Reviews order details

Event Day (Delivery Active)
└── Receives notification: "Driver en route"
    └── Opens tracking map
    └── Sees driver location (real-time)
    └── Views estimated arrival time
    └── Route shown on map

Driver Nearby
└── Receives notification: "Driver 5 minutes away"
    └── Prepares for delivery
    └── Watches arrival on map

Delivery Complete
└── Receives notification: "Delivery complete"
    └── Views proof of delivery photos
    └── Order status: "Delivered"

Post-Event
└── Receives follow-up email
    └── Reviews order and provides feedback
    └── Views invoice and payment status
    └── Option to reorder
```

**Communication Channels:**
- Email notifications
- WhatsApp updates (if enabled)
- SMS alerts (future)
- In-app notifications

---

## 7. Database Schema

### 7.1 Core Tables

#### Companies
```sql
companies
├── id (UUID, PK)
├── company_name (TEXT)
├── company_slug (TEXT, UNIQUE)
├── email (TEXT)
├── phone (TEXT)
├── address (TEXT)
├── region (TEXT) -- 'ZA', 'UK', 'US'
├── status (TEXT) -- 'active', 'inactive', 'suspended'
├── trial_ends_at (TIMESTAMP)
├── subscription_id (UUID, FK → subscriptions)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Profiles (Users)
```sql
profiles
├── id (UUID, PK, FK → auth.users)
├── email (TEXT)
├── full_name (TEXT)
├── phone (TEXT)
├── role (TEXT) -- 'admin', 'driver', 'kitchen_staff', etc.
├── active_role (TEXT) -- Current active role
├── company_id (UUID, FK → companies)
├── company_slug (TEXT)
├── avatar_url (TEXT)
├── is_active (BOOLEAN)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Leads
```sql
leads
├── id (UUID, PK)
├── company_id (UUID, FK → companies)
├── client_name (TEXT)
├── email (TEXT)
├── phone (TEXT)
├── event_date (DATE)
├── event_type (TEXT)
├── guest_count (INTEGER)
├── status (TEXT) -- 'new', 'contacted', 'quoted', 'won', 'lost'
├── assigned_to (UUID, FK → profiles)
├── notes (TEXT)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Quotes
```sql
quotes
├── id (UUID, PK)
├── company_id (UUID, FK → companies)
├── quote_number (TEXT, UNIQUE)
├── client_id (UUID, FK → profiles)
├── lead_id (UUID, FK → leads)
├── items (JSONB) -- Array of quote items
├── subtotal (DECIMAL)
├── tax (DECIMAL)
├── total (DECIMAL)
├── status (TEXT) -- 'draft', 'sent', 'accepted', 'rejected'
├── valid_until (DATE)
├── terms (TEXT)
├── notes (TEXT)
├── created_by (UUID, FK → profiles)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Orders
```sql
orders
├── id (UUID, PK)
├── company_id (UUID, FK → companies)
├── order_number (TEXT, UNIQUE)
├── quote_id (UUID, FK → quotes)
├── client_id (UUID, FK → profiles)
├── event_date (DATE)
├── event_time (TIME)
├── venue_address (TEXT)
├── venue_lat (DECIMAL)
├── venue_lng (DECIMAL)
├── guest_count (INTEGER)
├── status (TEXT) -- 'confirmed', 'in_progress', 'completed', 'cancelled'
├── subtotal (DECIMAL)
├── tax (DECIMAL)
├── total (DECIMAL)
├── deposit_paid (DECIMAL)
├── balance_due (DECIMAL)
├── special_instructions (TEXT)
├── assigned_driver (UUID, FK → profiles)
├── assigned_to_kitchen (BOOLEAN)
├── assigned_to_shopping (BOOLEAN)
├── assigned_to_cleaning (BOOLEAN)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Order Items
```sql
order_items
├── id (UUID, PK)
├── order_id (UUID, FK → orders)
├── item_name (TEXT)
├── description (TEXT)
├── quantity (INTEGER)
├── unit_price (DECIMAL)
├── total_price (DECIMAL)
├── category (TEXT)
└── created_at (TIMESTAMP)
```

#### Order Timeline
```sql
order_timeline
├── id (UUID, PK)
├── order_id (UUID, FK → orders)
├── event_type (TEXT) -- 'created', 'confirmed', 'shopping_complete', etc.
├── description (TEXT)
├── user_id (UUID, FK → profiles)
├── metadata (JSONB)
└── created_at (TIMESTAMP)
```

---

### 7.2 Inventory & Equipment

#### Inventory
```sql
inventory
├── id (UUID, PK)
├── company_id (UUID, FK → companies)
├── item_name (TEXT)
├── category (TEXT) -- 'equipment', 'supplies', 'ingredients'
├── quantity (INTEGER)
├── unit (TEXT) -- 'pieces', 'kg', 'liters'
├── reorder_level (INTEGER)
├── status (TEXT) -- 'in_stock', 'low_stock', 'out_of_stock'
├── location (TEXT)
├── supplier (TEXT)
├── cost_per_unit (DECIMAL)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Equipment Tracking
```sql
equipment_tracking
├── id (UUID, PK)
├── company_id (UUID, FK → companies)
├── equipment_id (UUID, FK → inventory)
├── order_id (UUID, FK → orders)
├── status (TEXT) -- 'available', 'in_use', 'maintenance', 'broken'
├── checked_out_by (UUID, FK → profiles)
├── checked_out_at (TIMESTAMP)
├── checked_in_by (UUID, FK → profiles)
├── checked_in_at (TIMESTAMP)
├── condition_notes (TEXT)
└── created_at (TIMESTAMP)
```

#### Equipment Shortages
```sql
equipment_shortages
├── id (UUID, PK)
├── company_id (UUID, FK → companies)
├── order_id (UUID, FK → orders)
├── equipment_id (UUID, FK → inventory)
├── quantity_needed (INTEGER)
├── quantity_available (INTEGER)
├── shortage_amount (INTEGER)
├── status (TEXT) -- 'pending', 'resolved', 'cancelled'
├── resolution_plan (TEXT)
├── resolved_at (TIMESTAMP)
└── created_at (TIMESTAMP)
```

---

### 7.3 Driver & Tracking

#### Drivers
```sql
drivers
├── id (UUID, PK, FK → profiles)
├── company_id (UUID, FK → companies)
├── license_number (TEXT)
├── vehicle_type (TEXT)
├── vehicle_registration (TEXT)
├── is_available (BOOLEAN)
├── rating (DECIMAL)
├── total_deliveries (INTEGER)
├── earnings_to_date (DECIMAL)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Driver Locations
```sql
driver_locations
├── id (UUID, PK)
├── driver_id (UUID, FK → drivers)
├── order_id (UUID, FK → orders)
├── latitude (DECIMAL)
├── longitude (DECIMAL)
├── accuracy (INTEGER) -- meters
├── heading (INTEGER) -- degrees
├── speed (DECIMAL) -- km/h
├── battery_level (INTEGER) -- percentage
├── is_active (BOOLEAN)
└── created_at (TIMESTAMP)
```

#### Routes
```sql
routes
├── id (UUID, PK)
├── company_id (UUID, FK → companies)
├── driver_id (UUID, FK → drivers)
├── route_name (TEXT)
├── start_location (TEXT)
├── end_location (TEXT)
├── status (TEXT) -- 'pending', 'active', 'completed'
├── total_distance (DECIMAL) -- km
├── estimated_duration (INTEGER) -- minutes
├── started_at (TIMESTAMP)
├── completed_at (TIMESTAMP)
└── created_at (TIMESTAMP)
```

#### Route Stops
```sql
route_stops
├── id (UUID, PK)
├── route_id (UUID, FK → routes)
├── order_id (UUID, FK → orders)
├── stop_number (INTEGER)
├── address (TEXT)
├── latitude (DECIMAL)
├── longitude (DECIMAL)
├── status (TEXT) -- 'pending', 'in_progress', 'completed'
├── arrival_time (TIMESTAMP)
├── departure_time (TIMESTAMP)
├── notes (TEXT)
└── created_at (TIMESTAMP)
```

---

### 7.4 Payments & Billing

#### Payment Gateways
```sql
payment_gateways
├── id (UUID, PK)
├── company_id (UUID, FK → companies)
├── gateway_name (TEXT) -- 'payfast', 'stripe', 'paypal'
├── is_active (BOOLEAN)
├── merchant_id (TEXT, ENCRYPTED)
├── merchant_key (TEXT, ENCRYPTED)
├── api_key (TEXT, ENCRYPTED)
├── configuration (JSONB) -- Gateway-specific settings
├── test_mode (BOOLEAN)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Payment Ledger
```sql
payment_ledger
├── id (UUID, PK)
├── company_id (UUID, FK → companies)
├── order_id (UUID, FK → orders)
├── client_id (UUID, FK → profiles)
├── amount (DECIMAL)
├── payment_type (TEXT) -- 'deposit', 'balance', 'refund'
├── payment_method (TEXT) -- 'card', 'eft', 'cash'
├── gateway_id (UUID, FK → payment_gateways)
├── transaction_id (TEXT) -- Gateway transaction ID
├── status (TEXT) -- 'pending', 'completed', 'failed', 'refunded'
├── payment_date (TIMESTAMP)
├── notes (TEXT)
└── created_at (TIMESTAMP)
```

#### Payment Schedules
```sql
payment_schedules
├── id (UUID, PK)
├── order_id (UUID, FK → orders)
├── installment_number (INTEGER)
├── due_date (DATE)
├── amount (DECIMAL)
├── status (TEXT) -- 'pending', 'paid', 'overdue'
├── paid_at (TIMESTAMP)
├── reminder_sent (BOOLEAN)
└── created_at (TIMESTAMP)
```

---

### 7.5 Subscriptions

#### Subscription Plans
```sql
subscription_plans
├── id (UUID, PK)
├── plan_name (TEXT) -- 'Starter', 'Professional', 'Enterprise'
├── plan_code (TEXT, UNIQUE)
├── description (TEXT)
├── features (JSONB)
├── price_monthly (DECIMAL)
├── price_annual (DECIMAL)
├── currency (TEXT)
├── max_users (INTEGER)
├── max_orders_per_month (INTEGER)
├── is_active (BOOLEAN)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Subscriptions
```sql
subscriptions
├── id (UUID, PK)
├── company_id (UUID, FK → companies, UNIQUE)
├── plan_id (UUID, FK → subscription_plans)
├── status (TEXT) -- 'trial', 'active', 'past_due', 'cancelled'
├── billing_cycle (TEXT) -- 'monthly', 'annual'
├── trial_ends_at (TIMESTAMP)
├── current_period_start (DATE)
├── current_period_end (DATE)
├── cancel_at_period_end (BOOLEAN)
├── cancelled_at (TIMESTAMP)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Subscription Invoices
```sql
subscription_invoices
├── id (UUID, PK)
├── subscription_id (UUID, FK → subscriptions)
├── invoice_number (TEXT, UNIQUE)
├── amount (DECIMAL)
├── tax (DECIMAL)
├── total (DECIMAL)
├── status (TEXT) -- 'draft', 'open', 'paid', 'void'
├── due_date (DATE)
├── paid_at (TIMESTAMP)
├── invoice_url (TEXT)
└── created_at (TIMESTAMP)
```

---

### 7.6 Communications

#### Email Templates
```sql
email_templates
├── id (UUID, PK)
├── company_id (UUID, FK → companies)
├── template_name (TEXT)
├── template_code (TEXT) -- 'quote_sent', 'order_confirmed', etc.
├── subject (TEXT)
├── body_html (TEXT)
├── variables (JSONB) -- List of available variables
├── is_active (BOOLEAN)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Email Automation Settings
```sql
email_automation_settings
├── id (UUID, PK)
├── company_id (UUID, FK → companies)
├── trigger_event (TEXT) -- 'quote_sent', 'order_confirmed', etc.
├── template_id (UUID, FK → email_templates)
├── delay_minutes (INTEGER)
├── is_active (BOOLEAN)
├── conditions (JSONB) -- Conditional logic
└── created_at (TIMESTAMP)
```

#### Email Logs
```sql
email_logs
├── id (UUID, PK)
├── company_id (UUID, FK → companies)
├── template_id (UUID, FK → email_templates)
├── recipient_email (TEXT)
├── subject (TEXT)
├── status (TEXT) -- 'sent', 'delivered', 'bounced', 'failed'
├── sent_at (TIMESTAMP)
├── delivered_at (TIMESTAMP)
├── opened_at (TIMESTAMP)
├── clicked_at (TIMESTAMP)
├── error_message (TEXT)
└── created_at (TIMESTAMP)
```

#### Notifications
```sql
notifications
├── id (UUID, PK)
├── company_id (UUID, FK → companies)
├── user_id (UUID, FK → profiles)
├── title (TEXT)
├── message (TEXT)
├── type (TEXT) -- 'order', 'payment', 'system', etc.
├── priority (TEXT) -- 'low', 'medium', 'high', 'urgent'
├── is_read (BOOLEAN)
├── read_at (TIMESTAMP)
├── action_url (TEXT)
├── metadata (JSONB)
└── created_at (TIMESTAMP)
```

---

### 7.7 White-Label & Settings

#### White Label Settings
```sql
white_label_settings
├── id (UUID, PK)
├── company_id (UUID, FK → companies, UNIQUE)
├── logo_url (TEXT)
├── primary_color (TEXT) -- Hex color
├── secondary_color (TEXT)
├── accent_color (TEXT)
├── font_family (TEXT)
├── custom_css (TEXT)
├── email_signature (TEXT)
├── footer_text (TEXT)
└── updated_at (TIMESTAMP)
```

#### Regional Settings
```sql
regional_settings
├── id (UUID, PK)
├── company_id (UUID, FK → companies)
├── region_code (TEXT) -- 'ZA', 'UK', 'US'
├── currency_code (TEXT) -- 'ZAR', 'GBP', 'USD'
├── tax_rate (DECIMAL)
├── timezone (TEXT)
├── date_format (TEXT)
├── distance_unit (TEXT) -- 'km', 'miles'
├── is_default (BOOLEAN)
└── created_at (TIMESTAMP)
```

---

## 8. Technical Stack

### 8.1 Frontend

**Framework:**
- Next.js 15.2 (Pages Router)
- React 18
- TypeScript 5.x

**Styling:**
- Tailwind CSS v3
- Shadcn/UI component library
- CSS Modules for custom styling
- Responsive design (mobile-first)

**State Management:**
- React Context API
- Supabase real-time subscriptions
- Local state with hooks

**UI Components:**
- Shadcn/UI (pre-built components)
- Lucide React (icons)
- Framer Motion (animations)
- React Hook Form (forms)
- Zod (validation)

**Maps & Location:**
- Google Maps JavaScript API
- Geolocation API
- Geocoding services

---

### 8.2 Backend

**Database:**
- Supabase (PostgreSQL)
- Row Level Security (RLS)
- Real-time subscriptions
- Database functions
- Triggers for automation

**Authentication:**
- Supabase Auth
- Email/password
- OAuth providers (Google, future)
- Role-based access control
- Session management

**Storage:**
- Supabase Storage
- File uploads (images, PDFs)
- Public and private buckets

**Serverless Functions:**
- Next.js API Routes
- Supabase Edge Functions (Deno)
- Webhook handlers

---

### 8.3 Infrastructure

**Hosting:**
- Vercel (Frontend)
- Supabase (Backend/Database)
- CDN for static assets

**Domain & DNS:**
- Custom domain support
- SSL/TLS encryption
- Subdomain routing for multi-tenancy

**Monitoring:**
- Vercel Analytics
- Supabase Dashboard
- Error tracking (Sentry - future)

---

### 8.4 Development Tools

**Version Control:**
- Git
- GitHub repository
- Branch protection rules

**Package Management:**
- npm
- Package.json dependency management

**Code Quality:**
- ESLint (linting)
- TypeScript compiler
- Prettier (formatting - future)

**Build & Deploy:**
- Vercel CI/CD
- Automatic deployments from main branch
- Preview deployments for PRs

---

## 9. Integration Ecosystem

### 9.1 Payment Gateways

#### PayFast (South Africa)
**Purpose:** Primary payment processor for ZA region  
**Integration Type:** Redirect + Webhook  
**Features:**
- Instant EFT
- Credit/debit cards
- SnapScan
- Zapper
- Subscription billing

**Implementation:**
- Service: `payfastService.ts`
- Webhook: `/api/webhooks/payment-confirmation`
- Security: MD5 signature verification

**Configuration:**
- Merchant ID
- Merchant Key
- Passphrase
- Test/Production mode

---

#### Stripe (International)
**Purpose:** Payment processing for UK/US regions  
**Status:** Planned  
**Features:**
- Credit/debit cards
- Apple Pay / Google Pay
- ACH transfers (US)
- SEPA (Europe)
- Subscription billing

---

#### PayPal
**Purpose:** Alternative payment option  
**Status:** Planned  
**Features:**
- PayPal balance
- Credit/debit cards via PayPal
- Buy Now Pay Later

---

### 9.2 Communication Services

#### Resend (Email)
**Purpose:** Transactional email delivery  
**Integration Type:** API  
**Features:**
- Template rendering
- Delivery tracking
- Bounce handling
- Unsubscribe management

**Implementation:**
- Service: `emailService.ts`
- API endpoint: `/api/send-email`

**Email Types:**
- Order confirmations
- Payment receipts
- Delivery notifications
- Marketing campaigns

---

#### WhatsApp Business API
**Purpose:** Real-time notifications  
**Integration Type:** Cloud API  
**Features:**
- Message templates
- Media messaging
- Delivery status
- Two-way communication

**Implementation:**
- Service: `whatsappIntegrationService.ts`
- Template management: `whatsappTemplateService.ts`

**Use Cases:**
- Order updates
- Driver arrival notifications
- Payment reminders
- Support messages

---

### 9.3 Mapping & Location

#### Google Maps Platform
**Purpose:** Geocoding, routing, and mapping  
**APIs Used:**
- Geocoding API
- Maps JavaScript API
- Directions API
- Places API (future)

**Implementation:**
- Service: `googleMapsService.ts`
- Components: Map displays, autocomplete

**Features:**
- Address validation
- Route optimization
- Distance calculation
- ETA estimation

---

### 9.4 Accounting Integration

#### Xero (Planned)
**Purpose:** Accounting software sync  
**Integration Type:** OAuth + API  
**Features:**
- Invoice sync
- Payment reconciliation
- Expense tracking
- Financial reporting

**Implementation:**
- Service: `xeroIntegrationService.ts`
- OAuth flow for authorization

---

### 9.5 Future Integrations

**Planned:**
- QuickBooks (Accounting)
- Mailchimp (Email marketing)
- Twilio (SMS notifications)
- Zapier (Workflow automation)
- Calendly (Appointment scheduling)
- DocuSign (Digital signatures)
- Slack (Team communication)

---

## 10. Security & Compliance

### 10.1 Authentication & Authorization

**Authentication Methods:**
- Email + Password (primary)
- OAuth (Google - configured)
- Magic links (future)
- Two-factor authentication (future)

**Password Requirements:**
- Minimum 8 characters
- Mix of letters, numbers, symbols
- Hashed with bcrypt
- Password reset via email

**Session Management:**
- JWT tokens
- Secure HTTP-only cookies
- Token expiration (24 hours)
- Refresh token rotation

**Role-Based Access Control (RBAC):**
- Row Level Security (RLS) in database
- Role checks in API routes
- Permission-based UI rendering
- Audit logging for sensitive actions

---

### 10.2 Data Security

**Encryption:**
- Data in transit: TLS 1.3
- Data at rest: AES-256
- Sensitive fields: Additional encryption layer
- API keys: Environment variables only

**Database Security:**
- RLS policies on all tables
- Parameterized queries (SQL injection prevention)
- Connection pooling
- Backup encryption

**File Storage:**
- Private buckets for sensitive files
- Public URLs with signed tokens
- File type validation
- Size limits enforced

**API Security:**
- Rate limiting (future)
- CORS policies
- Input validation (Zod schemas)
- Output sanitization

---

### 10.3 Compliance

#### POPIA (South Africa)
- Privacy policy published
- User consent mechanisms
- Data access requests supported
- Data deletion capabilities
- Breach notification procedures

#### GDPR (Europe)
- Right to access data
- Right to be forgotten
- Data portability
- Consent management
- Cookie policies

#### PCI DSS (Payment Cards)
- No card data stored on server
- Payment gateway tokenization
- Secure transmission only
- Regular security audits

---

### 10.4 Privacy & Data Protection

**Data Collection:**
- Minimal data collection principle
- Clear privacy policy
- User consent obtained
- Anonymous analytics (future)

**Data Retention:**
- Active users: Indefinite
- Inactive users: 2 years
- Deleted accounts: 30-day grace period
- Backup retention: 90 days

**User Rights:**
- View personal data
- Export data (CSV/JSON)
- Update information
- Delete account
- Opt-out of marketing

---

### 10.5 Security Best Practices

**Development:**
- Code reviews required
- Dependency scanning
- Security linting
- Regular updates

**Production:**
- Environment variables for secrets
- No hardcoded credentials
- Audit logs for admin actions
- Error logging without sensitive data

**Incident Response:**
- Security contact: security@cateringms.com
- Response SLA: 24 hours
- Breach notification process
- Post-mortem documentation

---

## 11. Pricing & Business Model

### 11.1 Subscription Plans

#### Starter Plan
**Price:** $49/month or $490/year (save 17%)  
**Target:** Small catering businesses (1-5 employees)  
**Features:**
- Up to 5 users
- 50 orders/month
- Basic reporting
- Email support
- 2GB storage

**Limitations:**
- No white-label customization
- Basic email automation
- Single region only

---

#### Professional Plan
**Price:** $99/month or $990/year (save 17%)  
**Target:** Growing businesses (5-20 employees)  
**Features:**
- Up to 20 users
- 200 orders/month
- Advanced reporting
- Priority email support
- 10GB storage
- White-label branding
- Email automation
- Multi-region support
- WhatsApp notifications

**Limitations:**
- Standard integrations only
- Community support forum

---

#### Enterprise Plan
**Price:** $299/month or $2990/year (save 17%)  
**Target:** Large operations (20+ employees)  
**Features:**
- Unlimited users
- Unlimited orders
- Custom reporting
- Dedicated account manager
- 100GB storage
- Full white-label
- Advanced automation
- Multi-region + multi-currency
- All integrations included
- API access
- Custom development options
- 99.9% SLA

---

### 11.2 Add-ons (Optional)

**Additional Users:** $5/user/month  
**Extra Storage:** $10/10GB/month  
**WhatsApp Messages:** $0.05/message  
**SMS Notifications:** $0.10/message  
**Custom Integrations:** $500-5000 one-time  
**Onboarding Support:** $299 one-time  
**Training Sessions:** $149/hour  

---

### 11.3 Free Trial

**Duration:** 14 days (Starter/Professional) or 30 days (Enterprise)  
**Credit Card:** Not required  
**Access:** Full plan features  
**Notifications:** 7 days before expiry, 3 days before, day of expiry  
**Post-Trial:** Automatic downgrade to free tier (read-only)

---

### 11.4 Revenue Streams

**Primary:**
- Subscription fees (90% of revenue)
- Annual renewals (preferred)

**Secondary:**
- Add-on purchases
- Premium support
- Custom development
- Training services

**Future:**
- Marketplace commissions (equipment/supplies)
- Payment processing fees (small %)
- Referral bonuses
- Affiliate program

---

### 11.5 Pricing Strategy

**Value-Based Pricing:**
- Priced on value delivered, not just features
- ROI focus: Save 10+ hours/week
- Reduce errors by 80%
- Increase orders by 30%

**Geographic Pricing:**
- ZA: Prices in ZAR (converted)
- UK: Prices in GBP
- US: Prices in USD
- Automatic currency conversion

**Discounts:**
- Annual payment: 17% off
- Non-profit organizations: 20% off
- Referrals: 1 month free
- Startups: 50% off for 6 months

---

## 12. Roadmap & Future Development

### 12.1 Short-Term (Q1 2025)

**Platform Stability:**
- ✅ Fix all critical bugs
- ✅ Complete user testing
- ✅ Performance optimization
- ✅ Security audit

**Feature Completion:**
- ✅ Email automation fully tested
- ✅ Payment gateway integration complete
- ✅ GPS tracking stable
- ✅ White-label customization working

**Launch Preparation:**
- ✅ Marketing website complete
- ✅ Documentation finalized
- ✅ Support system ready
- ✅ Pricing plans confirmed

---

### 12.2 Mid-Term (Q2-Q3 2025)

**Mobile Apps:**
- iOS app (Swift/SwiftUI)
- Android app (Kotlin)
- Driver-focused features
- Offline mode support

**Advanced Features:**
- SMS notifications
- Advanced analytics dashboard
- Recipe management system
- Supplier portal
- Client self-service ordering

**Integrations:**
- QuickBooks accounting
- Mailchimp email marketing
- Zapier workflows
- Calendar integrations

**Scale:**
- 100+ active companies
- Multi-language support
- Additional regions (AUS, NZ)

---

### 12.3 Long-Term (Q4 2025+)

**AI & Automation:**
- AI-powered demand forecasting
- Recipe scaling suggestions
- Route optimization with ML
- Chatbot support
- Predictive analytics

**Marketplace:**
- Equipment rental marketplace
- Supplier directory
- Service provider network
- Review system

**Enterprise Features:**
- Multi-company management
- Franchise support
- Advanced permissions
- Custom workflows
- API for third-party apps

**Global Expansion:**
- European markets
- Asian markets
- Localization for 10+ languages
- Regional payment gateways

---

### 12.4 Innovation Roadmap

**Emerging Technologies:**
- IoT integration (smart equipment)
- Blockchain for supply chain
- AR for event planning
- Voice-activated assistants

**Sustainability:**
- Carbon footprint tracking
- Waste reduction tools
- Local sourcing incentives
- Green delivery options

**Community Features:**
- Knowledge base
- Community forums
- Recipe sharing
- Best practices library

---

## Appendix A: Technical Requirements

### Minimum Browser Support
- Chrome 90+
- Safari 14+
- Firefox 88+
- Edge 90+

### Mobile Compatibility
- iOS 14+
- Android 10+
- Responsive design for all screen sizes

### Performance Targets
- Page load: <3 seconds
- Time to interactive: <5 seconds
- API response: <500ms (p95)
- Database queries: <100ms (p95)

### Uptime & Reliability
- Target uptime: 99.9%
- Scheduled maintenance: 2 hours/month max
- Backup frequency: Every 6 hours
- Disaster recovery: <4 hours RTO

---

## Appendix B: Support & Documentation

### Support Channels
- Email: support@cateringms.com
- In-app chat (Enterprise)
- Knowledge base
- Video tutorials
- Community forum

### Response Times
- Critical issues: 2 hours
- High priority: 8 hours
- Medium priority: 24 hours
- Low priority: 48 hours

### Documentation
- User guides per role
- Admin documentation
- API documentation
- Integration guides
- Video tutorials
- FAQ section

---

## Appendix C: Glossary

**Company Slug:** Unique URL identifier for each company (e.g., `/mygat`)  
**Multi-tenant:** Architecture where multiple companies share infrastructure  
**RLS:** Row Level Security - database-level access control  
**Geofencing:** Virtual boundary triggering actions when crossed  
**White-label:** Customizable branding per company  
**SLA:** Service Level Agreement - uptime guarantees  
**ARR:** Annual Recurring Revenue  
**MRR:** Monthly Recurring Revenue  
**Churn:** Rate at which customers cancel subscriptions  
**LTV:** Lifetime Value - total revenue per customer  
**CAC:** Customer Acquisition Cost  

---

## Document Control

**Version History:**
- v1.0 (2025-10-27): Initial comprehensive PRD

**Maintained By:** Product Team  
**Review Cycle:** Monthly  
**Next Review:** 2025-11-27  

**Feedback:** Contact product@cateringms.com

---

**End of Document**
