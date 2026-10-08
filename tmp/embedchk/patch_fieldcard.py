p = 'src/pages/admin/integrations/embed/[id].tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)


rep('''  X,
  ListChecks,
} from "lucide-react";''', '''  X,
  ListChecks,
  Type as TypeIcon,
  Mail,
  Phone,
  Hash,
  CalendarDays,
  Clock,
  AlignLeft,
  ChevronsUpDown,
  CircleDot,
  SquareCheck,
  BadgeDollarSign,
  EyeOff,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";''')

# Visual metadata per type, next to FIELD_TYPE_HINTS.
rep('''const FIELD_TYPES: { value: EmbedFieldType; label: string }[] = [''', '''// Icon + colour per question type for the editor cards and type picker.
const FIELD_TYPE_META: Record<string, { icon: LucideIcon; tone: string; label: string }> = {
  text:       { icon: TypeIcon,        tone: "bg-sky-50 text-sky-700 ring-sky-200",             label: "Short answer" },
  email:      { icon: Mail,            tone: "bg-indigo-50 text-indigo-700 ring-indigo-200",    label: "Email" },
  phone:      { icon: Phone,           tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Phone" },
  number:     { icon: Hash,            tone: "bg-amber-50 text-amber-700 ring-amber-200",       label: "Number" },
  date:       { icon: CalendarDays,    tone: "bg-rose-50 text-rose-700 ring-rose-200",          label: "Date" },
  time:       { icon: Clock,           tone: "bg-orange-50 text-orange-700 ring-orange-200",    label: "Time" },
  textarea:   { icon: AlignLeft,       tone: "bg-slate-100 text-slate-700 ring-slate-200",      label: "Long answer" },
  select:     { icon: ChevronsUpDown,  tone: "bg-violet-50 text-violet-700 ring-violet-200",    label: "Dropdown" },
  radio:      { icon: CircleDot,       tone: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200", label: "Option cards" },
  checkbox:   { icon: SquareCheck,     tone: "bg-teal-50 text-teal-700 ring-teal-200",          label: "Single tick box" },
  checkboxes: { icon: ListChecks,      tone: "bg-cyan-50 text-cyan-700 ring-cyan-200",          label: "Tick boxes" },
  tier:       { icon: BadgeDollarSign, tone: "bg-lime-50 text-lime-700 ring-lime-200",          label: "Pricing tier" },
};

const FIELD_TYPES: { value: EmbedFieldType; label: string }[] = [''')

# Pass the question number in.
rep('''                    <FieldEditor
                      key={field.id + idx}
                      field={field}''', '''                    <FieldEditor
                      key={field.id + idx}
                      position={idx + 1}
                      field={field}''')

