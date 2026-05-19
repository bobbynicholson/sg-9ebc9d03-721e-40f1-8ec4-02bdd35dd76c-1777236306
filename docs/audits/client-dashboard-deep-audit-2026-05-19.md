# `/client-portal/dashboard` (Client portal dashboard) - deep audit (2026-05-19)

**Scope:** Replaces the earlier shallow `client-dashboard-audit-2026-05-19.md`
(8 cursory items). Deep pass per Bobby's "1000 hours per page" brief.

The dashboard a paying client of the catering tenant sees - first surface
they hit after logging in. The whole point: "where is my order right now,
and is anything waiting on me".

**Test tenant:** Spit Braai Delivery.

**File:** `src/pages/client-portal/dashboard.tsx` (1,381 lines).

**Siblings cross-checked:** `billing`, `my-orders`, `notifications`, `profile`,
`quotes`, `tracking`.

---

## A. What's on the page

1. NoIndexMeta + Head
2. ClientNav (slug-aware)
3. Branded header strip - logo, company name, greeting, event-count pill, "Rate a recent event" pill
4. Pending quotes hero band - up to 3 quote cards with Open+Accept / Request Changes
5. Rebook hero card (surfaces when there's a completed order)
6. Hero next-event card (loading / empty / live tracking / countdown variants)
7. Quick actions 2x2/4-up grid - Live tracking / Invoice / Note for chef / Contact us
8. Past events horizontal-scroll strip - up to 8 cards with inline rating + Rebook
9. RebookDialog + RequestEditsDialog modals
10. ChatBot
11. Background side-effects - orders + realtime sub; driver GPS polling every 30s

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| CLI-1 | No `@ts-nocheck` but blanket eslint-disables; 11 `as any` casts in loader + GPS poller. | P2 | 1-2, 243-554 |
| CLI-2 | 1,373 lines; HeroCard sub-component is 169 lines; two large IIFEs for pending-quotes + rebook hero. | P2 | 657-1373 |
| CLI-3 | **No ProtectedRoute / allowedRoles wrapper.** | **P1** | 580-1018 |
| CLI-4 | Inline `PortalQuote` type inside the component body. | P3 | 275-286 |
| CLI-5 | `useAuth() as any` discards typed contract. | P2 | 243 |
| CLI-6 | 8 `console.error` sites, one silent swallow, no central error reporting. | P3 | 367-557 |
| CLI-7 | Pending-quotes + rebook IIFEs recompute on every render. | P3 | 657-825 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| CLI-8 | **`last_updated` always undefined.** Select pulls `updated_at`; code reads `(pin as any).timestamp`. Dead-bug; "Last updated 2 min ago" UI silently renders wrong. | **P1** | 527, 553 |
| CLI-9 | **`pickHeadlineEvent` excludes `delivered` from being the headline.** Driver POD save flips status to delivered → page jumps to a DIFFERENT upcoming event → the "Delivered, thanks" celebration the smart-copy mapper expects is unreachable as a headline. | **P1** | 155-182, 212-214 |
| CLI-10 | **Two different "client-id" lookups across dashboard / billing / tracking.** Inconsistent email-OR fallback - bills booked under the email pre-signup are invisible on /billing while corresponding orders ARE visible on /dashboard. | **P1** | 361-405; billing 134; tracking 111 |
| CLI-11 | `clients[0]` taken as "most recent" but query has no `.order()`. Tenant client name flickers between historical rows on reload. | P2 | 375-378 |
| CLI-12 | `delivery_feedback` insert duplicate-unsafe across two tabs. | P2 | 930-937 |
| CLI-13 | Quote totals fall through `q.total ?? q.total_amount ?? 0` - two columns, no canonical pick. | P2 | 700 |
| CLI-14 | **No date window on orders query.** Full client lifetime pulled into React state every load. | **P1** | 380-385 |
| CLI-15 | Past-events query is over-broad; JS slice instead of server LIMIT. | P2 | 569-576 |

### B.3 Chain reactions

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| CLI-16 | **No listener for `cateringms:order-updated`.** Bus is wired across admin/driver/kitchen but client portal listens only to postgres realtime. Same-browser in another tab actions don't propagate via realtime cleanly. | **P1** | (missing) |
| CLI-17 | KIT2-29 / PR #126 verified - kitchen Mark ready flips client status badge via realtime. ✓ | none | 482-496 |
| CLI-18 | **DRV-E / PR #118 partially broken at the client end** because pickHeadlineEvent excludes delivered (CLI-9). The status flip lands but the celebration headline is unreachable. | **P1** | 156-181, 482-496 |
| CLI-19 | No realtime sub on `payments` or `invoices`. Admin "Mark paid" doesn't show on /dashboard's "Invoice" tile until reload. | P2 | (missing) |
| CLI-20 | No realtime sub on `quotes` or `delivery_feedback`. New quote = no pending-quotes band until reload. | P2 | (missing) |
| CLI-21 | Orders realtime sub refetches the ENTIRE dataset on every change. Should debounce or diff. | P2 | 482-496 |
| CLI-22 | GPS polling every 30s + a postgres realtime sub - two parallel update channels. | P3 | 514-566 |
| CLI-23 | `RequestEditsDialog` optimistically flips local status to `revised` without refetching from source. | P3 | 999-1013 |

### B.4 Role / visibility + security

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| CLI-24 | Realtime channel correctly scoped by `company_id` + `user.id`. ✓ | none | 482-496 |
| CLI-25 | Orders query correctly client-scoped + RLS-backstopped. ✓ | none | 361-405 |
| CLI-26 | `client_email.ilike.${user.email}` unescaped - `%` / `_` in email would over-match. Edge case. | P3 | 393, 459 |
| CLI-27 | Driver profile fetch by `profiles.id` - RLS spot-check needed: should a client only read driver phone for drivers assigned to their orders. | P2 | 537-541 |
| CLI-28 | No admin-only field leakage. ✓ | none | 382-384, 445-446 |
| CLI-29 | `firstName` resolution falls through to global `profile.full_name` which is wrong-tenant. | P2 | 329-332 |
| CLI-30 | No PII access logging on driver phone tap-to-call. | P2 | 1057-1063 |
| CLI-31 | "Contact us" tile has no fallback when both phone + email null - dead link. | P3 | 884 |

### B.5 Cross-dashboard placement

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| CLI-32 | **No "Outstanding balance" tile.** Client has to navigate to /billing to find money owed. | **P1** | (missing) |
| CLI-33 | **No notifications unread badge in the header.** | **P1** | 605-647 |
| CLI-34 | Past-events strip (8 cards) is /my-orders-page-sized content on the dashboard. | P2 | 892-962 |
| CLI-35 | "Note for chef" tile uses `?focus=` query param - verify /my-orders honours it. | P2 | 878 |
| CLI-36 | No /my-orders mini-summary aggregator on the dashboard. | P2 | (missing) |
| CLI-37 | No equipment / dietary recap on the hero card. | P2 | 1178-1187 |

### B.6 UX / UI (low-frequency user; 5-second answer test)

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| CLI-38 | Single spinner card loading state; no skeleton placeholders. | P2 | 828-834 |
| CLI-39 | **Branded gradient header uses `text-white` with no contrast check.** Tenant with cream / yellow brand = invisible text. | **P1** | 605-608, 1240-1250 |
| CLI-40 | Inline gradient strings everywhere instead of CSS variables. | P3 | 605, 672, 786 |
| CLI-41 | "Rate a recent event" pill scrolls to `#past-events` even when section doesn't render. | P2 | 632-644 |
| CLI-42 | `scrollIntoView` ignores `prefers-reduced-motion`. | P3 | 638 |
| CLI-43 | **Past-event rating stars are 14px (sub-44px tap target).** | **P1** | 1310-1356 |
| CLI-44 | Action tile arrow uses `group-hover` which doesn't fire on touch. | P3 | 1250 |
| CLI-45 | Hero card header flex crowds on 360px. | P2 | 1050-1065 |
| CLI-46 | Smart copy uses hardcoded "lekker" - SA-specific. | P2 | 213 |
| CLI-47 | Countdown chip hides at >30 days while smart-copy duplicates the same info. | P3 | 1133-1139 |
| CLI-48 | No print-friendly event briefing. | P2 | (missing) |
| CLI-49 | Pending-quotes "Open + accept" opens new tab - inconsistent with rest of portal. | P3 | 735-742 |
| CLI-50 | No dark-mode treatment on branded header. | P3 | 598, 605 |

### B.7 Performance

| # | Finding | Severity | Line(s) |
|---|---|---|---|
| CLI-51 | **5 sequential supabase queries on initial load.** Should `Promise.all`. | **P1** | 361-465 |
| CLI-52 | **CLI-14 + CLI-21 compound** - full-lifetime orders re-fetched on every realtime event. | **P1** | 380, 482 |
| CLI-53 | Driver-pin polling every 30s fetches profiles row every tick. | P2 | 514-566 |
| CLI-54 | `timeUntil` called twice per render. | P3 | 1040, 1043 |
| CLI-55 | ChatBot mounts unconditionally. | P3 | 1015 |

### B.8 Missing features

| # | Finding | Severity |
|---|---|---|
| CLI-56 | **PDF download of invoice from dashboard.** | **P1** |
| CLI-57 | **Add-to-calendar (ICS) for next event.** | **P1** |
| CLI-58 | **In-app message thread to caterer per order.** | **P1** |
| CLI-59 | Re-order shortcut from the next-event hero. | P2 |
| CLI-60 | Driver arrival notification opt-in toggle. | P2 |
| CLI-61 | **Pay deposit / outstanding from dashboard.** | **P1** |
| CLI-62 | "Share my event" magic link for +1. | P3 |
| CLI-63 | Document hub (signed contract, dietary form). | P2 |
| CLI-64 | Tipping / gratuity surface post-delivery. | P3 |

---

## C. Priority fix list

**P0**: none. Closest = CLI-3 graded P1 because RLS backstops.

**P1**: CLI-3, 8, 9 / 18, 10, 14, 16, 32, 33, 39, 43, 51, 52, 56, 57, 58, 61

**P2 / P3**: see findings tables.

---

## D. First-wave PRs

| PR | Title |
|---|---|
| CLI-A | ProtectedRoute wrapper + dead `last_updated` field fix (CLI-3 + CLI-8) |
| CLI-B | Unify client-id lookup into `useTenantClientIds` hook (CLI-10) |
| CLI-C | Server-side date window + parallelised loads (CLI-14 + CLI-15 + CLI-51 + CLI-52) |
| CLI-D | Listen to `cateringms:order-updated` bus + scoped realtime refetch (CLI-16 + CLI-21) |
| CLI-E | Headline picker includes delivered with 24h celebration window (CLI-9 + CLI-18) |
| CLI-F | Outstanding-balance tile + one-tap Pay + invoices realtime (CLI-32 + CLI-61 + CLI-19) |
| CLI-G | Notifications unread badge + quotes realtime (CLI-33 + CLI-20) |
| CLI-H | Brand-colour contrast helper + 44px stars (CLI-39 + CLI-43) |
| CLI-I | PDF receipt download + add-to-calendar ICS (CLI-56 + CLI-57) |
| CLI-J | Per-order in-app message thread (CLI-58) |

---

## E. Cross-page chain-reaction verification list

1. Kitchen Mark ready (KIT2-29 / PR #126): ✓ via realtime
2. Driver POD save (DRV-E / PR #118): half-broken at headline picker (CLI-9)
3. Admin mark invoice paid: ✗ no realtime / no bus
4. Admin send quote: ✗ no realtime / no bus
5. Admin reassign driver: ✓ via realtime
6. Admin pause/resume: ✓ via realtime

Net: PRs CLI-D + CLI-E + CLI-F + CLI-G close the chain.

---

## F. Tenant scoping + RLS (re-verification of CLI-7 shallow)

1. Channel name includes user.id + tenantCompanyId ✓
2. Server-side filter `company_id=eq.${tenantCompanyId}` ✓
3. RLS on orders validated earlier audits ✓
4. Cross-tenant containment via `eq("user_id", X).eq("company_id", Y)` ✓

Verified correct.

---

**Sign-off:** 64 numbered findings. P1 = 14 items. First-wave PRs = 10.
The dashboard is visually polished but is currently "browse-and-reload"
rather than "your order changed, the page knows" - the chain-reaction
fixes (CLI-D / CLI-E / CLI-F / CLI-G) plus the latent bugs
(CLI-8 / CLI-9 / CLI-14) are the difference. This PR ships CLI-A
(ProtectedRoute + the dead `last_updated` field fix).
