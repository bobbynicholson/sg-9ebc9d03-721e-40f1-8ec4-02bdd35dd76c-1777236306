p = 'src/pages/admin/integrations/embed/[id].tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)


rep('''  Eye,
  Calculator,
} from "lucide-react";''', '''  Eye,
  Calculator,
  X,
  ListChecks,
} from "lucide-react";''')

# Remove the textarea state machinery from FieldEditor.
start = s.index('''  // Options are edited as free text and parsed on blur. Parsing on every''')
end = s.index('''  // Single-pick options for select/radio; multi-pick for checkboxes.''')
s = s[:start] + s[end:]

# Replace the textarea block with the new editor.
start = s.index('''          {needsOptions && (
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-slate-500">Options (one per line)</Label>''')
end = s.index('''          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}''')
s = s[:start] + '''          {needsOptions && (
            <OptionsEditor
              fieldType={field.type}
              options={(field.options || []) as EmbedFieldOptionLike[]}
              onChange={(options) => onChange({ options })}
              onCommit={() => setTimeout(onBlurSave, 0)}
            />
          )}

''' + s[end:]

# The component itself, placed before ColorRow.
rep('''function ColorRow({''', '''type EmbedFieldOptionLike = { value: string; label: string } | string;

interface OptionRow {
  key: number;
  label: string;
  /** Saved code. Kept stable once created so existing leads and
   *  "Show only if" rules keep matching when a label is reworded. */
  value: string;
  isNew: boolean;
}

let optionRowKey = 0;

function slugifyOption(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "option";
}

function toRows(options: EmbedFieldOptionLike[]): OptionRow[] {
  return options.map((o) => {
    const label = typeof o === "string" ? o : (o.label || o.value || "");
    const value = typeof o === "string" ? o : (o.value || o.label || "");
    return { key: ++optionRowKey, label, value, isNew: false };
  });
}

// Turn rows into saved options: blank rows dropped, new rows get a code
// from their label, codes kept unique.
function rowsToOptions(rows: OptionRow[]): { value: string; label: string }[] {
  const used = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const row of rows) {
    const label = row.label.trim();
    if (!label) continue;
    const base = row.isNew ? slugifyOption(label) : (row.value || slugifyOption(label));
    let value = base;
    let n = 2;
    while (used.has(value)) value = `${base}_${n++}`;
    used.add(value);
    out.push({ value, label });
  }
  return out;
}

/**
 * Choice editor for Dropdown / Option cards / Tick boxes. One row per
 * choice with what the visitor sees; codes are generated automatically.
 * Enter adds the next choice, pasting a list adds one row per line, and a
 * small preview shows how the question will look on the form.
 */
function OptionsEditor({
  fieldType, options, onChange, onCommit,
}: {
  fieldType: string;
  options: EmbedFieldOptionLike[];
  onChange: (options: { value: string; label: string }[]) => void;
  onCommit: () => void;
}) {
  const [rows, setRows] = useState<OptionRow[]>(() => {
    const initial = toRows(options);
    return initial.length > 0 ? initial : [{ key: ++optionRowKey, label: "", value: "", isNew: true }];
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const focusKeyRef = useRef<number | null>(null);
  const editingRef = useRef(false);

  // Follow outside changes (save response, undo) while not editing here.
  useEffect(() => {
    if (editingRef.current) return;
    const next = toRows(options);
    setRows(next.length > 0 ? next : [{ key: ++optionRowKey, label: "", value: "", isNew: true }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(options)]);

  useEffect(() => {
    if (focusKeyRef.current == null) return;
    const el = containerRef.current?.querySelector<HTMLInputElement>(`[data-option-key="${focusKeyRef.current}"]`);
    focusKeyRef.current = null;
    el?.focus();
  });

  function update(next: OptionRow[]) {
    setRows(next);
    onChange(rowsToOptions(next));
  }
  function addAfter(index: number, labels: string[] = [""]) {
    const fresh = labels.map((label) => ({ key: ++optionRowKey, label, value: "", isNew: true }));
    const next = [...rows.slice(0, index + 1), ...fresh, ...rows.slice(index + 1)];
    focusKeyRef.current = fresh[fresh.length - 1].key;
    update(next);
  }
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  }
  function remove(index: number) {
    const next = rows.filter((_, i) => i !== index);
    update(next.length > 0 ? next : [{ key: ++optionRowKey, label: "", value: "", isNew: true }]);
  }

  const filled = rows.filter((r) => r.label.trim());
  const labelsLower = filled.map((r) => r.label.trim().toLowerCase());
  const duplicates = new Set(labelsLower.filter((l, i) => labelsLower.indexOf(l) !== i));
  const kind = fieldType === "select" ? "Dropdown" : fieldType === "radio" ? "Option cards" : "Tick boxes";
  const pickHint = fieldType === "checkboxes" ? "Visitors can tick several." : "Visitors pick one.";

  return (
    <div
      ref={containerRef}
      className="rounded-lg border border-slate-200 bg-white p-3"
      onFocus={() => { editingRef.current = true; }}
      onBlur={(e) => {
        // Save once focus leaves the whole editor, not between rows.
        if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node | null)) {
          editingRef.current = false;
          onCommit();
        }
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <ListChecks className="h-3.5 w-3.5 text-brand-primary" /> Choices
          </p>
          <p className="text-[11px] text-slate-500">{kind}. {pickHint} Type each choice exactly as visitors should see it.</p>
        </div>
        <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          {filled.length} choice{filled.length === 1 ? "" : "s"}
        </span>
      </div>

      <ol className="space-y-1.5">
        {rows.map((row, i) => {
          const isDup = row.label.trim() && duplicates.has(row.label.trim().toLowerCase());
          return (
            <li key={row.key} className="group flex items-center gap-1.5">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-[11px] font-bold text-brand-primary">
                {i + 1}
              </span>
              <Input
                data-option-key={row.key}
                value={row.label}
                placeholder={i === 0 ? "e.g. Wedding" : "Next choice"}
                aria-label={`Choice ${i + 1}`}
                onChange={(e) => update(rows.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAfter(i);
                  } else if (e.key === "Backspace" && !row.label && rows.length > 1) {
                    e.preventDefault();
                    focusKeyRef.current = rows[Math.max(0, i - 1)].key;
                    remove(i);
                  }
                }}
                onPaste={(e) => {
                  // Pasting a list ("Wedding\\nBirthday\\n...") adds one row per line.
                  const text = e.clipboardData.getData("text");
                  if (!text.includes("\\n")) return;
                  e.preventDefault();
                  const lines = text.split(/\\r?\\n/).map((l) => l.split("|")[0].trim()).filter(Boolean);
                  if (lines.length === 0) return;
                  const [first, ...rest] = lines;
                  const withFirst = rows.map((r) => (r.key === row.key ? { ...r, label: row.label ? row.label : first } : r));
                  const extra = row.label ? lines : rest;
                  if (extra.length === 0) { update(withFirst); return; }
                  const fresh = extra.map((label) => ({ key: ++optionRowKey, label, value: "", isNew: true }));
                  focusKeyRef.current = fresh[fresh.length - 1].key;
                  update([...withFirst.slice(0, i + 1), ...fresh, ...withFirst.slice(i + 1)]);
                }}
                className={`h-8 text-sm ${isDup ? "border-amber-400 focus-visible:ring-amber-300" : ""}`}
              />
              <div className="flex flex-shrink-0 items-center opacity-60 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-rose-500 hover:text-rose-600" onClick={() => remove(i)} aria-label={`Remove choice ${i + 1}`}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => addAfter(rows.length - 1)}>
          <Plus className="h-3.5 w-3.5" /> Add choice
        </Button>
        <span className="text-[10px] text-slate-400">Enter adds the next choice · paste a list to add many</span>
      </div>

      {duplicates.size > 0 && (
        <p className="mt-2 text-[11px] text-amber-700">Two choices have the same text. Visitors won&apos;t be able to tell them apart.</p>
      )}
      {filled.length === 0 && (
        <p className="mt-2 text-[11px] text-rose-600">Add at least one choice, otherwise visitors have nothing to pick.</p>
      )}

      {filled.length > 0 && (
        <div className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50 p-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">How visitors see it</p>
          {fieldType === "select" ? (
            <div className="space-y-1">
              <div className="flex h-8 items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-400">
                Select an option <ChevronDown className="h-3.5 w-3.5" />
              </div>
              <div className="rounded-md border border-slate-200 bg-white py-1 shadow-sm">
                {filled.slice(0, 6).map((r) => (
                  <div key={r.key} className="px-2.5 py-1 text-xs text-slate-700">{r.label}</div>
                ))}
                {filled.length > 6 && <div className="px-2.5 py-1 text-[11px] text-slate-400">+{filled.length - 6} more</div>}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {filled.slice(0, 8).map((r) => (
                <span key={r.key} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                  <span className={`h-3 w-3 border border-slate-400 ${fieldType === "radio" ? "rounded-full" : "rounded-sm"}`} />
                  {r.label}
                </span>
              ))}
              {filled.length > 8 && <span className="px-1 py-1 text-[11px] text-slate-400">+{filled.length - 8} more</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ColorRow({''')

open(p, 'w', encoding='utf-8').write(s)
print('ok')
