# CaterOS Signup & Onboarding Process - Complete Technical Guide

## Executive Summary

When a user signs up for CaterOS, we create a comprehensive onboarding experience designed to reduce friction, provide immediate value, and guide them to success. This document outlines the technical implementation and user experience flow.

---

## 1. USER DISCOVERY & SIGNUP JOURNEY

### A. Pre-Signup Experience

**What Users Can Do Before Signing Up:**

1. **Explore Landing Page** (`/`)
   - Hero section with value proposition
   - Feature highlights
   - Founder story
   - Social proof and testimonials
   - Clear CTA: "Start Free Trial"

2. **Try Demo Mode** (No Signup Required)
   - Toggle Demo Mode in header
   - Switch between 6 different user roles:
     - Admin (full system access)
     - Driver (delivery portal)
     - Client (customer portal)
     - Kitchen (production portal)
     - Shopping (purchasing portal)
     - Cleaning (equipment management)
   - Explore with pre-populated dummy data
   - See exactly how the platform works

3. **Browse Resources**
   - `/features` - Detailed feature breakdown
   - `/pricing` - Transparent pricing (with 14-day free trial)
   - `/blog` - 20+ SEO-optimized articles
   - `/contact` - Support information

**Technical Implementation:**
- Demo mode state managed in `DemoModeContext`
- Role switching without authentication
- Mock data from `lib/mockData.ts` and `lib/sampleData.ts`
- No database writes in demo mode

---

## 2. SIGNUP PROCESS (Technical Flow)

### Registration Form (`/auth/register`)

**User Provides:**
```typescript
{
  full_name: string,        // Required
  email: string,            // Required, validated
  password: string,         // Required, min 8 chars
  currency: "ZAR" | "USD" | "EUR" | "GBP"  // Required, defaults to ZAR
}
```

### Backend Process (When User Clicks "Sign Up")

**Step 1: Supabase Authentication**
```typescript
// src/services/authService.ts - signUp()

const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: `${getURL()}auth/confirm-email`
  }
});
```

**What Happens:**
- Supabase creates authentication record
- Secure password hash stored
- User UUID generated
- Email verification sent (Supabase handles this)

**Step 2: Profile Creation**
```typescript
// src/services/profileService.ts - createProfile()

const trialEndDate = new Date();
trialEndDate.setDate(trialEndDate.getDate() + 14); // 14-day trial

await supabase.from("profiles").insert({
  id: userId,
  email: email,
  full_name: fullName,
  role: "admin",                    // Default role
  currency: selectedCurrency,
  is_active: true,
  subscription_plan: "trial",
  subscription_status: "trialing",
  trial_ends_at: trialEndDate.toISOString(),
  avatar_url: "",
  company_name: fullName,           // Can be updated later
  phone: ""
});
```

**Step 3: Onboarding Initialization**
```typescript
// src/services/onboardingService.ts - initializeUserData()

await onboardingService.initializeUserData({
  userId: data.user.id,
  companyName: fullName,
  email: email,
  fullName: fullName,
  currency: currency
});
```

**What Gets Created:**
- Welcome notification logged (console)
- Welcome email prepared (ready for SMTP integration)
- Onboarding progress tracking initialized

---

## 3. DATA CREATED ON SIGNUP

### Immediate Database Records

**1. Authentication Record** (Supabase Auth)
```sql
auth.users
├── id (UUID)
├── email (validated)
├── encrypted_password
├── email_confirmed_at (null until verified)
├── created_at
└── updated_at
```

**2. Profile Record** (`profiles` table)
```sql
profiles
├── id (UUID, matches auth.users.id)
├── email
├── full_name
├── company_name (initially same as full_name)
├── phone (empty, to be filled)
├── avatar_url (empty)
├── role ("admin")
├── currency (user selected)
├── is_active (true)
├── subscription_plan ("trial")
├── subscription_status ("trialing")
├── trial_ends_at (14 days from now)
├── created_at
└── updated_at
```

### Ready for Expansion (Documented, Not Yet Auto-Created)

These are prepared in the codebase but can be enabled:

**3. Starter Inventory** (200 items)
- Pre-configured inventory items
- Categories: Food, Beverages, Dry Goods, etc.
- With expiry tracking enabled
- Source: `lib/starterInventory.ts` (2834 lines)

**4. Equipment Categories**
- Cutlery, Crockery, Chafing Dishes
- Cleaning schedules
- Availability tracking

