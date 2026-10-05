const fs = require('fs');
const p = 'src/pages/team-portal/shopping/buy-list.tsx';
let s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
const start = s.indexOf(`                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visible.map(r => {`);
const endMarker = `                  })}
                </ul>
              )}
            </div>
          </PortalCard>`;
const end = s.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('region');

const nu = `                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {/* Grouped by category so a run can be planned aisle by aisle.
                      Groups start open (it's a shopping list) and fold on click. */}
                  {(() => {
                    const groups = new Map<string, OutlookRow[]>();
                    for (const r of visible) {
                      const key = r.category || "Uncategorised";
                      const list = groups.get(key);
                      if (list) list.push(r); else groups.set(key, [r]);
                    }
                    return Array.from(groups.entries());
                  })().map(([category, groupRows]) => {
                    const groupCost = groupRows.reduce((sum, r) => sum + buyQtyFor(r) * Number(r.cost_per_unit || 0), 0);
                    const selectable = groupRows.filter((r) => !activeList.items.some((i) => i.item_id === r.inventory_item_id && !i.purchased));
                    const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.inventory_item_id));
                    return (
                      <details key={category} open className="group/cat">
                        <summary className="flex cursor-pointer list-none items-center gap-3 bg-slate-50/80 px-4 py-2.5 hover:bg-slate-100 sm:px-5 dark:bg-slate-800/40 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
                          {selectable.length > 0 && (
                            <span onClick={(e) => e.stopPropagation()} className="flex">
                              <Checkbox
                                checked={allSelected}
                                onCheckedChange={() => {
                                  for (const r of selectable) {
                                    const isOn = selected.has(r.inventory_item_id);
                                    if (allSelected ? isOn : !isOn) toggleSelect(r.inventory_item_id);
                                  }
                                }}
                                aria-label={\`Select all \${category}\`}
                              />
                            </span>
                          )}
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">{category}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                            {groupRows.length}
                          </span>
                          {groupCost > 0 && (
                            <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">~{tenantCurrency.format(groupCost, 0)}</span>
                          )}
                          <ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open/cat:rotate-180" />
                        </summary>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {groupRows.map(r => {`;

let body = s.slice(start + `                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visible.map(r => {`.length, end);
// Compact row: smaller padding, buy amount + cost on one line, category moved to the group header.
body = body.replace(`className={\`flex items-center gap-3 p-4 transition-colors duration-150 sm:p-5 \${`, `className={\`flex items-center gap-3 px-4 py-3 transition-colors duration-150 sm:px-5 \${`);
body = body.replace(`                            <span>{r.category || "Uncategorised"}</span>\n`, ``);
body = body.replace(`                          <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Buy</div>
                          <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
                            {qty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">{r.unit_of_measure}</div>
                          {cost > 0 && (
                            <div className="mt-0.5 text-[11px] tabular-nums text-slate-600 dark:text-slate-400">
                              ~{tenantCurrency.format(cost, 0)}
                            </div>
                          )}`, `                          <div className="whitespace-nowrap text-sm tabular-nums text-slate-900 dark:text-white">
                            <span className="text-xs text-slate-500 dark:text-slate-400">Buy </span>
                            <span className="font-semibold">{qty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400"> {r.unit_of_measure}</span>
                          </div>
                          {cost > 0 && (
                            <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                              ~{tenantCurrency.format(cost, 0)}
                            </div>
                          )}`);
if (!body.includes('<span className="text-xs text-slate-500 dark:text-slate-400">Buy </span>')) throw new Error('buy column');

const close = `                  })}
                </ul>
                      </details>
                    );
                  })}
                </div>
              )}
            </div>
          </PortalCard>`;
s = s.slice(0, start) + nu + body + close + s.slice(end + endMarker.length);
if (!/ChevronDown[,\s]/.test(s.slice(0, s.indexOf('\n\n', s.indexOf('lucide-react') - 400) + 2000))) {
  s = s.replace(/import \{([^}]*)\} from "lucide-react";/, (m, names) => names.includes('ChevronDown') ? m : `import {${names.trimEnd()}, ChevronDown } from "lucide-react";`);
}
fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
