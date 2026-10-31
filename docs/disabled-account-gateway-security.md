# Disabled-account protection for gateway APIs

The payment-gateway list, save, activation, deletion and connection-test operations now use `src/lib/requireActiveApiProfile.ts` before accessing the service-role client. A valid Auth session is insufficient when the caller's profile has `is_active = false` or a non-null `deleted_at`.

The helper verifies the user with `auth.getUser()`, reads the current profile on every request, checks account status, and checks the canonical role against the handler's existing allowlist. It returns 401 for failed authentication, 403 for denied account/role access, and 503 if the profile query fails. Disabled/deleted accounts receive `ACCOUNT_ACCESS_DENIED`. Status is not cached, so an already-signed-in account loses API access on its next request.

The existing role allowlists and company scoping are preserved. This change covers the gateway API family; the helper is available for other privileged handlers to adopt. No database migration or production application deployment is part of this fix.

## Verification — 31 October 2026

- Full application Jest suite: **1,576 passed across 199 suites**.
- Targeted authorization, checkout, API-guard and log-redaction run: **115 passed**.
- Isolated SQL company-security scenarios: **24 passed**.
- TypeScript and targeted ESLint passed without errors or warnings.
- Local browser and real-session checks: **13/13 passed**. An active disposable Admin read the gateway list (200) and loaded the dashboard in Chrome without page errors. The original authenticated session received 403 on all five operations after disabling the profile, and again after marking it deleted while leaving its active flag set. Reactivation restored read access (200).
- The disposable users and their profiles were removed after verification. Existing users, payment settings and customer records were not modified, and no emails were sent. Evidence is in `tmp/security/disabled-account-local-result.json`.

The earlier live reproduction against `https://cateringms.com` returned 200 for the disabled account. Its evidence remains separate in `tmp/security/disabled-account-live-result.json`. The fixed local result does not establish that the public site is fixed.

## Local testing

The development app is available at `http://127.0.0.1:3011/auth/login`, with its build output isolated in `.next-account-status`. Loopback hosts are included in Next's development-origin allowlist so its browser assets and HMR connection load. Cached genuine Inter/Fraunces font files are used by the local verification transport.

This local app uses the existing connected database. Use a disposable staff account for manual suspension tests. Keep its session open, disable that user from a second authorized session, and request `GET /api/payment-gateways` from the first session. Expect 403; reactivation should restore 200. Normal active users retain the gateway permissions they had before this change.
