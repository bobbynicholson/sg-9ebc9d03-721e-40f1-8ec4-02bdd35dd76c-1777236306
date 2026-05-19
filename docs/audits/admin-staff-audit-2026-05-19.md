# `/admin/staff` (Staff hub) audit (2026-05-19)

**Scope:** 22nd page of the admin per-page audit programme. Seventh
in Money group.

**Files:**
- `src/pages/admin/staff.tsx` (re-export of kitchen-staff.tsx)
- `src/pages/admin/kitchen-staff.tsx` (real implementation)

The staff route is a 15-line re-export of the kitchen-staff page.
All audit findings apply to kitchen-staff.tsx as the canonical file.

---

## B. Findings

| # | Finding | Severity |
|---|---|---|
| STA-1 | `as any` casts on profile/supabase payloads (lines 144, 207, 275). No `@ts-nocheck`. Light type-safety debt. | P2 |
| STA-2 | ProtectedRoute on kitchen-staff line 387 = `[ADMIN, SUPER_ADMIN]`. **Missing COMPANY_ADMIN**. Same omission as ORD-6 pre-fix; should follow the admin trio. | **P1** |
| STA-3 | Portal invite flow (handleSendInvite, line 311) doesn't surface a copy-to-clipboard for the invite URL post-send. Minor UX gap. | P3 |

---

## C. First-wave PRs

| PR | Title |
|---|---|
| STA-A | Admit COMPANY_ADMIN to kitchen-staff ProtectedRoute (STA-2, P1) |
| STA-B | Type-safety pass + invite-URL clipboard (STA-1 + STA-3) |
