# Megaprogramme Phase 4 -- paste this AFTER Phase 3 closeout is approved

Continue the CateringMS megaprogramme.

Phase 3 closeout (docs/audits/megaprogramme-2026-05-phase-3.md) is approved.
Now execute Phase 4: strategic upgrades (P3 only).

P3 means: capabilities the audit revealed as missing, not just bug fixes.

Each P3 item gets its own design doc in docs/proposals/ BEFORE implementation.
The doc covers:
- Problem statement
- Proposed solution (UI + data + flow)
- Trade-offs
- Acceptance criteria
- Estimated effort

Wait for operator approval on each design doc before writing code for that
upgrade.

Same standing rules:
- npx tsc --noEmit + npx next build pass per commit.
- SA English. No em dashes. No corporate filler.
- Co-author tag on every commit:
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

When all approved P3 upgrades are shipped, write the final closeout at
docs/audits/megaprogramme-2026-05-phase-4.md. The programme ends there.
