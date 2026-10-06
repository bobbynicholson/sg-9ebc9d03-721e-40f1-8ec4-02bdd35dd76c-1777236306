const fs = require('fs');
const p = 'src/pages/team-portal/shopping/notifications.tsx';
let s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); s = s.replace(a, b); };

// Overview band repeats the hero chips; drop it.
const o1 = s.indexOf(`      // Same inbox summary band as the kitchen notifications page.
      overview={`);
const o2 = s.indexOf(`      }\n    >`, o1);
if (o1 < 0 || o2 < 0) throw new Error('overview');
s = s.slice(0, o1) + s.slice(o2 + `      }\n`.length);

// Group by type in collapsible sections.
rep(`          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((n) => {`, `          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {(() => {
              const groups = new Map<string, typeof visible>();
              for (const item of visible) {
                const key = item.type ?? item.notification_type ?? "other";
                const list = groups.get(key);
                if (list) list.push(item); else groups.set(key, [item]);
              }
              return Array.from(groups.entries());
            })().map(([typeKey, groupItems], groupIndex) => {
              const unreadInGroup = groupItems.filter((g) => !g.is_read);
              return (
                <details key={typeKey} open={groupIndex === 0 || tab === "unread"} className="group/type">
                  <summary className="flex cursor-pointer list-none items-center gap-2 bg-slate-50/80 px-4 py-2.5 hover:bg-slate-100 sm:px-5 dark:bg-slate-800/40 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{typeKey === "other" ? "Other" : humaniseEnum(typeKey)}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">{groupItems.length}</span>
                    {unreadInGroup.length > 0 && (
                      <span className="text-[11px] font-medium text-amber-700">{unreadInGroup.length} unread</span>
                    )}
                    {unreadInGroup.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); unreadInGroup.forEach((g) => void markRead(g.id)); }}
                        className="ml-2 inline-flex items-center text-[11px] font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        <Check className="mr-1 h-3 w-3" /> Mark {unreadInGroup.length} read
                      </button>
                    )}
                    <ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open/type:rotate-180" />
                  </summary>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {groupItems.map((n) => {`);
rep(`              );
            })}
          </ul>
        )}
      </PortalCard>`, `              );
            })}
          </ul>
                </details>
              );
            })}
          </div>
        )}
      </PortalCard>`);
// Long shortage lists: two lines, expandable.
rep(`                    {n.message && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{n.message}</p>}`,
`                    {n.message && (
                      n.message.length > 160 ? (
                        <details className="group/msg mt-1">
                          <summary className="cursor-pointer list-none text-sm text-slate-600 dark:text-slate-400 [&::-webkit-details-marker]:hidden">
                            <span className="line-clamp-2 group-open/msg:line-clamp-none">{n.message}</span>
                            <span className="text-[11px] font-medium text-brand-primary group-open/msg:hidden">Show all</span>
                          </summary>
                        </details>
                      ) : (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{n.message}</p>
                      )
                    )}`);
// Type chip is now the group header.
rep(`                      {(n.type || n.notification_type) && (
                        <span className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">{humaniseEnum(n.type ?? n.notification_type)}</span>
                      )}\n`, ``);
if (!/\bChevronDown\b/.test(s.slice(0, s.indexOf('lucide-react') + 20))) {
  s = s.replace(/import \{([^}]*)\} from "lucide-react";/, (m, names) => `import {${names.replace(/,?\s*$/, '')}, ChevronDown } from "lucide-react";`);
}
fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
