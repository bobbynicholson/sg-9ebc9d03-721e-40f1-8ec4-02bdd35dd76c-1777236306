# CateringMS megaprogramme Phase 9 (Skylight tenant health) closeout

**Date:** 2026-05-07
**Branch:** `phase-9-skylight/megaprogramme-2026-05` (off `phase-8-xero/megaprogramme-2026-05`)
**Audit doc:** [docs/audits/megaprogramme-2026-05.md](megaprogramme-2026-05.md)
**Prior closeouts:** phases [1](megaprogramme-2026-05-phase-1.md) · [2](megaprogramme-2026-05-phase-2.md) · [3](megaprogramme-2026-05-phase-3.md) · [4](megaprogramme-2026-05-phase-4.md) · [5 arch](megaprogramme-2026-05-phase-5-arch.md) · [6 ui](megaprogramme-2026-05-phase-6-ui.md) · [7 driver](megaprogramme-2026-05-phase-7-driver.md) · [8 xero](megaprogramme-2026-05-phase-8-xero.md)

## Disposition summary

Fifth of the six character-grouped follow-up PRs queued in the Phase
4 closeout. Skylight tenant health: a new super-admin dashboard +
the middleware perf fix that pairs with it.

- **2 items shipped**
- **0 deferred**

## What landed in Phase 9

| ID | Title | Commit |
|---|---|---|
| P2-15 | Signed-cookie cache for middleware profile fetch | `9afe16c` |
| P1-32 | Tenant Health dashboard for Skylight super-admin | `1f29d56` |

2 commits.

## P2-15 -- middleware profile cache

The middleware ran two DB queries on every authenticated request:
`profiles.select("role, company_id")` and
`companies.select("slug, onboarding_completed_at")`. The tenant-slug
validator ran a third one against `companies.select("slug")` to check
ownership.

New `src/lib/middleware/profileCache.ts` issues a short-lived
HMAC-signed cookie (5-minute TTL) carrying `{ uid, role, company_id,
slug, onboarding_completed_at }`. Middleware reads the cookie first;
on hit it skips all three DB queries. On miss it runs the original
queries and writes a fresh cookie at the end of the response.

Security:
- HMAC-SHA256 with `MIDDLEWARE_PROFILE_SECRET` env var (deployment
  secret, never sent to the browser)
- `uid` field tied to current `user.id` -- a stolen cookie can't
  replay across sessions because the JWT side still revalidates
- `exp` field; expired cookies fall through to a fresh fetch
- HttpOnly + SameSite=Lax + Secure (in prod)
- 5-minute TTL means role / slug / onboarding state changes
  propagate within 5 min; tenant state doesn't lag forever

Tenant-slug validation logic now compares the request's slug
against the cached `userCompanySlug` directly instead of running a
third query.

The `MIDDLEWARE_PROFILE_SECRET` env var is the only deployment
prerequisite. If unset, the cache silently no-ops and the middleware
falls back to the original behaviour -- so this PR is safe to ship
even before secrets land in the Vercel project.

## P1-32 -- Tenant Health dashboard

New page at `/admin/platform/tenant-health` (super-admin only via
ProtectedRoute) surfacing four health buckets Skylight ops can
action immediately:

1. **Stuck onboarding** -- tenants signed up >7 days ago with
   `onboarding_completed_at` still null
2. **Dormant tenants** -- onboarded tenants whose latest
   `orders.event_date` is >30 days ago (or who have never had one)
3. **No payment gateway** -- onboarded tenants with no active
   `payment_gateways` row, so they can't take online payments
4. **New signups (last 7 days)** -- companies created recently,
   to watch which ones haven't started onboarding yet

Each bucket renders the count as a `MetricCard` plus a sortable
list, with row click-through to the per-tenant company-database
page. EmptyState primitive used for "nobody stuck right now"
branches so the dashboard feels finished even on a clean week.

Read-only by design. Actions belong on the per-tenant pages this
links to (company-database, trial-management, etc.) so this stays
focused on triage.

Wired into PlatformNav under the Tenants section between Trials
and the existing platform tools.

## What's still deferred

Nothing from this group.

## What's next

One character-grouped PR group left from the Phase 4 closeout:

1. ~~Architecture cleanup~~ done in Phase 5
2. ~~UI consistency sweep~~ done in Phase 6
3. ~~Driver fleet~~ done in Phase 7
4. ~~Xero / accounting~~ done in Phase 8
5. ~~Skylight tenant health~~ done in Phase 9 (this PR)
6. Polish trickle (P1-23 / P2-01 / P2-04 -- P2-04 already shipped in Phase 6, so just P1-23 + P2-01)

Plus the deferrals: P1-29 (form sweep), the cleaning dashboard
MetricCard upgrade, P2-13 file splits, the P2-10 ts-nocheck
remainder.

## Verification

`npx tsc --noEmit` clean after every commit. `npx next build`
end-of-phase reports compile success and a clean prerender pass.
Pre-push hook ran tsc on each push (passed).

## Operator follow-up

- Set `MIDDLEWARE_PROFILE_SECRET` in the Vercel project secrets
  before this branch reaches production, otherwise the cache
  no-ops and you don't get the perf win (no functional regression
  either way). Generate via `openssl rand -hex 32` or any
  64-char random string.
