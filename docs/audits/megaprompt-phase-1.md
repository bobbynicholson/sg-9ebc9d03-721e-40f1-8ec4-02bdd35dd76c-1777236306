# Megaprogramme Phase 1 -- paste this as the FIRST message in a fresh Claude Code session, AFTER you've approved the Phase 0 audit document

Continue the CateringMS megaprogramme.

Phase 0 audit is complete and approved. Read docs/audits/megaprogramme-2026-05.md
as ground truth. Now execute Phase 1: critical fixes (P0 only).

P0 means: something that breaks the core lead-to-cash journey, exposes data
inappropriately, corrupts state, or fails silently in ways the operator can't
recover from.

Rules:
- One P0 finding per commit. Atomic.
- Each commit message references the finding ID from the audit ledger.
- After every commit: run `npx tsc --noEmit` AND `npx next build`. Both must pass.
- Pre-push TypeScript hook is in place. Do not bypass it.
- No P1 / P2 / P3 work in this phase. Resist scope creep.
- South African English. No em dashes (use --). No corporate filler.
- Co-author tag on every commit:
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

When every P0 finding is closed, write the closeout report at
docs/audits/megaprogramme-2026-05-phase-1.md listing:
- Each P0 finding ID
- The commit SHA that fixed it
- The verification performed
- Any P0 finding that was downgraded with justification

Then stop. Do NOT start Phase 2. Wait for operator approval.