# Replace the FieldEditor head (signature through the "Show advanced" toggle).
start = s.index('''function FieldEditor({''')
end = s.index('''          {showAdvanced && (''', start)
new_head = '''function FieldEditor({
  field, position, otherFields, templateId, isFirst, isLast,
  onChange, onBlurSave, onMoveUp, onMoveDown, onRemove,
}: {
  field: EmbedField;
  position: number;
  otherFields: EmbedField[];
  templateId: string;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<EmbedField>) => void;
  onBlurSave: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Collapsed cards keep a 12-question form scannable; a freshly added
  // question opens straight away.
  const [open, setOpen] = useState(field.label === "New field");
  // Single-pick options for select/radio; multi-pick for checkboxes.
  const needsOptions =
    field.type === "select" ||
    field.type === "radio" ||
    field.type === "checkboxes";
  // detailed-multi-step puts fields onto numbered pages. We expose
  // the page selector only there; other templates ignore the value.
  const supportsSteps = templateId === "detailed-multi-step";
  const fieldStep = (field as any).step;
  const meta = FIELD_TYPE_META[field.type] || FIELD_TYPE_META.text;
  const Icon = meta.icon;
  const optionCount = (field.options || []).length;
  const rules = (field.validation || {}) as { min?: number; max?: number };

  // Toggles and pickers are discrete choices: apply and save at once.
  const changeAndSave = (patch: Partial<EmbedField>) => {
    onChange(patch);
    setTimeout(onBlurSave, 0);
  };

  const summary = [
    meta.label,
    needsOptions ? `${optionCount} choice${optionCount === 1 ? "" : "s"}` : null,
    field.type === "number" && (rules.min !== undefined || rules.max !== undefined)
      ? `${rules.min ?? "any"} to ${rules.max ?? "any"}`
      : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className={`rounded-xl border bg-white shadow-sm transition ${open ? "border-brand-primary/40 ring-1 ring-brand-primary/15" : "border-slate-200 hover:border-slate-300"} ${field.visible === false ? "opacity-70" : ""}`}>
      {/* Header: always visible summary of the question. */}
      <div className="flex items-center gap-2 p-2.5">
        <div className="flex flex-col">
          <Button size="icon" variant="ghost" disabled={isFirst} onClick={onMoveUp} className="h-5 w-6" aria-label="Move question up">
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" disabled={isLast} onClick={onMoveDown} className="h-5 w-6" aria-label="Move question down">
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          aria-expanded={open}
        >
          <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ring-1 ${meta.tone}`}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-slate-400">Q{position}</span>
              <span className="truncate text-sm font-semibold text-slate-900">{field.label || "Untitled question"}</span>
              {field.required && <span className="text-xs font-bold text-rose-500" title="Required">*</span>}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
              {summary}
              {field.visible === false && (
                <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 text-[10px] text-slate-600">
                  <EyeOff className="h-3 w-3" /> Hidden
                </span>
              )}
            </span>
          </span>
          <ChevronRight className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <Button size="icon" variant="ghost" onClick={onRemove} className="h-7 w-7 flex-shrink-0 text-rose-500 hover:text-rose-600" aria-label="Delete question">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-slate-100 p-3">
          {/* 1. The question */}
          <div>
            <Label className="text-[11px] font-semibold text-slate-700">Question</Label>
            <Input
              value={field.label}
              onChange={(e) => onChange({ label: e.target.value })}
              onBlur={onBlurSave}
              placeholder="e.g. What type of event is it?"
              className="mt-1 h-9 text-sm font-medium"
            />
          </div>

          {/* 2. Answer type, with icon + plain-English hint */}
          <div>
            <Label className="text-[11px] font-semibold text-slate-700">Answer type</Label>
            <Select value={field.type} onValueChange={(v) => changeAndSave({ type: v as EmbedFieldType })}>
              <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => {
                  const m = FIELD_TYPE_META[t.value] || FIELD_TYPE_META.text;
                  const TIcon = m.icon;
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <span className={`flex h-5 w-5 items-center justify-center rounded ring-1 ${m.tone}`}><TIcon className="h-3 w-3" /></span>
                        {m.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {FIELD_TYPE_HINTS[field.type] && (
              <p className="mt-1 text-[11px] text-slate-500">{FIELD_TYPE_HINTS[field.type]}</p>
            )}
          </div>

          {/* 3. Settings that depend on the type */}
          {needsOptions && (
            <OptionsEditor
              fieldType={field.type}
              options={(field.options || []) as EmbedFieldOptionLike[]}
              onChange={(options) => onChange({ options })}
              onCommit={() => setTimeout(onBlurSave, 0)}
            />
          )}

          {["text", "email", "phone", "number", "textarea", "time"].includes(field.type) && (
            <div>
              <Label className="text-[11px] font-semibold text-slate-700">Hint text inside the box <span className="font-normal text-slate-400">(optional)</span></Label>
              <Input
                value={field.placeholder || ""}
                onChange={(e) => onChange({ placeholder: e.target.value })}
                onBlur={onBlurSave}
                placeholder={field.type === "email" ? "e.g. you@example.com" : field.type === "phone" ? "e.g. +27 82 123 4567" : field.type === "number" ? "e.g. 50" : "e.g. Street, suburb, city"}
                className="mt-1 h-8 text-xs"
              />
            </div>
          )}

          {field.type === "number" && (
            <div className="grid grid-cols-2 gap-2">
              {(["min", "max"] as const).map((k) => (
                <div key={k}>
                  <Label className="text-[11px] font-semibold text-slate-700">{k === "min" ? "Lowest allowed" : "Highest allowed"}</Label>
                  <Input
                    type="number"
                    value={rules[k] ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const next = { ...(field.validation || {}) } as Record<string, unknown>;
                      if (raw === "") delete next[k];
                      else next[k] = Number(raw);
                      onChange({ validation: next as EmbedField["validation"] });
                    }}
                    onBlur={onBlurSave}
                    placeholder={k === "min" ? "No minimum" : "No maximum"}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              ))}
            </div>
          )}

          {field.type === "checkbox" && (
            <div>
              <Label className="text-[11px] font-semibold text-slate-700">Text next to the tick box</Label>
              <Input
                value={field.placeholder || ""}
                onChange={(e) => onChange({ placeholder: e.target.value })}
                onBlur={onBlurSave}
                placeholder="e.g. I agree to the terms and conditions"
                className="mt-1 h-8 text-xs"
              />
            </div>
          )}

          {field.type === "tier" && (
            <p className="rounded-md bg-lime-50 px-2.5 py-2 text-[11px] text-lime-800">
              Choices come from the <strong>Pricing tiers</strong> panel on the right, so prices stay in one place.
            </p>
          )}

          {!needsOptions && <FieldPreview field={field} />}

          {/* 4. Required / visible */}
          <div className="flex flex-wrap items-center gap-2">
            <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${field.required ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 text-slate-600"}`}>
              <Switch checked={field.required} onCheckedChange={(v) => changeAndSave({ required: v })} />
              {field.required ? "Required" : "Optional"}
            </label>
            <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${field.visible ? "border-slate-200 text-slate-600" : "border-slate-300 bg-slate-100 text-slate-700"}`}>
              <Switch checked={field.visible} onCheckedChange={(v) => changeAndSave({ visible: v })} />
              {field.visible ? "Shown on form" : "Hidden"}
            </label>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="text-[11px] font-medium text-brand-primary hover:underline"
          >
            {showAdvanced ? "Hide advanced settings" : "Advanced: where it's saved, show only if..."}
          </button>

'''
s = s[:start] + new_head + s[end:]

