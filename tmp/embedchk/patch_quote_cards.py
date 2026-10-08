p = 'src/pages/admin/quotes/new.tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)


rep('''                    const courseLines = menuItems.filter((l) => normLineCategory(l.category) === course.value);
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
                        </div>''', '''                    const courseLines = menuItems.filter((l) => normLineCategory(l.category) === course.value);
                    if (courseLines.length === 0) return null;
                    const courseTotal = courseLines.reduce((sum, l) => {
                      const q = l.pricingMode === "per_person"
                        ? (typeof l.quantity === "number" && l.quantity > 0 ? l.quantity : guestCount)
                        : l.pricingMode === "flat" ? 1 : l.quantity;
                      return sum + l.unitPrice * q * (1 - l.discountPct / 100);
                    }, 0);
                    return (
                      <div key={course.value} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                          <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            {COURSE_HEADINGS[course.value] || course.label}
                            <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-semibold text-brand-primary">{courseLines.length}</span>
                          </h4>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold tabular-nums text-slate-700">{fmtR(courseTotal)}</span>
                            <Button size="sm" className="h-7 rounded-full bg-brand-primary px-3 text-xs hover:bg-brand-primary/90" onClick={() => addLine(course.value)}>
                              <Plus className="w-3.5 h-3.5 mr-1" /> Add line
                            </Button>
                          </div>
                        </div>
                        <div className="divide-y divide-slate-100">''')

rep('''                    return (
                      <div key={line.id} className="p-3 sm:p-4 border border-slate-200 rounded-lg bg-slate-50">''',
    '''                    return (
                      <div key={line.id} className="p-3 sm:p-4">''')

rep('''                      </div>
                    );
                  })}
                      </div>
                    );
                  })}
                  {/* Quick-add for courses that have no lines yet. */}''', '''                      </div>
                    );
                  })}
                        </div>
                      </div>
                    );
                  })}
                  {/* Quick-add for courses that have no lines yet. */}''')

rep('''                        <span className="text-xs text-slate-500">Add a course:</span>''',
    '''                        <span className="text-xs font-medium text-slate-500">Add a course:</span>''')
open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
