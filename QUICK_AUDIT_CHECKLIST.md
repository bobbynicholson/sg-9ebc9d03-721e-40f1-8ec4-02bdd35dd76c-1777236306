<![CDATA[
# CateringMS Quick Audit Checklist

Use this for a rapid health check before detailed specialist audits.

## ✅ Technical Health (30 min)

### Database
- [ ] All RLS policies enabled on tables with sensitive data
- [ ] Foreign keys have indexes
- [ ] No orphaned records (broken relationships)
- [ ] Migrations apply cleanly
- [ ] company_id filtering on all multi-tenant queries

### Code Quality
- [ ] No TypeScript errors (`npm run type-check`)
- [ ] No ESLint errors (`npm run lint`)
- [ ] No console.errors in production code
- [ ] Environment variables properly typed
- [ ] Services use consistent error handling

### Performance
- [ ] No files > 500 lines (split into modules)
- [ ] Images optimized (WebP/Next Image)
- [ ] Database queries use select() with specific columns
- [ ] No N+1 query patterns
- [ ] API routes respond < 500ms

---

## ✅ Feature Completeness (2 hours)

Test as each role (use role switcher in Dev Mode):

### Super Admin
- [ ] View all companies
- [ ] Create new company
- [ ] Manage users across companies
- [ ] View financial reports

### Company Admin (hello@spitbraaidelivery.co.za)
- [ ] Create order
- [ ] Assign staff to order
- [ ] View dashboard with real data
- [ ] Generate invoice
- [ ] Track delivery

### Kitchen Staff (kitchen@spitbraaidelivery.co.za)
- [ ] Clock in/out
- [ ] View assigned orders
- [ ] Mark tasks complete
- [ ] Check inventory levels

### Driver (driver@spitbraaidelivery.co.za)
- [ ] View assigned deliveries
- [ ] Get "ready for pickup" notification (real-time)
- [ ] Update delivery status
- [ ] Complete delivery with photo

### Shopping Staff (shopping@spitbraaidelivery.co.za)
- [ ] View low stock alerts
- [ ] Create purchase order
- [ ] Receive inventory
- [ ] Manage suppliers

### Cleaning Staff (cleaning@spitbraaidelivery.co.za)
- [ ] View equipment assignments
- [ ] Report broken equipment
- [ ] Complete cleaning tasks
- [ ] Track equipment status

### Client (client@spitbraaidelivery.co.za)
- [ ] Place order
- [ ] Track delivery on map
- [ ] View invoices
- [ ] Make payment (test mode)

---

## ✅ Security (1 hour)

### Authentication
- [ ] Can't access /admin/* without login
- [ ] Can't access other company's data
- [ ] Session timeout works (30 min)
- [ ] Password reset flow works
- [ ] Super admin button only shows on localhost

### Authorization
- [ ] Driver can't access kitchen dashboard
- [ ] Kitchen can't access driver routes
- [ ] Client can't access admin panel
- [ ] User can't modify another user's profile

### Data Isolation
- [ ] Company A can't see Company B's orders
- [ ] RLS prevents cross-company data access
- [ ] API routes validate company_id
- [ ] File uploads scoped to company

---

## ✅ UI/UX (1 hour)

### Design Consistency
- [ ] Colors use design system tokens
- [ ] Fonts consistent (headings vs body)
- [ ] Spacing consistent (p-4, gap-4, etc.)
- [ ] Dark mode works on all pages

### Responsiveness
- [ ] Mobile: All pages work on 375px width
- [ ] Tablet: Navigation and tables adapt
- [ ] Desktop: No horizontal scroll on 1920px

### User Feedback
- [ ] Loading states show on all async actions
- [ ] Success toasts on save/update
- [ ] Error messages are clear
- [ ] Form validation shows helpful errors
- [ ] Empty states when no data

---

## ✅ Business Logic (1 hour)

### Order Workflow
- [ ] Order created → Kitchen gets notification
- [ ] Order marked ready → Driver gets notification
- [ ] Order delivered → Client gets confirmation email
- [ ] Order cancelled → All parties notified

### Inventory
- [ ] Low stock triggers alerts
- [ ] Recipe deduction works on order confirm
- [ ] Purchase order increases stock
- [ ] Stock can't go negative

### Payments
- [ ] Invoice generated on order confirm
- [ ] Payment processed via PayFast
- [ ] Payment confirmation updates order status
- [ ] Partial payments tracked

### Notifications
- [ ] Real-time notifications work (Supabase Realtime)
- [ ] Email notifications queue correctly
- [ ] Notification preferences respected
- [ ] Unread count updates

---

## ✅ Production Readiness (30 min)

### Environment
- [ ] All env vars set in Vercel
- [ ] RESEND_API_KEY or SMTP configured
- [ ] Supabase project connected
- [ ] PayFast credentials (test mode works)

### Error Handling
- [ ] 404 page exists
- [ ] 500 error page exists
- [ ] API errors return JSON
- [ ] Database errors caught and logged

### Performance
- [ ] Lighthouse score > 80
- [ ] First Contentful Paint < 2s
- [ ] Time to Interactive < 4s
- [ ] No memory leaks (test with 100 rapid navigations)

### Documentation
- [ ] README has setup instructions
- [ ] Environment variables documented
- [ ] Test credentials provided
- [ ] API endpoints documented

---

## 🚨 Critical Issues (Blockers)

If any of these fail, DO NOT go to production:
- [ ] Users can access other company's data
- [ ] Payment processing creates duplicate charges
- [ ] RLS policies allow unauthorized access
- [ ] App crashes on core workflow (order creation)
- [ ] No error handling on critical operations

---

## 📊 Health Score

Count your checkmarks:
- **80-100%** = Production Ready ✅
- **60-79%** = Needs work, not ready ⚠️
- **<60%** = Significant issues, major work needed ❌

---

**Next Steps After Quick Audit:**
1. Fix critical issues immediately
2. Document all findings
3. Proceed with detailed specialist audits (COMPLETE_AUDIT_FRAMEWORK.md)
4. Create prioritized action plan

**Audit Date:** _______________  
**Auditor:** _______________  
**Score:** _____ / 100  
**Status:** [ ] Ready [ ] Needs Work [ ] Not Ready
```

</CDATA[>

[Tool result trimmed: kept first 100 chars and last 100 chars of 5706 chars.]