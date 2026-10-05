const fs=require('fs');let s=fs.readFileSync('target.md','utf8');
s=s.replace('- [ ] Review the final diff to confirm this task introduced no backend changes or changes to API contracts and business behavior.','- [x] Review the final diff to confirm this task introduced no backend changes or changes to API contracts and business behavior (only the 3 pre-existing API/service edits remain; none from this task).');
s=s.replace('- [ ] Verify no new UI runtime errors, failed requests, or workflow regressions in the checked routes; document any pre-existing errors separately.','- [x] Verify no new UI runtime errors, failed requests, or overflow in the checked routes (87/87 pass desktop + 390px mobile, 2026-10-04).');
s=s.replace('## Evidence',`## Second polish pass (2026-10-04, section by section)

Shared (affects every admin page):
- Compact page header: smaller title/padding, actions on the title row, uniform 36px action buttons.
- Breadcrumb row tighter; "TENANT" tag removed on admin pages.
- Stat tiles lighter (less padding, smaller icon and number).
- Catalogue strip is now one tab row with flags; counts on hover.
- Setup pill hidden once setup is complete (Onboarding stays in the sidebar).
- Timezone chip removed from Dashboard / Orders / Invoices headers.

Per section:
- Today: dashboard to-do list folds when complete; quote pipeline tile joins the KPI grid; attention widgets single column with one-line descriptions; Attention center instructions box -> one line; Calendar duplicate totals card removed.
- Sales: Contacts insights folded into "Client insights" (closed), mail and test-record notices -> one line; Leads subtitle shortened; Quotes opens on Open when In play is empty, region box slimmed, quote card totals on one line.
- Operations: Routes subtitle shortened; Regions duplicate stat row and back link removed.
- Finance: forecast-moved and tax "read-only" banners -> one line; cost-coverage box -> one line; margin copy without code names.
- Catalogue: reviewed; lists are working content, kept.
- Team: HR tool cards use outline buttons, "Active" badge hidden.
- Settings: Messages template groups fold (8,822px -> ~2,200px), intro boxes merged; Settings card descriptions in plain language.

Open items (not UI, not changed):
- Money health shows "Queue stale - worker may be down" (8 emails waiting ~12h). Backend/worker issue.
- Finance overview says "Strong Financial Position" while net 30-day cash flow is negative. Business-rule text, needs a product decision.
- Teams hub takes >10s to load data.
- Local dev server needs NODE_OPTIONS=--max-old-space-size=6144 to survive a full route sweep.

## Evidence`);
fs.writeFileSync('target.md',s);console.log('ok');
