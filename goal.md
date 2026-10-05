# Goal: normalize the kitchen and admin UI

## Objective

Review every kitchen page and use its clearest, most consistent layout patterns to normalize every admin page. Make the interface easy to scan, keep related controls together, and place collapse/expand controls consistently. Pages should open in a predictable state with the main task visible and secondary content tucked away.

**Status:** In progress. Company admin pages are the current implementation scope; see `target.md` for the latest user-approved requirements and verification evidence.

## Scope

- All kitchen routes in `src/pages/team-portal/kitchen`, including nested pages, manager views, settings and order tickets.
- All admin routes in `src/pages/admin`, including nested pages, platform pages, detail views, creation/edit forms and onboarding.
- Shared page shells, sidebar navigation, cards, tables, filters, tabs, dialogs, drawers and floating widgets used by these pages.
- Both bare routes and company-prefixed routes, with the existing role permissions respected.
- Desktop, tablet and mobile layouts.

## UI rules

### Page structure

- Use a consistent page shell: navigation, page heading, short description, primary actions, main content and supporting sections.
- Normalize content width, spacing, typography, card padding, borders, colours, icons and button sizes.
- Keep the primary action easy to find. Group secondary actions beside the content they affect.
- Place filters and search consistently above the relevant list or table.
- Keep loading, empty, error and permission-denied states consistent and useful.
- Keep essential operational information visible, such as active work, required decisions and blocking errors.

### Collapse and expand

- Put section collapse/expand controls in a consistent position in the section header, with a clear label and state indicator.
- Make controls usable by mouse, touch and keyboard; expose `aria-expanded` and the controlled section.
- Collapse secondary details, advanced filters, historical records, instructions and optional settings by default where appropriate.
- Give each page an explicit default state. Avoid opening every section on initial load.
- Let the user open the section they need without unexpectedly opening unrelated sections or closing their current work.
- Keep expanded states stable during ordinary refreshes, data updates and rerenders. Reset or restore them deliberately when changing pages or records.
- Show a useful summary, count or status while a section is collapsed.
- Reveal a collapsed section when it contains a form validation error and move focus to the relevant field.
- Keep collapse/expand controls visually distinct from staff clock-in/clock-out and other operational actions.

### Navigation and overlays

- Keep sidebar collapse/expand controls in the same place across kitchen and admin pages.
- Use clear navigation groups and predictable active-page highlighting. Open groups deliberately based on the current route or user action.
- Keep dialogs, drawers, dropdowns, help panels, onboarding checklists and chat widgets closed until requested, unless a specific blocking workflow requires them.
- Prevent floating panels from covering primary actions, forms or important data. Give overlays clear close controls and correct focus behaviour.
- Make closing a panel return the user to the same page and working position.

## Work plan

1. **Inventory:** list every kitchen and admin route, its shared components, current layout and collapse/overlay behaviour. Track every route so none is missed.
2. **Kitchen review:** inspect all kitchen pages locally as the relevant staff and manager roles. Identify the patterns to keep and any inconsistencies to fix before using them as the reference.
3. **Shared patterns:** define reusable page, section-header, collapsible-section, filter-bar and action-area patterns. Document which sections start open or closed and when their state persists.
4. **Kitchen normalization:** apply those patterns across the kitchen pages and shared kitchen components.
5. **Admin rollout:** update every admin page in manageable groups, including nested and platform routes. Use the same layout and interaction rules while accommodating each page's task.
6. **Local review:** use the authorized local login script to check the affected pages as each relevant role. Check default states, repeated toggling, refreshes, navigation, forms and responsive layouts.
7. **Completion review:** finish the route checklist, record any remaining exceptions with a reason, and provide screenshots and a summary of the changes.

## Acceptance criteria

- Every kitchen and admin route is accounted for and reviewed.
- Shared page structure, spacing, headings and action placement are consistent.
- Collapse/expand controls have consistent placement, labels and keyboard behaviour.
- Optional sections and overlays do not all open automatically.
- Essential tasks, alerts and validation errors remain easy to find.
- Refreshes and realtime updates do not unexpectedly reset the user's open sections.
- Sidebar and section collapse states behave predictably on desktop and mobile.
- Existing forms, navigation, role restrictions and business workflows continue to work.
- No overlays obscure important controls or leave keyboard focus trapped incorrectly.
- Local checks and screenshots demonstrate the final layout and interaction states.

## Progress

- [x] Inventory admin source routes, including nested pages, aliases, redirects and platform routes.
- [ ] Complete the kitchen reference route checklist.
- [ ] Review all kitchen pages and agree on shared patterns.
- [x] Define reusable layout and collapse/expand components.
- [ ] Normalize all kitchen pages.
- [ ] Normalize all admin pages, including nested and platform pages.
- [ ] Review navigation, dialogs, drawers and floating widgets.
- [ ] Check all affected roles and responsive layouts locally.
- [ ] Complete the route checklist and final report.

### Implemented so far

- Shared cards support explicit default states, stable expansion during rerenders, retained form values, anchor reveals and native validation reveals.
- Navigation opens the active group initially and honors explicit toggles; collapsed sidebar spacing is consistent.
- The company setup checklist starts closed, supports Escape and restores focus.
- The dashboard groups urgent work separately from optional team details, history and trends.
- Initial page-specific defaults are implemented across company settings, quotes, financial pages and supporting sections.
- Dashboard desktop/mobile checks and TypeScript checks passed. Broader route review is in progress.
