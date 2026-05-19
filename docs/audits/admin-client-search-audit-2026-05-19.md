# `/admin/client-search` (Client Search) audit (2026-05-19)

**Scope:** Tenth page of the admin per-page audit programme. Sixth
and last in the Pipeline group. Linked from AdminNav as "Client
search".

**File:** `src/pages/admin/client-search.tsx` (366 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **Header** - back-to-dashboard, title, search input.
2. **Filter** - region select.
3. **Results** - one card per client with name, email, phone,
   company type, region, and quick-action buttons (View / Quote /
   Invoices / Orders).

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| CS-1 | Line 22: `allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}` - **duplicate COMPANY_ADMIN** in the role array. Likely a copy-paste typo. | P3 |
| CS-2 | No `@ts-nocheck`. ✓ | none |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| CS-3 | Query: `clients` table directly (line 69+). Matches CTS contacts page using the same canonical source. ✓ | none |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| CS-4 | No realtime sub on `clients`. New client added in another tab doesn't appear until refresh. Low impact (clients table is mostly stable; new clients land slowly via lead conversion). | P3 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| CS-5 | sales_admin + region_admin missing from allowedRoles. Same omission pattern as PKG-7 / QTS-8 / etc. Critical for sales workflows (client lookup pre-quote). | P2 |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| CS-6 | Phone numbers + email addresses are plain text - no `tel:` / `mailto:` links (lines 289-300). Same pattern as LDS-8 / CTS-8. | P3 |
| CS-7 | No "create new client" CTA. The page is read-only - to add a client the operator goes to /admin/contacts. Could be a low-friction shortcut here. | P3 |

### B.6 Performance

| # | Finding | Severity |
|---|---|---|
| CS-8 | Loads all clients into memory then fuzzy-filters client-side. Same pattern as CTS-4 / QTS-14. Defer until tenant scale demands it. | P3 |

---

## C. Priority fix list

**P0** (safety): none.

**P1** (UX critical): none.

**P2** (data integrity + role coverage):
- CS-5: Admit sales_admin + region_admin
- CS-1: Fix the duplicate COMPANY_ADMIN typo (bundled with CS-5)

**P3** (polish):
- CS-4: Realtime sub on clients
- CS-6: tel: / mailto: links
- CS-7: New-client CTA
- CS-8: Server-side filter (deferred)

---

## D. First-wave PRs

| PR | Title |
|---|---|
| CS-A | Fix duplicate role typo + admit sales_admin / region_admin + tel: / mailto: links (CS-1 + CS-5 + CS-6 batch) |
| CS-B | Realtime sub + new-client CTA (CS-4 + CS-7) |
| CS-C | Server-side filter (CS-8 - deferred) |

This push ships CS-A.