**5. Email Templates** (12 templates)
- Quote emails
- Follow-up emails
- Booking confirmation
- Payment receipts
- Event reminders
- Thank you emails

**6. After-Sales Email Sequences** (6 emails)
- 2-month intervals over 12 months
- Relationship building
- Upsell opportunities
- Customer retention

**7. Default Region**
```sql
regions
├── id (UUID)
├── user_id
├── region_name ("{Company Name} - Main")
├── status ("active")
└── settings (JSON with defaults)
```

**8. Payment Gateway Placeholder**
- PayFast configuration ready
- Stripe configuration ready
- Awaiting user connection

---

## 4. FIRST LOGIN EXPERIENCE

### What User Sees After Email Verification

**Dashboard Layout:**
```
┌─────────────────────────────────────────────┐
│  Header (with Demo Mode Toggle)            │
├─────────────────────────────────────────────┤
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ Onboarding Progress Tracker           │ │
│  │                                       │ │
│  │ Get Started with CaterOS              │ │
│  │ Complete your setup to unlock full    │ │
│  │                                       │ │
│  │ Setup Progress: [████░░░░░░] 20%     │ │
│  │                                       │ │
│  │ ☑ Account Created                    │ │
│  │ ○ Complete Company Profile  [Go →]   │ │
│  │ ○ Create First Quote        [Go →]   │ │
│  │                                       │ │
│  │ Need help? Call 083 652 5755         │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  Main Dashboard Content                    │
│                                             │
└─────────────────────────────────────────────┘
```

**OnboardingProgressTracker Component:**
- Location: `src/components/OnboardingProgressTracker.tsx`
- Shows completion progress
- Links to relevant pages
- Dismissible (stored in localStorage)
- Hidden when 100% complete

**Progress Tracking:**
```typescript
const steps = [
  {
    id: "profile",
    label: "Complete Company Profile",
    completed: !!(companyName && phone),
    action: { label: "Complete Profile", href: "/admin/settings" }
  },
  {
    id: "quote",
    label: "Create First Quote",
    completed: quoteCount > 0,
    action: { label: "Create Quote", href: "/quotes/new" }
  }
];
```

---

## 5. AUTOMATED COMMUNICATION PLAN

### Email Sequence (Ready for SMTP Integration)

**Email #1: Immediate Welcome (T+60 seconds)**
```
Subject: Welcome to CaterOS - Your Catering Business Just Got Smarter! 🎉
From: CaterOS Team <welcome@cateros.com>

Hi [FirstName],

Welcome to CaterOS! You're about to transform how you run your catering business.

Your 14-day free trial is now active. Here's what you can do right away:

✓ Create your first quote in under 2 minutes
✓ Set up your calendar and start taking bookings
✓ Invite your team members
✓ Connect your payment gateway

Quick Start Guide: [Link to video]
Need Help? Call us: 083 652 5755

Best regards,
The CaterOS Team

---
CaterOS by Skylight Digital
17 Swalle Street, Golden Acre
```

**Email #2: Getting Started Guide (Day 1, +4 hours)**
```
Subject: Here's How to Set Up CaterOS in Under 30 Minutes

[Setup checklist]
[Video tutorials]
[Support resources]
```

**Email #3: Feature Spotlight - Leads (Day 2)**
```
Subject: How to Never Miss a Catering Lead Again

[Lead management tutorial]
[Best practices]
```

**Email #4: Feature Spotlight - Quotes (Day 4)**
```
Subject: Create Professional Quotes in Under 2 Minutes

[Quote builder walkthrough]
[Pricing strategies]
```

**Email #5: Mid-Trial Check-In (Day 7)**
```
Subject: How Are You Finding CaterOS? (+ Special Offer Inside)

[Feedback request]
[Upgrade incentive: 20% off first 3 months]
[Personal consultation offer]
```

**Email #6: Success Stories (Day 10)**
```
Subject: How Cape Town Catering Reduced Admin Time by 60%

[Customer testimonial]
[Results achieved]
[Social proof]
```

**Email #7: Trial Reminder (Day 12)**
```
Subject: Your Trial Ends in 2 Days - Don't Lose Your Data!

[Gentle reminder]
[Upgrade benefits]
[Support offer]
```

**Email #8: Final Reminder (Day 14)**
```
Subject: Last Chance: Your CaterOS Trial Ends Tonight

[Urgency without pressure]
[One-click upgrade]
[Support contact]
```

---

## 6. IN-APP NOTIFICATIONS & TRIGGERS

### Achievement Notifications

