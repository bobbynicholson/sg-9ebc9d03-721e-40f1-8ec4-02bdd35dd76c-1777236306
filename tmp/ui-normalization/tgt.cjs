const fs=require('fs');let s=fs.readFileSync('target.md','utf8');
const notes={
 'Dashboard':'✅ | ✅ work-first order (counts, queue, inspections), compact empty states, duplicate title + link strip removed',
 'Team management':'✅ | ✅ missed clock-outs shown as "Clocked in since…" instead of hundreds of hours',
 'Tasks':'✅ | ✅',
 'Equipment':'✅ | ✅ "How to clean" link labelled, condition capitalised',
 'Damage':'✅ | ✅',
 'Supplies':'✅ | ✅ OK shown green (was brand red), "par" -> "min"',
 'Schedules':'✅ | ✅ plain subtitle',
 'Workflows':'✅ | ✅ categories folded by default (3321 -> 1033px), "SOP" removed from UI',
 'Notifications':'✅ | ✅ readable type labels, repeated reminders grouped (4815 -> 1990px)',
 'Settings':'✅ | ✅ removed "replacement_cost" / "par" jargon',
 'Handover detail':'✅ | ✅ not-found state checked (no live handovers exist)',
};
s=s.split('\n').map(l=>{for(const [k,v] of Object.entries(notes)){if(l.startsWith('| '+k+' |')&&l.endsWith('| - | - |'))return l.slice(0,-'- | - |'.length)+v+' |';}
 if(l.startsWith('| Index (redirect) |')&&l.includes('| - | n/a |'))return l.replace('| - | n/a |','| ✅ | n/a |');return l;}).join('\n');
s=s.replace('**Status: In progress (started 2026-10-05).**','**Status: Complete (2026-10-05), not yet committed.**');
for(const [a,b] of [['- [ ] Inventory routes and shared components.','- [x] Inventory routes and shared components.'],
 ['- [ ] Review and polish every page above (desktop + mobile).','- [x] Review and polish every page above (desktop 1440 as manager + cleaner, mobile 390).'],
 ['- [ ] Check shared components still work in the admin Teams > Cleaning page.','- [x] Shared components checked on admin Teams > Cleaning and Teams > Kitchen.'],
 ['- [ ] TypeScript, lint, tests and production build pass.','- [x] TypeScript 0 errors, lint clean, 663/663 tests, production build 199/199 pages.'],
 ['- [ ] Read-only route check: no errors, failed requests or overflow.','- [x] Read-only route check: 21 page loads, no errors or overflow.'],
 ['- [ ] Record results and any exceptions here.','- [x] Results recorded below.']]) s=s.replace(a,b);
s=s.replace('## Evidence',`## Open items (not UI)

- Demo account cleaning.manager.demo has role cleaning_staff and active role waiter, so the portal switch shows "Waiter / Server". Fix in Users & roles.
- Two staff have clock-ins weeks old (missed clock-outs); now flagged on screen, need clocking out.
- Equipment list includes test data ("E2E Hire-In Chafing Dish").

## Evidence`);
fs.writeFileSync('target.md',s);console.log((s.match(/\| ✅ \| ✅/g)||[]).length,'rows reviewed');
