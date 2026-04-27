# CateringMS roadmap -- deferred work

Living list of stuff Bobby's flagged but explicitly deferred. Newest at
the top. When you pick something off this list, move it out of here and
into the actual feature work.

## Platform owner cost dashboard

A super-admin-only page that rolls up running platform expenses + per-
tenant cost contribution so Bobby can see the SaaS economics at a glance.

What to track:

- **Google Maps API**: monthly spend from Cloud Billing API (places /
  geocoding / distance / directions / maps JS broken out). Per-tenant
  attribution by counting how many delivery-fee calculations each
  company triggered (we already log nothing for this -- needs a small
  `api_usage_log` table with `(company_id, api, called_at)`).
- **Supabase**: storage + egress + active connections. Pull from the
  Supabase Management API. Estimate per-tenant share by row counts
  in `companies.id`-scoped tables.
- **Vercel**: function invocations + bandwidth. Pull from Vercel Usage
  API. Spread evenly across active tenants since the front-end is
  shared.
- **OpenAI / Anthropic** (if/when ChatBot lands): per-message cost,
  attributed to whichever tenant the chat session belongs to.
- **SMTP relay** (when SMTP send goes live): per-email cost if we use
  Postmark/SendGrid; zero if tenants bring their own.
- **Currency**: ZAR-default but show USD source values for the
  Google/Vercel/OpenAI bills so Bobby can sanity-check against the
  source invoices.

UI shape:

- Top tile row: month-to-date spend, last-month spend, projected EOM,
  per-paying-tenant average
- Stacked bar by month (Maps / Supabase / Vercel / AI / SMTP)
- Per-tenant table sorted by cost contribution -- name, plan, spend,
  margin (revenue - cost), highlight if margin is negative
- Alerts: any tenant whose spend exceeds 30% of their plan price for
  the month (signal to upsell or rein in their usage)

Add to AdminNav under Platform Admin -> "Costs & margin".

## Native Xero OAuth one-click connect

Scaffolding is in place (`xero_integration_settings` table + UI
"coming soon" callout on `/admin/integrations`). What's left:

- `/api/xero/connect` -- redirect to Xero authorise URL with state
  param tied to company_id
- `/api/xero/callback` -- exchange code for refresh token, store
  encrypted, mark connected
- Background refresh job (Xero refresh tokens rotate every 60 days
  or on use -- need a Supabase edge function on a 24h cron)
- Sync queue drainer that uses stored creds to push/pull quotes +
  invoices via Xero API
- "Connect Xero" button on the integrations page that flips the amber
  callout to a green "Connected as {tenant_name}" tile
- Requires `XERO_CLIENT_ID` + `XERO_CLIENT_SECRET` env vars and a
  registered Xero developer app pointing at our callback URL

Until this lands, the Zapier path on `/admin/integrations` works
end-to-end -- 3 Zaps cover quote-out, quote-in, invoice-paid-in.

## Direct email send (SMTP / Gmail / MS 365)

`/admin/email-settings` page lets the catering company configure
provider details + auto-attach toggles. Drafts get queued in
`outgoing_email_queue`. What's left:

- Edge function `send-email` that drains the queue using the
  tenant's stored creds
- Gmail OAuth flow (`/api/gmail/connect`, `/api/gmail/callback`) +
  Google Cloud Gmail API enabled
- Microsoft 365 OAuth flow (similar shape)
- SMTP send via `nodemailer` (already in deps -- just needs the
  edge function to wire in stored creds)
- Daily cap enforcement using `outgoing_email_log` count vs
  `email_provider_settings.daily_send_cap`

Until this lands, the Compose drawer in `/admin/clients` handles all
flows manually via Gmail / Outlook / mailto / clipboard, and the
auto-attach toggles queue drafts for visibility.

## Repeat-customer magic-link auto-send

DB triggers already mint the magic-link token and queue the email.
Lights up the moment direct email send (above) goes live.

## Mailchimp full bulk send integration

`email_provider_settings` already has `mailchimp_api_key_encrypted`
and `mailchimp_audience_id` columns. What's left:

- Edge function that POSTs to Mailchimp's `/lists/{id}/members` when
  a new client is created
- Tag updates on first vs returning customer (per Zap recipe in the
  integrations gallery)
- "Sync all clients to Mailchimp" backfill button on
  `/admin/email-settings`

## White Label deeper brand work

Sidebar branding + tokenised client pages already pull from
`companies.logo_url / primary_color / secondary_color` (set via
`/admin/company-profile`). What's left for "white label":

- Custom domain support (`companies.custom_domain` -- DNS verification
  flow, Vercel domain attach via API)
- Per-tenant favicon
- Branded login page at `/{custom_domain}/login`
- Email branding (header logo + footer) once direct send lands

## Driver / Kitchen / Shopping / Cleaning / Client dashboards: full
metric-card upgrade

Tooltips were added to the primary tiles in earlier passes, plus
status filter fixes. The full `<MetricCard>` + `<DashboardDateRange>`
treatment from `/admin/dashboard` hasn't been rolled into the team
dashboards yet -- they're "today" focused and a date picker on driver
dashboards isn't really useful.

If we want it later: pick the tiles that make sense per role, swap
to `<MetricCard>`, drop in the date range only on Admin / Client
dashboards (the only roles who think in date ranges).

## Native Xero connect notes -- env vars to set when it's time

```
XERO_CLIENT_ID         = <from developer.xero.com app>
XERO_CLIENT_SECRET     = <same>
XERO_REDIRECT_URI      = https://cateringms.com/api/xero/callback
```

Set the redirect URI in the Xero app config to the same value.