**Triggered Events:**
```typescript
// When user completes key actions
events = {
  "first_lead_added": "🎉 Your first lead was just added!",
  "first_quote_created": "🚀 Congratulations on sending your first quote!",
  "first_booking": "📅 Your client just booked! Time to prepare.",
  "profile_complete": "✓ Profile completed! You're all set.",
  "team_member_invited": "👥 Team member invited successfully."
}
```

**Implementation:** `src/lib/notificationService.ts`

### Usage-Based Re-Engagement

**Trigger Rules:**
```typescript
if (daysSinceLastLogin > 7) {
  sendEmail({
    template: "we_miss_you",
    subject: "We miss you! Here's what you're missing..."
  });
}

if (daysSinceSignup > 14 && quoteCount === 0) {
  sendEmail({
    template: "help_with_quotes",
    subject: "Need help creating your first quote?",
    cta: "Schedule a call with our team"
  });
}

if (daysSinceSignup > 21 && !paymentGatewayConnected) {
  sendEmail({
    template: "connect_payments",
    subject: "Start accepting online payments in 5 minutes"
  });
}
```

---

## 7. TRIAL EXPIRATION & CONVERSION

### What Happens When Trial Ends (Day 14)

**If User Hasn't Upgraded:**
```sql
-- Automatic database update
UPDATE profiles
SET subscription_status = 'expired'
WHERE trial_ends_at <= NOW()
  AND subscription_status = 'trialing';
```

**Access Restrictions:**
- Can view existing data (read-only)
- Cannot create new quotes
- Cannot process new orders
- Banner message: "Your trial has expired. Upgrade to continue."

**Data Retention:**
- All data preserved for 30 days
- After 30 days, soft delete (is_active = false)
- After 90 days, hard delete (can be configured)

### When User Upgrades (Subscription Created)

**Database Updates:**
```sql
UPDATE profiles
SET 
  subscription_status = 'active',
  subscription_plan = 'professional',  -- or 'enterprise'
  trial_ends_at = NULL,
  subscription_started_at = NOW(),
  next_billing_date = NOW() + INTERVAL '1 month'
WHERE id = user_id;

INSERT INTO payments (
  user_id,
  amount,
  currency,
  status,
  payment_method,
  payment_gateway,
  transaction_id,
  subscription_id
) VALUES (...);
```

**Full Access Restored:**
- All features unlocked
- Multi-region capability enabled
- Priority support activated
- Advanced analytics available

**Welcome Email (Paid Customer):**
```
Subject: Welcome to the CaterOS Family! Here's What's Next

Thank you for trusting us with your business!

Your subscription details:
- Plan: Professional
- Billing: Monthly
- Next payment: [Date]

What's included:
✓ Unlimited quotes and orders
✓ Multi-region support
✓ Priority support
✓ Quarterly business reviews
✓ Advanced analytics

Your dedicated success manager: [Name]
Contact: [Email] | [Phone] | [WhatsApp]

Let's schedule your onboarding call: [Calendar link]
```

---

## 8. SUPPORT INFRASTRUCTURE

### Multi-Channel Support Available

**1. Email Support**
- Address: support@cateros.com
- Response time: 24 hours guaranteed
- Extended hours: Mon-Sat, 8am-8pm SAST

**2. Phone Support**
- Number: +27 83 652 5755
- Business hours support
- Emergency support for paid customers

**3. WhatsApp Support**
- Number: +27 83 652 5755
- Quick questions
- Screen sharing capability

**4. Knowledge Base**
- Help articles
- Video tutorials
- FAQ section
- Troubleshooting guides
- Location: `/blog` (SEO-optimized)

**5. In-App Help**
- Contextual tooltips
- Interactive tours
- Smart suggestions
- Feature documentation

---

## 9. TECHNICAL IMPLEMENTATION DETAILS

### Key Files & Components

**Authentication Flow:**
```
src/services/authService.ts         - Auth operations
src/contexts/AuthContext.tsx        - Auth state management
src/pages/auth/register.tsx         - Registration page
src/pages/auth/login.tsx            - Login page
```

**Onboarding System:**
```
src/services/onboardingService.ts              - Onboarding logic
src/components/OnboardingProgressTracker.tsx   - Progress UI
CUSTOMER_ONBOARDING_JOURNEY.md                 - Full documentation
```

**Demo Mode:**
```
src/contexts/DemoModeContext.tsx    - Demo state
src/components/DemoModeToggle.tsx   - UI controls
```

