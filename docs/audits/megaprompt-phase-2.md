# Megaprogramme Phase 2 -- paste this AFTER Phase 1 closeout is approved

Continue the CateringMS megaprogramme.

Phase 1 closeout (docs/audits/megaprogramme-2026-05-phase-1.md) is approved.
Now execute Phase 2: important improvements (P1 only).

P1 means: friction the operator notices weekly, missing affordances on key
flows, broken nav links, generic error messages where a specific one is
possible, places where the tenant looks like they "just signed up" instead of
"established business".

Same rules as Phase 1:
- One P1 finding per commit. Atomic.
- Reference the finding ID in the commit message.
- npx tsc --noEmit + npx next build pass per commit.
- SA English. No em dashes. No corporate filler.
- Co-author tag on every commit:
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

When every P1 finding is closed, write the closeout at
docs/audits/megaprogramme-2026-05-phase-2.md. Then stop and wait for approval
before Phase 3.