# Close the extra {open && (<div>...)} wrapper: the old card ended with the
# advanced block, then </div> (inner column), the trash button, </div> (row), </div> (card).
old_tail = '''          )}
        </div>
        <Button size="icon" variant="ghost" onClick={onRemove} className="h-6 w-6 text-rose-500 hover:text-rose-600">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}'''
rep(old_tail, '''          )}
        </div>
      )}
    </div>
  );
}

// Small "How visitors see it" mock for non-choice questions.
function FieldPreview({ field }: { field: EmbedField }) {
  const box = "flex h-8 items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-400";
  let control: React.ReactNode;
  switch (field.type) {
    case "textarea":
      control = <div className="h-14 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-400">{field.placeholder || "Longer answer..."}</div>;
      break;
    case "date":
      control = <div className={box}>dd / mm / yyyy <CalendarDays className="h-3.5 w-3.5" /></div>;
      break;
    case "time":
      control = <div className={box}>-- : -- <Clock className="h-3.5 w-3.5" /></div>;
      break;
    case "checkbox":
      control = (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
          <span className="h-3.5 w-3.5 rounded-sm border border-slate-400" />
          {field.placeholder || "Yes"}
        </div>
      );
      break;
    case "tier":
      control = <div className={box}>Select an option <ChevronsUpDown className="h-3.5 w-3.5" /></div>;
      break;
    default:
      control = <div className={box}>{field.placeholder || ""}&nbsp;</div>;
  }
  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">How visitors see it</p>
      <p className="mb-1 text-xs font-semibold text-slate-700">
        {field.label || "Untitled question"}{field.required && <span className="text-rose-500"> *</span>}
      </p>
      {control}
    </div>
  );
}''')

open(p, 'w', encoding='utf-8').write(s)
print('ok')