**Data Management:**
```
src/services/profileService.ts      - Profile CRUD
src/lib/mockData.ts                 - Sample data
src/lib/starterInventory.ts         - Starter items
```

### Database Schema (Supabase)

**Core Tables:**
```sql
-- Authentication (Supabase managed)
auth.users

-- User profiles
profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  company_name text,
  phone text,
  role text,
  currency text,
  subscription_status text,
  subscription_plan text,
  trial_ends_at timestamptz,
  is_active boolean
)

-- Additional tables created as needed:
- leads
- quotes
- orders
- inventory_items
- equipment_items
- driver_assignments
- regions
- email_templates
- payments
```

---

## 10. METRICS & TRACKING

### What We Track (For Improvement)

**User Behavior:**
- Time to first login after signup
- Time to profile completion
- Time to first quote created
- Time to first booking
- Feature adoption rates
- Page views and navigation patterns

**Business Metrics:**
- Trial signup rate
- Email verification rate
- Trial-to-paid conversion rate
- Churn rate (with reasons)
- Monthly Recurring Revenue (MRR)
- Customer Lifetime Value (LTV)

**Support Metrics:**
- Support ticket volume
- Ticket category distribution
- Resolution time
- Customer satisfaction (CSAT)
- Net Promoter Score (NPS)

**Engagement Metrics:**
- Daily active users (DAU)
- Weekly active users (WAU)
- Monthly active users (MAU)
- Feature usage frequency
- Average session duration

---

## 11. FUTURE ENHANCEMENTS (Roadmap)

### Phase 1: Immediate (Next Sprint)
- [ ] SMTP email integration (SendGrid or AWS SES)
- [ ] Automated welcome email sequence
- [ ] In-app notification system
- [ ] Usage analytics dashboard

### Phase 2: Near-Term (Next Month)
- [ ] Auto-create starter inventory on signup
- [ ] Auto-create email templates
- [ ] Interactive product tour
- [ ] Video tutorials embedded in-app

### Phase 3: Medium-Term (Next Quarter)
- [ ] AI-powered quote generation
- [ ] WhatsApp business integration
- [ ] Mobile app (React Native)
- [ ] Advanced analytics dashboard

### Phase 4: Long-Term (6-12 Months)
- [ ] Multi-language support
- [ ] API for third-party integrations
- [ ] White-label capability
- [ ] Franchise management system

---

## 12. QUALITY ASSURANCE & ONBOARDING OPTIMIZATION

### Continuous Improvement Process

**Monthly Review:**
1. Analyze signup funnel
2. Identify drop-off points
3. Survey recent signups
4. A/B test email sequences
5. Update onboarding flow

**Quarterly Deep-Dive:**
1. User interviews (5-10 recent customers)
2. Support ticket analysis
3. Feature request prioritization
4. Competitive analysis
5. Documentation updates

**Key Questions We Ask:**
- Where do users get stuck?
- What features are confusing?
- What's working really well?
- What would improve conversion?
- How can we reduce time-to-value?

---

## 13. SECURITY & COMPLIANCE

### Data Protection

**User Data Security:**
- Passwords hashed with bcrypt
- HTTPS everywhere
- Row-level security (RLS) in Supabase
- Regular security audits
- GDPR compliance ready

**Privacy:**
- Clear privacy policy (`/privacy`)
- Terms of service (`/terms`)
- Cookie consent management
- Data export capability
- Right to deletion

---

## SUMMARY: COMPLETE USER JOURNEY

```
Day 0:    Discovers CaterOS → Tries Demo Mode
Day 0:    Signs up → Immediate welcome email
Day 0:    First login → Sees onboarding tracker
Day 1:    Getting started guide email
Day 2:    Feature spotlight email #1
Day 4:    Feature spotlight email #2
Day 7:    Mid-trial check-in + upgrade offer
Day 10:   Success stories email
Day 12:   Trial ending reminder (2 days)
Day 14:   Final reminder (last chance)

Post-Trial:
- Subscription → Welcome to family email
- Week 2 → Success manager introduction
- Month 1 → Check-in call
- Quarterly → Business review
```

---

## CONTACT INFORMATION

**Company:** CaterOS (by Skylight Digital)  
**Address:** 17 Swalle Street, Golden Acre  
**Phone:** +27 83 652 5755  
**Email:** support@cateros.com  
**Website:** https://cateros.com

---

*This document is maintained by the CaterOS development team and updated regularly as the platform evolves.*

*Last Updated: October 12, 2025*
