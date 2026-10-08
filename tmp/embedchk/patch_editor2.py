p = 'src/pages/admin/integrations/embed/[id].tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)


rep('''const FIELD_TYPES: { value: EmbedFieldType; label: string }[] = [''',
'''// What the visitor sees for each question type, shown under the type
// picker so the choice is clear without trying it in the preview.
const FIELD_TYPE_HINTS: Record<string, string> = {
  text: "A one-line answer, e.g. a name or venue.",
  email: "An email address. Checked for a valid format.",
  phone: "A phone or WhatsApp number.",
  number: "A number, e.g. guest count or budget.",
  date: "A date picker. Past dates are blocked.",
  time: "A time picker, e.g. serving time.",
  textarea: "A larger box for longer answers.",
  select: "A dropdown: the visitor picks one option.",
  radio: "Option cards: the visitor picks one.",
  checkbox: "One tick box (the placeholder is its text, e.g. \\"I agree to the terms\\").",
  checkboxes: "Tick boxes: the visitor can pick several.",
  tier: "Pricing tiers from the Pricing tiers panel.",
};

const FIELD_TYPES: { value: EmbedFieldType; label: string }[] = [''')

# Highlight helper for checklist jumps
rep('''  const templateMeta = useMemo(''', '''  // Scroll to a section and briefly ring it so it's obvious where to look.
  function jumpTo(anchor: string) {
    const el = document.getElementById(anchor);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-amber-400", "ring-offset-2", "rounded-xl");
    window.setTimeout(() => el.classList.remove("ring-2", "ring-amber-400", "ring-offset-2", "rounded-xl"), 1800);
  }

  const templateMeta = useMemo(''')

rep('''                <Button
                  variant="outline"
                  onClick={() => setSnippetOpen(true)}
                  className="gap-2"
                  title={readiness.ready ? "Copy embed snippet" : "Form has setup gaps - tap the checklist below first"}
                >
                  <Code2 className="w-4 h-4" /> Get snippet
                </Button>
                <Button
                  onClick={() => saveForm(form)}
                  disabled={saving || !dirty}
                  className="gap-2 bg-brand-primary hover:bg-brand-primary/90"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </Button>''', '''                <Button
                  variant="outline"
                  onClick={() => saveForm(form)}
                  disabled={saving || !dirty}
                  className="gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {dirty ? "Save changes" : "Saved"}
                </Button>
                <Button
                  onClick={async () => {
                    // Publish what's on screen: save first so the link and
                    // snippet serve exactly what the preview shows.
                    if (dirty) await saveForm(form, { silent: true });
                    setSnippetOpen(true);
                  }}
                  className="gap-2 bg-brand-primary hover:bg-brand-primary/90"
                  title={readiness.ready ? "Get the shareable link and website snippet" : "Fix the required items in the checklist first"}
                >
                  <Code2 className="w-4 h-4" /> Publish &amp; get link
                </Button>''')

# Guide strip before the checklist
rep('''          {/* LCF-B (task #223, 2026-05-25): per-template setup
              checklist.''', '''          {/* How-it-works guide: the three things an operator does here,
              each with its live status, so the page reads as a flow. */}
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              {
                n: 1,
                title: "Set up your questions",
                body: "Left column: edit labels, choose the answer type, mark required. Add or remove questions.",
                status: readiness.ready ? "Ready" : `${readiness.failingRequired} to fix`,
                ok: readiness.ready,
                onClick: () => jumpTo("section-fields"),
              },
              {
                n: 2,
                title: "Try it in the preview",
                body: "Middle column shows the real form and updates as you type. Test submissions there are not saved.",
                status: dirty ? "Unsaved edits" : "Up to date",
                ok: !dirty,
                onClick: () => jumpTo("section-preview"),
              },
              {
                n: 3,
                title: "Publish",
                body: "Copy the shareable link (any website button, WhatsApp, QR) or the snippet. Every submission lands in Leads.",
                status: form.is_active ? "Live" : "Paused",
                ok: form.is_active,
                onClick: async () => {
                  if (dirty) await saveForm(form, { silent: true });
                  setSnippetOpen(true);
                },
              },
            ].map((step) => (
              <button
                key={step.n}
                type="button"
                onClick={step.onClick}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-brand-primary/50 hover:shadow dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white">
                  {step.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{step.title}</span>
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${step.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                      {step.status}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{step.body}</span>
                </span>
              </button>
            ))}
          </div>

          {/* LCF-B (task #223, 2026-05-25): per-template setup
              checklist.''')

rep('''                            onClick={() => {
                              if (!c.anchor) return;
                              const el = document.getElementById(c.anchor);
                              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}''', '''                            onClick={() => { if (c.anchor) jumpTo(c.anchor); }}''')

rep('''                            {isRequired && (
                              <Badge className="bg-rose-600 text-white text-[10px] flex-shrink-0">Required</Badge>
                            )}''', '''                            <span className="flex flex-shrink-0 flex-col items-end gap-1">
                              {isRequired && (
                                <Badge className="bg-rose-600 text-white text-[10px]">Required</Badge>
                              )}
                              {c.anchor && <span className="text-[11px] font-semibold underline underline-offset-2">Fix →</span>}
                            </span>''')

rep('''            {/* Middle: live preview */}
            <div className="lg:col-span-5">''', '''            {/* Middle: live preview */}
            <div id="section-preview" className="lg:col-span-5 scroll-mt-20">''')

rep('''                    <h3 className="font-bold text-slate-900">Fields</h3>''', '''                    <div>
                      <h3 className="font-bold text-slate-900">Questions</h3>
                      <p className="text-[11px] text-slate-500">What visitors fill in, top to bottom.</p>
                    </div>''')

# type hint + mapping hint in FieldEditor
rep('''          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Switch checked={field.required} onCheckedChange={(v) => onChange({ required: v })} />''', '''          {FIELD_TYPE_HINTS[field.type] && (
            <p className="-mt-1 text-[11px] text-slate-500">{FIELD_TYPE_HINTS[field.type]}</p>
          )}
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Switch checked={field.required} onCheckedChange={(v) => onChange({ required: v })} />''')

rep('''                <Label className="text-[10px] uppercase tracking-wide text-slate-500">Maps to lead column</Label>''',
    '''                <Label className="text-[10px] uppercase tracking-wide text-slate-500">Maps to lead column</Label>
                <p className="text-[10px] text-slate-500">Where the answer goes on the lead. &quot;No mapping&quot; still keeps it: it&apos;s added to the lead notes.</p>''')

open(p, 'w', encoding='utf-8').write(s)
print('ok')
