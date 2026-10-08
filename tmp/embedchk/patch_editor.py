p = 'src/pages/admin/integrations/embed/[id].tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)


rep('''  // Push draft into the preview iframe whenever the form mutates.
  // The demo loader listens for postMessage with {type: 'embed-draft', config}.
  useEffect(() => {
    if (!form) return;
    const iframe = previewIframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage({ type: "embed-draft", config: form }, "*");
    } catch {
      // Same-origin only - the demo iframe lives on our own domain so this should not throw.
    }
  }, [form]);''', '''  // Push the unsaved draft into the preview iframe whenever the form
  // mutates. loader.js (preview mode) re-renders on {type:'embed-draft'}
  // and announces 'embed-preview-ready' once mounted, so the first draft
  // is also delivered after a (re)load. Same-origin target only.
  const formRef = useRef<EmbedFormConfig | null>(null);
  formRef.current = form;
  const postDraft = useCallback(() => {
    const iframe = previewIframeRef.current;
    const current = formRef.current;
    if (!iframe?.contentWindow || !current) return;
    try {
      iframe.contentWindow.postMessage({ type: "embed-draft", config: current }, window.location.origin);
    } catch {
      // Iframe still navigating; the ready message will trigger a resend.
    }
  }, []);
  useEffect(() => {
    if (form) postDraft();
  }, [form, postDraft]);
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type === "embed-preview-ready") postDraft();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [postDraft]);''')

rep('''  const previewSrc = useMemo(() => {
    if (!form || !companyData?.embed_token) return "";
    // LCF-H (task #229, 2026-05-25): pass tenant brand through so the
    // demo fallback shows real company name + colours when the API
    // path can't be hit.
    const qs = new URLSearchParams({
      token: companyData.embed_token,
      slug: form.slug,
      template: form.template_id,
      draft: "1",
    });
    if (companyData.company_name) qs.set("companyName", companyData.company_name);
    if (form.theme?.primary_color) qs.set("primary", form.theme.primary_color);
    else if (companyData.primary_color) qs.set("primary", companyData.primary_color);
    if (form.theme?.secondary_color) qs.set("secondary", form.theme.secondary_color);
    else if (companyData.secondary_color) qs.set("secondary", companyData.secondary_color);
    if (companyData.logo_url) qs.set("logoUrl", companyData.logo_url);
    if (companyData.currency) qs.set("currency", companyData.currency);
    return `/embed/demo.html?${qs.toString()}`;
  }, [form?.slug, form?.template_id, form?.theme?.primary_color, form?.theme?.secondary_color, companyData?.embed_token, companyData?.company_name, companyData?.primary_color, companyData?.secondary_color, companyData?.logo_url, companyData?.currency]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Force-reload key. The postMessage path below is the soft option,
  // but the demo page doesn't always re-render on draft messages
  // (helpers.js doesn't subscribe). Bumping this key on every config-
  // affecting change forces a fresh iframe and guarantees the
  // operator sees their edit reflected. We hash a few fields to keep
  // re-mounts to actual content changes (not unrelated re-renders).
  const previewKey = useMemo(() => {
    if (!form) return "blank";
    const themeStr = JSON.stringify(form.theme || {});
    const fieldsStr = (form.fields || [])
      .map((f: any) => `${f.id}:${f.type}:${f.required ? 1 : 0}:${f.label || ""}`)
      .join("|");
    return `${form.template_id}::${themeStr}::${fieldsStr}::${form.success_message || ""}::${form.redirect_url || ""}`;
  }, [form]);''', '''  // Preview renders the tenant's REAL form (hosted page in preview mode:
  // live fields, brand, catalogue, tiers; submissions are never sent).
  // Unsaved edits are layered on top via postDraft above. The previous
  // demo.html preview showed placeholder fields, not this form.
  // Keyed on the SAVED slug so typing in the slug box doesn't reload the
  // iframe (and 404) on every keystroke.
  const savedSlugRef = useRef<string>("");
  if (form && !dirty) savedSlugRef.current = form.slug;
  const savedSlug = savedSlugRef.current || form?.slug || "";
  const previewSrc = useMemo(() => {
    if (!savedSlug || !companyData?.embed_token) return "";
    const qs = new URLSearchParams({
      token: companyData.embed_token,
      slug: savedSlug,
      preview: "1",
      compact: "1",
    });
    return `/embed/form.html?${qs.toString()}`;
  }, [savedSlug, companyData?.embed_token]);
  // Full-page preview for "Open in new tab" (saved version, no chrome strip).
  const previewTabHref = previewSrc.replace("&compact=1", "");''')

rep('''                    {previewSrc && (
                      <Button asChild size="sm" variant="ghost" className="gap-1.5 h-8 text-xs">
                        <a href={previewSrc} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
                        </a>
                      </Button>
                    )}
                  </div>''', '''                    {previewSrc && (
                      <Button asChild size="sm" variant="ghost" className="gap-1.5 h-8 text-xs" title={dirty ? "Save first: the new tab shows the saved version" : "Open the saved form in a new tab"}>
                        <a href={previewTabHref} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
                        </a>
                      </Button>
                    )}
                  </div>
                  <p className="px-1 mb-2 text-[11px] text-slate-500">
                    Shows your edits instantly. Test submissions here are not saved as leads.
                  </p>''')

rep('''                      <iframe
                        key={previewKey}
                        ref={previewIframeRef}''', '''                      <iframe
                        ref={previewIframeRef}''')

