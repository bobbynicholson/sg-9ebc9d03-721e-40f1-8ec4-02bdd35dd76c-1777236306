# CateringMS End-to-End Testing Links & Runbook

Last updated: 2026-07-04. All links point at live production (cateringms.com).

## Test email convention

Use **rajm267747@gmail.com** for everything. For extra accounts use Gmail
plus-addressing - all of these land in the same inbox:

- `rajm267747+owner@gmail.com` (new company owner signup)
- `rajm267747+client@gmail.com` (test client)
- `rajm267747+chef@gmail.com`, `rajm267747+driver@gmail.com` (staff invites)

Never use ncpncpmedia@gmail.com on this platform.

## Option A - full journey as a NEW company (recommended for e2e)

Tests the platform from its true beginning (onboarding) without touching
Spit Braai's live data.

1. **Sign up a new company**: <https://cateringms.com/company-signup>
   (use `rajm267747+owner@gmail.com`; confirm via the Supabase auth email)
2. Onboarding: company profile, region, menu items, equipment
3. Invite staff (kitchen / driver / cleaning) - tests the invite emails
4. Build a lead form: Admin -> Integrations -> Embed -> create from template
   -> "Get snippet" gives the embed code + shareable link (this company gets
   its OWN token, different from Spit Braai's)
5. Submit the form as a visitor -> lead appears in Admin -> Leads
6. Lead -> Quote -> send -> accept via the emailed link -> deposit (PayFast
   sandbox) -> Order
7. Kitchen: prep tasks -> sign handover to driver
8. Driver: checklist -> En-route -> At kitchen -> Departed -> Arrived ->
   **Capture POD on "Setup completed"** -> delivered
9. Balance invoice -> payment -> receipt; client tracking + feedback
10. Collection trip -> equipment back -> cleaning queue

## Option B - test inside Spit Braai (existing tenant)

**Do NOT delete Spit Braai's clients (132) or leads - that is Callum's real
data.** Test data created here can be stripped later with
`node scripts/fresh-start-cleanup.mjs` (keeps clients/leads/catalogue).

### Lead-capture form links (Spit Braai's token) - REAL, submitting forms

Hosted at /embed/form.html - real configured fields, real lead creation:

- Quick Card:
  <https://cateringms.com/embed/form.html?token=e877e365-d5b7-4839-b386-d5253f0c1141&slug=quick-card-3gg6>
- Detailed Multi-Step:
  <https://cateringms.com/embed/form.html?token=e877e365-d5b7-4839-b386-d5253f0c1141&slug=detailed-multi-step-qbvs>
- Pricing Calculator (live estimate from real tiers Essential/Classic/Premium):
  <https://cateringms.com/embed/form.html?token=e877e365-d5b7-4839-b386-d5253f0c1141&slug=pricing-calculator-gozm>

NOTE: /embed/demo.html is the ADMIN PREVIEW - it renders placeholder
fields and never submits. Only form.html (or the snippet on a real
website) creates leads.

Forms are managed at Admin -> Integrations -> Embed (snippet for any
website, per-form view/submission stats, token rotation, pricing tiers).

### Open all portals logged in (one window per user)

```
node scripts/open-test-login.mjs --all
```

Covers: super-admin, company-admin, admin, kitchen staff + manager, driver,
shopping, cleaning staff + manager, client. Single user: pass its name
(e.g. `node scripts/open-test-login.mjs driver`).

### Automated page sweep (all 9 roles, 78 pages)

```
node scripts/all-users-verify.mjs --base https://cateringms.com
```

### Other verification scripts

- `node scripts/probe-driver-whitelist.mjs` - driver POD/whitelist DB test
- `node scripts/probe-rls-client-leak.mjs` - client invoice isolation test
- `node scripts/probe-rpc-live.mjs` - atomic inventory RPC check

## Known-pending (not bugs in the flow)

- `CRON_SECRET` + `ANTHROPIC_API_KEY` must be added in Vercel by Bobby
  (until then background jobs run via the GitHub Actions cron-fallback
  workflow, and AI receipt scanning 500s).
- The 02-Jul full-data backup expires ~9 Jul (last copy of the old test
  orders/invoices).
