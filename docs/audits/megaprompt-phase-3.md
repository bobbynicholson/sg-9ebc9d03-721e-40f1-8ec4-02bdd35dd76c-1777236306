# Megaprogramme Phase 3 -- paste this AFTER Phase 2 closeout is approved

Continue the CateringMS megaprogramme.

Phase 2 closeout (docs/audits/megaprogramme-2026-05-phase-2.md) is approved.
Now execute Phase 3: polish (P2 only).

P2 means: visual consistency, micro-copy, animation, accessibility, mobile polish.

Group related fixes into themed commits (e.g. "Tighten admin empty states",
"Audit loading skeletons across the platform") rather than one-per-finding when
they touch the same files.

Same rules:
- Reference finding IDs in commit messages.
- npx tsc --noEmit + npx next build pass per commit.
- SA English. No em dashes. No corporate filler.
- Co-author tag on every commit:
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

When every P2 finding is closed, write the closeout at
docs/audits/megaprogramme-2026-05-phase-3.md. Then stop and wait for approval
before Phase 4.
