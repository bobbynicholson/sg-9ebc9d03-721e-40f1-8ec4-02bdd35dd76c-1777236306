const fs = require('fs');
const p = 'src/pages/team-portal/shopping/inventory.tsx';
let s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); s = s.replace(a, b); };

// Grouping + open state (after stockLabel helper).
rep(`  const stockLabel = (item: Inventory) => {`, `  // Category groups for the table. A search or "below only" filter opens
  // every group; otherwise groups with something to buy start open.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const needsAttention = (item: Inventory) => {
    const stock = Number(item.current_stock || 0);
    const min = Number(item.minimum_stock || 0);
    return stock <= 0 || (min > 0 && stock <= min);
  };
  const groupedItems = useMemo(() => {
    const map = new Map<string, Inventory[]>();
    for (const item of filtered) {
      const key = item.category || "Uncategorised";
      const list = map.get(key);
      if (list) list.push(item); else map.set(key, [item]);
    }
    return Array.from(map.entries())
      .map(([category, items]) => ({ category, items, attention: items.filter(needsAttention).length }))
      .sort((a, b) => (b.attention > 0 ? 1 : 0) - (a.attention > 0 ? 1 : 0) || a.category.localeCompare(b.category));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);
  const isGroupOpen = (category: string, attention: number) =>
    openGroups[category] ?? (Boolean(search.trim()) || belowParOnly || attention > 0 || groupedItems.length <= 2);
  const toggleGroup = (category: string, attention: number) =>
    setOpenGroups((prev) => ({ ...prev, [category]: !isGroupOpen(category, attention) }));

  const stockLabel = (item: Inventory) => {`);

// Desktop body: one tbody per category with a header row.
rep(`                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filtered.map((i) => (`, `                    {groupedItems.map(({ category, items, attention }) => {
                      const open = isGroupOpen(category, attention);
                      return (
                    <tbody key={category} className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                      <tr className="bg-slate-50/80 dark:bg-slate-800/40">
                        <td colSpan={7} className="p-0">
                          <button
                            type="button"
                            onClick={() => toggleGroup(category, attention)}
                            aria-expanded={open}
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <ChevronDown aria-hidden="true" className={\`h-4 w-4 text-slate-400 transition-transform \${open ? "rotate-180" : ""}\`} />
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">{category}</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">{items.length}</span>
                            {attention > 0 && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">{attention} to restock</span>
                            )}
                          </button>
                        </td>
                      </tr>
                      {open && items.map((i) => (`);
rep(`                        </tr>
                      ))}
                    </tbody>
                  </table>`, `                        </tr>
                      ))}
                    </tbody>
                      );
                    })}
                  </table>`);
// Category column is now the group header.
rep(`                        <th className="px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1">Category <InfoTooltip content="Category used to group similar items together." /></span></th>\n`, ``);
rep(`                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{i.category ?? "--"}</td>\n`, ``);
s = s.replace(`<td colSpan={7} className="p-0">`, `<td colSpan={6} className="p-0">`);

// Wording + colour.
rep(`    return "bg-brand-primary/15 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30";
  };`, `    return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900";
  };`);
rep(`    if (stock <= min) return "Below par";`, `    if (stock <= min) return "At minimum";`);
s = s.split(' at or below par.`').join(' at or below their minimum.`');
s = s.split(', everything above par.`').join(', everything above its minimum.`');
s = s.split('`${stats.below} below par`').join('`${stats.below} at minimum`');
s = s.split('"All above par"').join('"All above minimum"');
s = s.split('Below par <InfoTooltip').join('At minimum <InfoTooltip');
s = s.split('out of stock, below par, or in stock.').join('out of stock, at its minimum, or in stock.');
s = s.split('Below par only').join('At minimum only');
s = s.split('turn off “Below par only”').join('turn off “At minimum only”');

if (!/\bChevronDown\b/.test(s.slice(0, s.indexOf('lucide-react') + 20))) {
  s = s.replace(/import \{([^}]*)\} from "lucide-react";/, (m, names) => `import {${names.replace(/,?\s*$/, '')}, ChevronDown } from "lucide-react";`);
}
fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
