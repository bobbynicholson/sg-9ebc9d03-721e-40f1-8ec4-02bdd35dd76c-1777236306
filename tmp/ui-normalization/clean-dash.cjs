const fs = require('fs');
const p = 'src/pages/team-portal/cleaning/dashboard.tsx';
let s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
const take = (start, endMarker) => {
  const i = s.indexOf(start);
  const j = s.indexOf(endMarker, i);
  if (i < 0 || j < 0) throw new Error('block: ' + start.slice(0, 60));
  const block = s.slice(i, j + endMarker.length);
  s = s.slice(0, i) + s.slice(j + endMarker.length);
  return block;
};
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 80)); s = s.replace(a, b); };

const preEvent = take(`          {/* CLN2-F (cleaning deep audit, CLN2-15): pre-event`, `          )}\n\n`);
const returns = take(`          {/* Wave 70.24 - new event-grouped board is the primary`, `          </div>\n\n`);
const washing = take(`          {/* Wave 41 Phase 2: equipment-availability ledger. Lists`, `          )}\n\n`);
const tiles = take(`          {/* Tile row hides on a failed first load - all-zero tiles`, `          </div>\n\n`);
let priority = take(`          <PortalCard className="mb-6 sm:mb-8">\n            <PortalCardHeader title="Today's priority inspections" />`, `          </PortalCard>\n\n`);

// Compact all-clear state for inspections.
priority = priority.replace(`                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                      <CheckCircle className="w-12 h-12 mx-auto mb-2 text-brand-primary dark:text-brand-primary" />
                      <p>All equipment inspections complete for today!</p>
                    </div>`, `                    <p className="flex items-center gap-2 py-1 text-sm text-slate-600 dark:text-slate-400">
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                      Nothing waiting for inspection.
                    </p>`);
if (!priority.includes('Nothing waiting for inspection')) throw new Error('priority empty state');

// Re-insert in work-first order right where the pre-event block used to start
// (directly after the clock / duty widget).
const anchor = `          {/* Wave 32 Tier 2: dropped the "Cleaning Workflow" tab.`;
const anchor2 = `          {/* Wave 42 Tier 2: dropped the "Cleaning Workflow" tab.`;
const at = s.indexOf(anchor2) >= 0 ? anchor2 : anchor;
if (s.indexOf(at) < 0) throw new Error('anchor');
s = s.replace(at, `          {/* Work-first order: today's counts, the live washing queue,
              items to inspect, returns by event, then tomorrow's checklist. */}
` + tiles + washing + priority + returns + preEvent + at);

// Verification card: the panel already carries its own title and search.
rep(`              <PortalCard>
                <div className="mb-4 flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Equipment verification</h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 -mt-2 mb-4">
                  Verify returned equipment from functions and report any damages or losses
                </p>
                {canManageCleaning ? (`, `              <PortalCard>
                {canManageCleaning ? (`);
rep(`? "Mark broken, lost, or damaged items. Cost breakdown lives on /admin/equipment."`,
    `? "Mark broken, lost or damaged items. Costs are tracked by your admin."`);

// Bottom legend strip duplicated the tabs above it.
take(`          <PortalCard className="mt-6">
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm">`, `          </PortalCard>\n`);

fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
