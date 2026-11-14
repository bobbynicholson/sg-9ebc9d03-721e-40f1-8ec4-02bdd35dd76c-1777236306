# Scheduled task monitoring

Every cron route listed in `vercel.json` uses `requireCronAuth`. The shared
auth gate creates a separate run record before each handler begins, then stores
its HTTP result and duration before the response completes. Keeping one row per
invocation means an overlapping later run cannot hide an earlier run that is
still active. If a function is terminated before it can finish, the monitor
marks that run stuck after ten minutes the next time the status page is opened
or refreshed. Cron heartbeats carrying `status: "error"` also mark the exact
invocation failed, including handlers that return HTTP 200 after reporting
item-level errors.

`/admin/cron-tasks` lists every configured schedule, its most recent recorded
state, the next scheduled time, and its latest ten failures, stuck runs, or
missed schedules. Incidents remain visible after recovery and are marked with
the successful run that recovered them. The monitor refreshes once per minute
while open. Schedules are interpreted in UTC; the displayed next-run time is
converted to the viewer's local timezone. Existing `cron.*` audit entries are
used for the initial historical result and failed-heartbeat backfill.

The monitor is observational. A failed task must be investigated in the
Vercel function logs and retried through that task's existing workflow; the
monitor does not manually execute arbitrary scheduled jobs because many send
messages, payments, reminders, or other external side effects.

Retries belong at the smallest durable work-item level. Email rows left
`in_progress` for 30 minutes are reclaimed with the same provider idempotency
key; WhatsApp rows use a timed claim lease and a five-attempt cap; Web Push rows
use their own lease, backoff, and attempt limit. Quote expiry stores
per-channel delivery markers, and quote follow-ups use an idempotency key.
PayFast history rows that cannot be matched to a saved checkout are persisted
for review while the history cursor continues past them; no payment is inferred
or posted from an unknown reference. Other cron handlers run again at their
configured schedule and reselect pending work where their state guards allow
it.

There is no blanket whole-route retry: an HTTP failure can happen after some
external effects already succeeded, so replaying the whole handler could send
duplicate messages or payments. Email has a provider idempotency key; WhatsApp
and Web Push are at-least-once around the narrow case where the provider accepts
a send but the process dies before saving its receipt. For schema errors, apply
the repair migration first; another run cannot repair a missing table or
column.

The `scheduled_task_status`, `scheduled_task_runs`, and
`scheduled_task_incidents` tables have RLS enabled and no client policies.
Only server-side code writes them. The admin API checks the operator's active
account and role before reading them. Stuck and overdue checks are detected
when the admin status API is polled; this is not an independent external
watchdog, so the page must be opened or refreshed to persist newly detected
incidents.

Apply the migrations in timestamp order before deploying the matching code:

- `20261114140000_pwa_web_push_delivery.sql`
- `20261114150000_scheduled_task_monitoring.sql`
- `20261114160000_cron_retry_safety_repairs.sql`
- `20261114161000_whatsapp_queue_leases.sql`
- `20261114162000_email_queue_claim_recovery.sql`
- `20261114163000_payfast_history_exception_review.sql`

Run `npm run check:cron-monitoring` to verify that every path in `vercel.json`
has an authenticated API route wired through the shared recorder.
