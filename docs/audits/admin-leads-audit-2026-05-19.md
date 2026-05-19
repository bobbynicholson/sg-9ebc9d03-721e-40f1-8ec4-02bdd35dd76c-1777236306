# `/admin/leads` (Leads) audit (2026-05-19)

**Scope:** Sixth page of the admin per-page audit programme. Second
page of the Pipeline group. Linked from AdminNav as "Leads"
(Pipeline group); routes to `/admin/leads`.

**Files:** `src/pages/admin/leads/index.tsx` (1,794 lines) +
`src/pages/admin/leads/new.tsx` (461 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **Header** - title, KPI strip (new, qualified, quoted, won, lost
   counts), refresh.
2. **Filter bar** - source, status, age range, search.
3. **Leads table** - per row: name, contact info, source, status,
   suggested next action, age, linked quote / order.
4. **Per-row actions** - send a quote, mark won / lost, edit details.
5. **Bulk** - none currently.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| LDS-1 | No `@ts-nocheck` - file is type-checked. ✓ | none |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| LDS-4 | Lead status pipeline (new -> qualified -> quoted -> won/lost) is computed client-side from `lead.status` + linked-quote status + linked-order status + age. No server-enforced state machine. Mostly fine but a malformed transition can land. | P2 |
| LDS-5 | Both /admin/leads and /admin/contacts query overlapping universes (leads = subset of the contact universe). When a lead converts, both pages must be aware independently. Risk of divergence on mid-fan-out failure. | P2 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| LDS-2 | No supabase realtime sub on `leads` / `quotes`. Page only refreshes on mount + manual refresh + window focus. When a quote is sent from /admin/quotes the lead row's "quoted" suggestion stays stale. Same gap as CTS-2 / CAL-2. | **P1** |
| LDS-11 | Quote acceptance from /admin/quotes/new doesn't emit a "lead-updated" event. Even with realtime sub, the cleaner pattern is an explicit event after the cross-page mutation. | P2 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| LDS-10 | ProtectedRoute gates to [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. sales_admin can't reach their own primary CRM surface. Same omission as CAL-4 / CTS-5. | P2 |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| LDS-6 | No bulk reassign of leads ("assign next 5 new leads to sales_admin #2"). Dispatch has bulk-driver-assign; leads should have bulk-rep-assign. | P2 |
| LDS-7 | `source` is captured (10 options - manual_add / website / referral / instagram / facebook / google_search / repeat_client / phone_enquiry / walk_in / other) but no surface shows conversion rate by source. Dashboard's LeadAging widget doesn't slice by source. | P3 |
| LDS-8 | Phone numbers rendered as plain text - no tap-to-call. Same pattern as LO-15 / CTS-8. | P3 |
| LDS-9 | No print "today's call list" - sales admin opens at active status and wants paper checklist. Same pattern as DI-B / LO-B. | P3 |

### B.6 Performance

| # | Finding | Severity |
|---|---|---|
| LDS-3 | `leadService.getLeads(companyId)` returns every lead with no date/status filter. Client-side fuzzy search runs against the full array. Scales poorly on tenants with 1,000+ leads. | P2 |

---

## C. Priority fix list

**P0** (safety): none.

**P1** (UX critical):
- LDS-2: Realtime sub on leads + quotes + orders so cross-tab edits land

**P2** (data integrity + role coverage):
- LDS-10: Add sales_admin to allowedRoles
- LDS-11: Emit cateringms:lead-updated after quote acceptance
- LDS-3: Server-side pagination + filter
- LDS-4: Server-enforced state machine (or at minimum a derived view)
- LDS-5: Single contact-record service (consolidate /admin/leads + /admin/contacts data layer)
- LDS-6: Bulk reassign of leads

**P3** (polish):
- LDS-7: Lead-source analytics
- LDS-8: tel: links on phones
- LDS-9: Print today's call list

---

## D. First-wave PRs

| PR | Title |
|---|---|
| LDS-A | Realtime sub + sales_admin role + tap-to-call (LDS-2 + LDS-10 + LDS-8 batch) |
| LDS-B | Bulk reassign + print call list (LDS-6 + LDS-9 batch) |
| LDS-C | Server-side pagination + filter (LDS-3 - separate, bigger) |
| LDS-D | Cross-page lead-updated event (LDS-11) |
| LDS-E | Lead-source analytics on dashboard (LDS-7) |

This push ships LDS-A. LDS-B through LDS-E land in subsequent PRs.
