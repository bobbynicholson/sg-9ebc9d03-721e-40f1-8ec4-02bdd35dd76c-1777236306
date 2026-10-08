p = 'src/components/admin/orders/OrderDetailsModal.tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (a[:70], s.count(a))
    s = s.replace(a, b)


rep('''import { toLocalISO } from "@/lib/localDate";''', '''import { toLocalISO } from "@/lib/localDate";
import { groupByCourse, groupByCategory } from "@/lib/menuCourses";''')

# Equipment bookings also bring their category (for grouping).
rep('''equipment:equipment!equipment_bookings_equipment_id_fkey(name, rental_price)")''',
    '''equipment:equipment!equipment_bookings_equipment_id_fkey(name, rental_price, category)")''', count=2)

# ---- Menu tab: table -> course cards
start = s.index('''              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-2">Item</th>''')
end = s.index('''            {!editMode && orderItemsRaw.length > 0 && (''')
menu_new = '''              // Grouped by course (Starters, Mains, Sides...), the same
              // way the quote builder and website quote form show them.
              (() => {
                const categoryFor = (it: any) => {
                  // Source-of-truth order: the joined menu_item category,
                  // then a name-match against the live menu catalog
                  // (recovers legacy lines with no menu_item_id), then the
                  // stored description (may hold the old "appetizer").
                  const nameKey = String(it.item_name || "").toLowerCase().trim();
                  return it.menu_item?.category
                    || (nameKey && menuCategoryByName.has(nameKey) ? menuCategoryByName.get(nameKey) : null)
                    || it.description
                    || null;
                };
                const lineTotal = (it: any) => Number(it.line_total || (Number(it.quantity || 0) * Number(it.unit_price || 0)));
                const money = (n: number) => `${C}${n.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;
                const groups = groupByCourse(orderItemsRaw as any[], categoryFor);
                return (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {groups.map((g) => (
                      <div key={g.course} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            {g.heading}
                            <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-semibold text-brand-primary">{g.items.length}</span>
                          </span>
                          <span className="text-xs font-semibold tabular-nums text-slate-700">
                            {money(g.items.reduce((sum: number, it: any) => sum + lineTotal(it), 0))}
                          </span>
                        </div>
                        <ul className="divide-y divide-slate-100">
                          {g.items.map((it: any) => (
                            <li key={it.id} className="flex items-start gap-3 px-3 py-2.5">
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-slate-900">{it.item_name || "(unnamed)"}</div>
                                <div className="mt-0.5 text-xs tabular-nums text-slate-500">
                                  {it.quantity ?? "-"} × {money(Number(it.unit_price || 0))}
                                </div>
                                {it.special_instructions && (
                                  <div className="mt-0.5 text-xs text-amber-700">Note: {it.special_instructions}</div>
                                )}
                              </div>
                              <div className="text-sm font-semibold tabular-nums text-slate-900">{money(lineTotal(it))}</div>
                              {editMode && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-800"
                                  onClick={() => handleRemoveMenuItem(it.id)}
                                  disabled={miRemoving === it.id}
                                  title="Remove from order"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}

'''
s = s[:start] + menu_new + s[end:]

# ---- Equipment tab: bookings table -> category cards
start = s.index('''              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-2">Equipment</th>
                      <th className="text-right px-3 py-2 w-16">Qty</th>
                      <th className="text-left px-3 py-2 w-32">Status</th>''')
end = s.index('''            {/* Footer link out - for the rare case where the operator''')
eq_new = '''              // Grouped by equipment type (Crockery, Cutlery...).
              (() => {
                const eqOf = (b: any) => (b.equipment && (Array.isArray(b.equipment) ? b.equipment[0] : b.equipment)) || {};
                const groups = groupByCategory(equipmentBookings as any[], (b: any) => eqOf(b).category);
                return (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {groups.map((g) => (
                      <div key={g.heading} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            {g.heading}
                            <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-semibold text-brand-primary">{g.items.length}</span>
                          </span>
                          <span className="text-xs text-slate-500 tabular-nums">
                            {g.items.reduce((sum: number, b: any) => sum + Number(b.quantity || 0), 0)} pieces
                          </span>
                        </div>
                        <ul className="divide-y divide-slate-100">
                          {g.items.map((b: any) => {
                            const window = b.booked_from && b.booked_until
                              ? `${new Date(b.booked_from).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} → ${new Date(b.booked_until).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`
                              : null;
                            return (
                              <li key={b.id} className="flex items-center gap-3 px-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-slate-900">{eqOf(b).name || "(equipment)"}</div>
                                  {window && <div className="mt-0.5 text-xs text-slate-500">{window}</div>}
                                </div>
                                <span className="text-sm font-semibold tabular-nums text-slate-900">× {b.quantity ?? "-"}</span>
                                <Badge variant="outline" className="capitalize">{b.status || "booked"}</Badge>
                                {editMode && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-800"
                                    onClick={() => handleRemoveEquipment(b.id)}
                                    disabled={eqRemoving === b.id}
                                    title="Remove from order"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}

'''
s = s[:start] + eq_new + s[end:]
open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
