# PWA push notifications

The app uses the Web Push API for alerts that can arrive while the PWA is in
the background or closed. Notification rows enter a database outbox, and the
`/api/cron/pwa-push-delivery` worker sends them to each opted-in device. Tapping
an alert opens its saved destination; notifications without a saved link open
the correct role inbox.

The outbox retries delivery failures with backoff, recovers expired worker
leases, and marks a job failed after five attempts. Delivery is at-least-once:
if a push provider accepts an alert but the worker crashes before recording
success, a later retry can show that alert again.

The admin Notifications page shows the worker heartbeat and tenant queue
counts, including work that is waiting, stuck, or failed. It refreshes while
the page is open and lets an admin requeue a failed delivery. The worker also
recovers expired leases automatically on its next run. If Vercel is unavailable,
the database outbox remains intact; delivery pauses until the worker runs again.
This does not provide an independent sender or an out-of-band alert while the
app host is down.

## Keys and deployment

For local development, run `npm run pwa:setup-push` once. It creates a VAPID
key pair in the ignored `.env.local` file without printing the private key.

Configure these same values in the production deployment environment:

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY` — keep this server-only
- `WEB_PUSH_VAPID_SUBJECT` — for example `mailto:support@cateringms.com`

Do not rotate the VAPID pair after devices subscribe unless you also plan to
resubscribe those devices. Apply the Supabase migration
`20261114140000_pwa_web_push_delivery.sql`; Vercel runs the delivery endpoint
once per minute. The same migration creates the worker health record used by
the admin delivery panel.

## Device behavior

Each user enables push from the notification bell on each device. Android
launchers show their own notification indicator. iOS/iPadOS 16.4 or newer
requires the PWA to be installed on the Home Screen and notification
permission to be granted.
The selected portal role is saved per device: a driver device receives driver-
targeted alerts, while a separate device can be set to another assigned role.
Switching portals in the app updates that device's role subscription.
Numeric icon badges depend on the operating system's Badging API support.
Notification sound follows the user's phone and app notification settings;
the web app cannot override silent mode, Focus, or Do Not Disturb.