# options editor: local text, parse on blur
rep('''  const [showAdvanced, setShowAdvanced] = useState(false);
  // Single-pick options for select/radio; multi-pick for checkboxes.''', '''  const [showAdvanced, setShowAdvanced] = useState(false);
  // Options are edited as free text and parsed on blur. Parsing on every
  // keystroke rewrote the textarea mid-typing ("Wedding" instantly became
  // "Wedding|Wedding") and swallowed the Enter key, so a second option
  // could not be added.
  const optionsToText = (opts: EmbedField["options"]) =>
    (opts || [])
      .map((o: any) => (typeof o === "string" ? o : o.label && o.label !== o.value ? `${o.label} | ${o.value}` : (o.label || o.value)))
      .join("\\n");
  const [optionsText, setOptionsText] = useState(() => optionsToText(field.options));
  const [editingOptions, setEditingOptions] = useState(false);
  useEffect(() => {
    if (!editingOptions) setOptionsText(optionsToText(field.options));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.options, editingOptions]);
  function commitOptions(text: string) {
    const used = new Set<string>();
    const opts = text
      .split("\\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        // "Label | value" or just "Label" (value derived from it).
        const [rawLabel, rawValue] = line.split("|").map((part) => part.trim());
        const label = rawLabel || rawValue || "";
        let value = rawValue || label;
        let n = 2;
        const base = value;
        while (used.has(value)) value = `${base} ${n++}`;
        used.add(value);
        return { value, label };
      })
      .filter((o) => o.label);
    onChange({ options: opts });
  }
  // Single-pick options for select/radio; multi-pick for checkboxes.''')

rep('''          {needsOptions && (
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-slate-500">Options (one per line, format: value|label)</Label>
              <Textarea
                value={(field.options || []).map((o) => `${o.value}|${o.label}`).join("\\n")}
                onChange={(e) => {
                  const opts = e.target.value.split("\\n").map((line) => {
                    const [value, label] = line.split("|").map((s) => s.trim());
                    return { value: value || "", label: label || value || "" };
                  }).filter((o) => o.value);
                  onChange({ options: opts });
                }}
                onBlur={onBlurSave}
                rows={3}
                className="text-xs font-mono mt-1"
              />
            </div>
          )}''', '''          {needsOptions && (
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-slate-500">Options (one per line)</Label>
              <Textarea
                value={optionsText}
                onFocus={() => setEditingOptions(true)}
                onChange={(e) => setOptionsText(e.target.value)}
                onBlur={(e) => {
                  setEditingOptions(false);
                  commitOptions(e.target.value);
                  // Let the options patch land before the save reads fields.
                  setTimeout(onBlurSave, 0);
                }}
                rows={Math.min(8, Math.max(3, optionsText.split("\\n").length + 1))}
                placeholder={"Wedding\\nCorporate function\\nBirthday party"}
                className="text-xs mt-1"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Visitors see each line as a choice. Optional: <span className="font-mono">Label | code</span> to save a different value.
              </p>
              {(field.options || []).length === 0 && !optionsText.trim() && (
                <p className="text-[10px] text-rose-600 mt-1">Add at least one option, otherwise visitors have nothing to choose.</p>
              )}
            </div>
          )}''')

# conditional value: dropdown of the parent's options
rep('''                    <Input
                      value={Array.isArray(field.conditional?.showIfValue) ? field.conditional?.showIfValue.join(",") : (field.conditional?.showIfValue || "")}
                      onChange={(e) => {
                        if (!field.conditional?.showIfFieldId) return;
                        onChange({ conditional: { showIfFieldId: field.conditional.showIfFieldId, showIfValue: e.target.value } });
                      }}
                      onBlur={onBlurSave}
                      placeholder="equals value"
                      className="h-8 text-xs"
                      disabled={!field.conditional?.showIfFieldId}
                    />''', '''                    {(() => {
                      // When the controlling field has choices, pick one of
                      // its real option values instead of typing a code
                      // that silently never matches.
                      const parent = otherFields.find((f) => f.id === field.conditional?.showIfFieldId);
                      const parentOptions = (parent?.options || []) as { value: string; label: string }[];
                      const current = Array.isArray(field.conditional?.showIfValue)
                        ? field.conditional?.showIfValue.join(",")
                        : (field.conditional?.showIfValue || "");
                      if (parent && parent.type === "checkbox") {
                        return (
                          <Select
                            value={current || "true"}
                            onValueChange={(v) => {
                              onChange({ conditional: { showIfFieldId: parent.id, showIfValue: v } });
                              setTimeout(onBlurSave, 0);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">is ticked</SelectItem>
                              <SelectItem value="false">is not ticked</SelectItem>
                            </SelectContent>
                          </Select>
                        );
                      }
                      if (parent && parentOptions.length > 0) {
                        return (
                          <Select
                            value={current || undefined}
                            onValueChange={(v) => {
                              onChange({ conditional: { showIfFieldId: parent.id, showIfValue: v } });
                              setTimeout(onBlurSave, 0);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="equals..." /></SelectTrigger>
                            <SelectContent>
                              {parentOptions.filter((o) => o.value).map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label || o.value}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      }
                      return (
                        <Input
                          value={current}
                          onChange={(e) => {
                            if (!field.conditional?.showIfFieldId) return;
                            onChange({ conditional: { showIfFieldId: field.conditional.showIfFieldId, showIfValue: e.target.value } });
                          }}
                          onBlur={onBlurSave}
                          placeholder="equals value"
                          className="h-8 text-xs"
                          disabled={!field.conditional?.showIfFieldId}
                        />
                      );
                    })()}''')

open(p, 'w', encoding='utf-8').write(s)
print('ok')
