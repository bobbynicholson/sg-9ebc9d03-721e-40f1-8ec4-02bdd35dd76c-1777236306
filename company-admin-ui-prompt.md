# Company admin UI normalization prompt

Update every company admin page in this CateringMS repository so it follows the clear, consistent UI and UX already established in the kitchen and driver portals. Implement the changes end to end. Make it easy for a company admin to understand each page, identify what needs attention, find the next action, and open details only when needed.

## Start with the existing work and commit history

Read applicable AGENTS.md instructions, inspect `git status --short`, and review both staged and unstaged changes before editing. Preserve existing work and continue its useful patterns. Treat `goal.md` as background intent; verify actual progress against the code rather than trusting its status checklist.

Review these reference commits and their actual diffs:

- `5cb27b36` — Improve driver portal clarity and navigation.
- `49896478` — Polish kitchen operations and notification UIs.
- Inspect relevant earlier and later history with `git log --oneline -- src/pages/admin src/pages/team-portal/kitchen src/pages/team-portal/driver src/components/portal src/components/navigation`, then use `git show <commit> -- <path>` to understand the reasons for each pattern.

Study the current kitchen and driver pages under `src/pages/team-portal/kitchen` and `src/pages/team-portal/driver`, especially dashboards, lists, calendars, filters, disclosures, and empty states. Reuse the strongest patterns: action-oriented descriptions, visible current work, compact summaries, optional details, and predictable navigation.

Inspect and extend existing shared components before introducing replacements: `src/components/portal/ui.tsx`, `AdminPageHeader`, `AdminNav`, `AdminSetupSticky`, `PortalSidebar`, `CollapsibleNavSection`, `TeamManagerWorkspace`, and `src/components/ui/card.tsx`. Review `tmp/ui-normalization/section-decisions.json` if present; validate each default-open decision against the page's main task.

## Cover every company admin page

Inventory all routes under `src/pages/admin`, including nested routes, detail pages, creation/edit forms, settings tabs, onboarding, and team management. Record each route as updated, already consistent, redirect-only, inaccessible to company admins, or blocked with a specific reason. Discover routes from the filesystem and navigation rather than relying on a handpicked list.

Company admin pages are the implementation scope. Keep platform-only routes distinct and verify that shared component changes do not break them or the kitchen and driver portals. Support existing tenant-prefixed links and permitted admin roles without changing permissions or tenant isolation.

## Apply these UI and UX rules

1. Use a consistent shell, content width, page header, spacing, typography, cards, icons, buttons, and tenant branding. Keep light and dark modes readable. Adapt layout density to dashboards, lists, and forms.
2. Give each page a clear title and one short sentence explaining what the user can do. Keep its main action prominent; place secondary actions beside the content they affect. Use plain, specific labels and make statuses and next steps understandable.
3. Keep current work, primary lists, blocking alerts, and essential form fields visible. Collapse secondary explanations, advanced filters, optional settings, and supporting history when appropriate. Avoid automatically collapsing every card.
4. Put collapse controls consistently in section headers, with accessible labels, `aria-expanded`, `aria-controls`, and a useful summary or count. Keep state stable during realtime updates and rerenders. Define deliberate reset behavior for route or record changes. Preserve unsaved values; reveal and focus invalid fields or linked anchors inside collapsed content.
5. Group navigation clearly, highlight the current page, and initially reveal its group. Honor explicit user toggles. Keep sidebar controls predictable across desktop and mobile. Preserve existing deep links and chatbot section anchors.
6. Place search and filters above the relevant list. Show active filters, result counts, and a clear reset action. Keep row actions discoverable and tables usable on small screens. Provide useful loading, empty, filtered-empty, error, and permission states with an appropriate next step.
7. Keep optional dialogs, help, setup checklists, drawers, and chat panels closed until requested. Prevent floating widgets from covering controls. Support keyboard use, visible focus, touch targets, close controls, and focus restoration.
8. Preserve business behavior, especially quotes, orders, payments, invoice amounts, staff operations, saving, and realtime updates. Reuse existing design tokens and primitives; keep implementation changes focused on this UI work.

## Implement and verify

Maintain a route checklist and apply the shared patterns across all company admin pages in manageable groups. Continue through implementation and verification rather than stopping after the audit or dashboard.

Review every scoped route locally using an authorized company admin session. Inspect existing verification scripts before using them, and ensure route coverage includes dynamic pages. Check desktop, tablet, and mobile layouts; default states; repeated toggling; route changes; refreshes; active filters; form validation; and overlays. Exercise important workflows with safe local fixtures. Run appropriate lint, type, build, and existing targeted checks; add focused regression tests only where behavior changes warrant them. Capture representative before/after screenshots and verify shared components in the kitchen, driver, and platform surfaces they affect.

Finish with the route checklist, changed files, screenshots, checks and results, and any remaining blockers or justified exceptions. State precisely what was verified. Completion means every company admin route is accounted for, the UI consistently explains the task and next action, and existing workflows still work.
