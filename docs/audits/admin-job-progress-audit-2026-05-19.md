# `/admin/job-progress-overview` audit (2026-05-19)

**Scope:** 14th page of the admin per-page audit programme. Fourth
in Operations group. Linked from AdminNav as "Job progress" -
"Cross-team progress on today's jobs".

**File:** `src/pages/admin/job-progress-overview.tsx` (10 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. Current state

The file is a 10-line stub that redirects to `/admin/orders`. No
real page exists. AdminNav advertises a "Cross-team progress on
today's jobs" surface that doesn't render.

---

## B. Findings

| # | Finding | Severity |
|---|---|---|
| JPO-1 | Stub-only redirect. Either delete the route + nav entry OR implement the promised surface (timeline of today's jobs with kitchen prep % / dispatch state / driver location all in one column-per-job table). | **P0** |

---

## C. Decision

Two reasonable options:
1. **Implement** - lift the per-status counts from /admin/dashboard's
   StatusBreakdown + the in-flight orders from /admin/tracking into
   one composed view. Roughly half a day of work.
2. **Remove** - drop the file + the AdminNav entry. The same info
   lives on /admin/dashboard's StatusBreakdown + /admin/tracking.

Defer the decision until product / Bobby weighs in. The stub is
harmless (it redirects) but the nav lying to the user is not great.

---

## D. First-wave PRs

| PR | Title |
|---|---|
| JPO-A | Decide: implement or remove the nav entry (P0) |

This audit doc captures the finding; no fix in this push.
