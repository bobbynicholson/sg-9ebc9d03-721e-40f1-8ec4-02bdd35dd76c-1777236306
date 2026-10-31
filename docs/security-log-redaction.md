# Application log redaction

The shared boundary is `src/lib/logRedaction.ts`. It creates safe snapshots without changing request bodies, query parameters, responses, or original errors. Secret fields are removed recursively, including entire credential containers, headers/cookies, token hashes, provider keys, OAuth parameters and token-bearing public links. Free-form messages, interpolated JSON, printf arguments and error stacks use the same rules.

The boundary covers:

- File logger output, area/error files, startup banner and run metadata.
- Console output before it reaches the terminal or file mirror. Node instrumentation, Edge middleware and the browser application initialize the same console wrapper. Debug/trace, assertions, object output, groups and timer/counter labels are included.
- API request/response/exception logging. Authorization gates and handlers receive the original URL and payload; error responses retain their original contents.
- Import diagnostics, including their direct stdout/stderr writes.
- Observability fallback output and sanitized error/context copies passed to the optional monitoring SDK.

Next.js development request/fetch tracing is disabled because its raw URL output bypasses the application console wrapper. Application request logging remains enabled. The service worker runs in a separate context: its diagnostics contain fixed messages and fixed precache paths, and its raw error-object output has been removed.

When adding a new token-bearing route or secret field format, extend the shared rules and add a regression case. Log structured, named fields: a detector cannot infer that an arbitrary unlabelled string is a secret. Existing log files and retained cloud logs are not rewritten. Hosting, reverse-proxy and CDN access logs require their own logging settings.

## Verification — 31 October 2026

- Full Jest suite: 1,527 tests passed across 199 suites.
- Focused logging and API-gate checks: 78 tests passed across seven suites.
- TypeScript passed. Targeted ESLint had no errors; four existing warnings remain.
- Isolated Next development server with offline database credentials: anonymous payment settings still returned 401; three Chrome console probes were redacted; Edge token-bearing paths were redacted; six generated log files contained none of the synthetic secret markers.
- The runtime check used genuine cached fonts through Next's verification transport and did not use the live database. No production deployment was performed.

Run the focused checks:

```powershell
node node_modules/jest/bin/jest.js --runInBand --watch=false --runTestsByPath src/__tests__/lib/logRedaction.test.ts src/__tests__/lib/consoleRedaction.test.ts src/__tests__/lib/apiLogRedaction.test.ts src/__tests__/lib/loggerRedaction.test.ts src/__tests__/lib/observabilityRedaction.test.ts src/__tests__/lib/importLog.test.ts src/__tests__/subscriptionApiGate.test.ts
```
