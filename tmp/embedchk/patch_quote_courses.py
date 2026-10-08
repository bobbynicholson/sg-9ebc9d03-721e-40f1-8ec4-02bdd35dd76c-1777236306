p = 'src/pages/admin/quotes/new.tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)


rep('''const PRICING_LABEL: Record<PricingMode, string> = {''', '''// Course headings for the grouped menu-lines view, in serving order.
const COURSE_HEADINGS: Record<string, string> = {
  starter: "Starters",
  main: "Mains",
  side: "Sides",
  salad: "Salads",
  dessert: "Desserts",
  beverage: "Beverages",
  other: "Other",
};

// Catalogue categories arrive as "Mains", "Starters", "Salads"... (and
// lines from website forms keep them). Map them onto the line-category
// enum so each line lands under the right course.
function normLineCategory(raw: string | null | undefined): string {
  const c = String(raw || "").toLowerCase().trim();
  if (!c) return "main";
  if (LINE_CATEGORIES.some((x) => x.value === c)) return c;
  if (/^(starter|appeti[sz]er|canape)/.test(c)) return "starter";
  if (/^main/.test(c)) return "main";
  if (/^side/.test(c)) return "side";
  if (/^salad/.test(c)) return "salad";
  if (/^(dessert|pudding|sweet)/.test(c)) return "dessert";
  if (/^(beverage|drink)/.test(c)) return "beverage";
  return "other";
}

const PRICING_LABEL: Record<PricingMode, string> = {''')

rep('''  const addLine = () =>
    setMenuItems((prev) => [
      ...prev,
      {
        id: `L_${Date.now()}`,
        menu_item_id: null,
        name: "",
        category: "main",''', '''  const addLine = (category: string = "main") =>
    setMenuItems((prev) => [
      ...prev,
      {
        id: `L_${Date.now()}`,
        menu_item_id: null,
        name: "",
        category,''')

rep('''                    <Button size="sm" variant="outline" onClick={addLine}>
                      <Plus className="w-4 h-4 mr-1" /> Add line
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {menuItems.map((line, idx) => {''', '''                    <Button size="sm" variant="outline" onClick={() => addLine()}>
                      <Plus className="w-4 h-4 mr-1" /> Add line
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Lines grouped by course (Starters, Mains, Sides,
                      Salads, Desserts...) with an Add line per course,
                      matching the website quote form. */}
                  {LINE_CATEGORIES.map((course) => {
                    const courseLines = menuItems.filter((l) => normLineCategory(l.category) === course.value);
                    if (courseLines.length === 0) return null;
                    return (
                      <div key={course.value} className="space-y-2">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
                          <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                            {COURSE_HEADINGS[course.value] || course.label}
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{courseLines.length}</span>
                          </h4>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-brand-primary" onClick={() => addLine(course.value)}>
                            <Plus className="w-3.5 h-3.5 mr-1" /> Add {course.label.toLowerCase()} line
                          </Button>
                        </div>
                  {courseLines.map((line) => {
                    const idx = menuItems.indexOf(line);''')

# Close the per-course wrapper after the line map.
rep('''                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Equipment */}''', '''                      </div>
                    );
                  })}
                      </div>
                    );
                  })}
                  {/* Quick-add for courses that have no lines yet. */}
                  {(() => {
                    const empty = LINE_CATEGORIES.filter((c) => !menuItems.some((l) => normLineCategory(l.category) === c.value));
                    if (empty.length === 0) return null;
                    return (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-xs text-slate-500">Add a course:</span>
                        {empty.map((c) => (
                          <Button key={c.value} size="sm" variant="outline" className="h-7 text-xs" onClick={() => addLine(c.value)}>
                            <Plus className="w-3 h-3 mr-1" /> {COURSE_HEADINGS[c.value] || c.label}
                          </Button>
                        ))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Equipment */}''')

rep('''                              <select
                                value={line.category || "main"}
                                onChange={(e) => updateLine(line.id, { category: e.target.value })}''', '''                              <select
                                value={normLineCategory(line.category)}
                                onChange={(e) => updateLine(line.id, { category: e.target.value })}''')

open(p, 'w', encoding='utf-8').write(s)
print('ok')
