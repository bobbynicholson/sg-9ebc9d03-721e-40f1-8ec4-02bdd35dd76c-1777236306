# Role-Based Navigation & URL Structure Guide

## 🎯 Complete URL Structure (Post-Refactor)

### Platform Owner (Super Admin)
- `/cateringms-platform/*` - 8 pages

### Company Admin
- `/admin/*` - 24 pages

### Team Portal (Internal Staff)
- `/team-portal/kitchen/dashboard` - Kitchen Staff
- `/team-portal/driver/dashboard` - Drivers
- `/team-portal/shopping/dashboard` - Shopping Staff
- `/team-portal/cleaning/dashboard` - Cleaning Staff
- `/team-portal/general/job-progress` - General Staff

### Client Portal (External Customers)
- `/client-portal/dashboard` - Main dashboard
- `/client-portal/my-orders` - Order history

### Public Pages
- `/` - Homepage
- `/features`, `/pricing`, `/contact` - Marketing
- `/auth/login`, `/auth/register` - Authentication

---

## 🔐 Role-Based Access Control

### Header Component (`src/components/Header.tsx`)
```typescript
const getRoleBasedDashboard = () => {
  switch (role) {
    case "admin": return "/admin/dashboard";
    case "driver": return "/team-portal/driver/dashboard";
    case "kitchen": return "/team-portal/kitchen/dashboard";
    case "shopping": return "/team-portal/shopping/dashboard";
    case "cleaning": return "/team-portal/cleaning/dashboard";
    case "staff": return "/team-portal/general/job-progress";
    case "client": return "/client-portal/dashboard";
    default: return "/";
  }
};
```

### Navigation Components
Each role has its own nav component:
- `AdminNav.tsx` - Admin portal nav
- `KitchenNav.tsx` - Kitchen portal nav
- `DriverNav.tsx` - Driver portal nav
- `ShoppingNav.tsx` - Shopping portal nav
- `CleaningNav.tsx` - Cleaning portal nav
- `ClientNav.tsx` - Client portal nav

All updated to point to new `/team-portal/` and `/client-portal/` paths.

---

## 🎨 Visual Design Per Role

### Team Portal Gradients:
- **Kitchen:** Orange → Red (`from-orange-500 to-red-500`)
- **Driver:** Blue → Indigo (`from-blue-500 to-indigo-500`)
- **Shopping:** Green → Emerald (`from-green-500 to-emerald-500`)
- **Cleaning:** Cyan → Blue (`from-cyan-500 to-blue-500`)

### Client Portal Gradient:
- **Client:** Blue → Cyan (`from-blue-500 to-cyan-500`)

### Admin Portal Gradient:
- **Admin:** Purple → Pink (`from-purple-500 to-pink-500`)

---

## 🤖 AI Chatbot Integration

Every dashboard now includes the AI chatbot:
```tsx
<ChatBot userRole="kitchen" companyId={user?.user_metadata?.company_id} />
```

Role-specific example questions showcase intelligent data access.

---

## 📊 Future Scalability

Easy to add new portal types:
- `/vendor-portal/*` - Supplier access
- `/partner-portal/*` - Partner/affiliate access
- `/franchise-portal/*` - Franchise management
- `/team-portal/event-coordinator/*` - New staff roles

---

## ✅ Testing Checklist

- [x] All team portal pages accessible at new URLs
- [x] All client portal pages accessible at new URLs
- [x] Navigation components link correctly
- [x] Role-based redirects work
- [x] Authentication guards active
- [x] Chatbot present on all portals
- [x] Old directories cleaned up
- [x] Server restarted and running

---

## 🚀 Production Ready

The new URL structure is:
✅ Semantically clear
✅ Future-proof
✅ Following SaaS best practices
✅ Self-documenting
✅ Scalable for growth