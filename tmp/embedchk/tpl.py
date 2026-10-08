import re


def patch(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8').write(s)


BRANDBAR = """    if (brand && (brand.logoUrl || brand.companyName)) {
      var bar = h.el('div', { class: 'cms-brandbar' });
      if (brand.logoUrl) bar.appendChild(h.el('img', { src: brand.logoUrl, alt: brand.companyName || '' }));
      bar.appendChild(h.el('strong', { text: brand.companyName || '' }));
      form.appendChild(bar);
    }
"""

patch('public/embed/templates/quick-card.js', [
    ("""    '.cms-form{padding:20px;max-width:420px;margin:0 auto;border:1px solid #E5E7EB;box-shadow:0 1px 2px rgba(0,0,0,.04)}',
    '.cms-title{margin:0 0 4px;font-size:18px;font-weight:700}',
    '.cms-sub{margin:0 0 16px;font-size:14px;color:#6B7280}',
    '@media(max-width:380px){.cms-form{padding:16px}}'""",
     """    '.cms-form{padding:30px 28px 24px;max-width:560px;margin:0 auto}',
    '.cms-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}',
    '.cms-grid .cms-field.is-wide{grid-column:1/-1}',
    '.cms-btn{width:100%;margin-top:6px}',
    '@media(max-width:520px){.cms-form{padding:26px 18px 20px}.cms-grid{grid-template-columns:1fr}}'"""),
    (BRANDBAR, """    form.appendChild(h.buildHeader(brand, 'Catering enquiry'));
"""),
    ("""    var entries = [];
    fields.forEach(function (f) {""", """    var entries = [];
    // Two-column grid on desktop: short inputs pair up, long ones
    // (textarea, choices, pickers, address) span the full width.
    var grid = h.el('div', { class: 'cms-grid' });
    form.appendChild(grid);
    var WIDE = { textarea: 1, radio: 1, checkboxes: 1, checkbox: 1, multiselect: 1 };
    fields.forEach(function (f) {"""),
    ("""      wrap.appendChild(err);
      form.appendChild(wrap);
      entries.push({ field: f, input: input, errorEl: err, wrapper: wrap });""",
     """      wrap.appendChild(err);
      if (WIDE[f.type] || f.mapsTo === 'venue' || f.id === 'venue') wrap.classList.add('is-wide');
      grid.appendChild(wrap);
      entries.push({ field: f, input: input, errorEl: err, wrapper: wrap });"""),
    ("""    var btn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Send enquiry' });
    form.appendChild(btn);
""", """    var btn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Request my quote' });
    form.appendChild(btn);
    form.appendChild(h.buildTrustLine());
"""),
])

patch('public/embed/templates/detailed-multi-step.js', [
    ("""    '.cms-form{padding:24px;max-width:640px;margin:0 auto;border:1px solid #E5E7EB;background:var(--brand-bg,#fff)}',
    '.cms-progress{display:flex;gap:8px;margin-bottom:18px}',
    '.cms-progress-step{flex:1;height:6px;background:#E5E7EB;border-radius:999px;position:relative;overflow:hidden}',
    '.cms-progress-step.is-done,.cms-progress-step.is-active{background:var(--brand-primary,#0F172A)}',
    '.cms-step-labels{display:flex;justify-content:space-between;font-size:12px;color:#6B7280;margin:-10px 0 18px}',
    '.cms-step-labels span.is-active{color:var(--brand-primary,#0F172A);font-weight:600}',""",
     """    '.cms-form{padding:30px 28px 24px;max-width:680px;margin:0 auto;background:var(--brand-bg,#fff)}',
    '.cms-progress{display:flex;gap:8px;margin-bottom:10px}',
    '.cms-progress-step{flex:1;height:6px;background:#E2E8F0;border-radius:999px;position:relative;overflow:hidden;transition:background .25s}',
    '.cms-progress-step.is-done,.cms-progress-step.is-active{background:var(--brand-primary,#0F172A)}',
    '.cms-step-labels{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;color:#94A3B8;margin:0 0 22px}',
    '.cms-step-labels span{display:inline-flex;align-items:center;gap:6px}',
    '.cms-step-labels span b{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#E2E8F0;color:#64748B;font-size:11px}',
    '.cms-step-labels span.is-active{color:var(--brand-primary,#0F172A);font-weight:700}',
    '.cms-step-labels span.is-active b,.cms-step-labels span.is-done b{background:var(--brand-primary,#0F172A);color:#fff}',
    '.cms-step-actions .cms-btn{min-width:130px}',
    '@media(max-width:520px){.cms-form{padding:26px 18px 20px}}',"""),
    ("""    form.appendChild(h.el('h3', { class: 'cms-title', text: config.title || 'Tell us about your event' }));""",
     """    form.appendChild(h.buildHeader(brand, 'Event quote request'));
    form.appendChild(h.el('h3', { class: 'cms-title', text: config.title || 'Tell us about your event' }));"""),
    ("""    form.appendChild(h.el('p', { class: 'cms-sub', text: config.subtitle || 'Three quick steps. Takes about 90 seconds.' }));""",
     """    form.appendChild(h.el('p', { class: 'cms-sub', text: config.subtitle || (stepNames.length + ' quick steps. Takes about 90 seconds.') }));"""),
    ("""    var labels = h.el('div', { class: 'cms-step-labels' }, stepNames.map(function (name, i) {
      return h.el('span', { text: name, class: i === 0 ? 'is-active' : '' });
    }));""", """    var labels = h.el('div', { class: 'cms-step-labels' }, stepNames.map(function (name, i) {
      return h.el('span', { class: i === 0 ? 'is-active' : '' }, [h.el('b', { text: String(i + 1) }), name]);
    }));"""),
    ("""      Array.from(labels.children).forEach(function (sp, idx) {
        sp.classList.toggle('is-active', idx === i);
      });""", """      Array.from(labels.children).forEach(function (sp, idx) {
        sp.classList.toggle('is-active', idx === i);
        sp.classList.toggle('is-done', idx < i);
      });"""),
    ("""    var submitBtn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Send enquiry' });""",
     """    var submitBtn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Request my quote' });"""),
    ("""    form.appendChild(actions);
    host.appendChild(form);""", """    form.appendChild(actions);
    form.appendChild(h.buildTrustLine());
    host.appendChild(form);"""),
])

patch('public/embed/templates/pricing-calculator.js', [
    ("""    '.cms-form{padding:24px;max-width:680px;margin:0 auto;border:1px solid #E5E7EB;background:var(--brand-bg,#fff)}',
    '.cms-title{margin:0 0 4px;font-size:22px;font-weight:700}',
    '.cms-sub{margin:0 0 16px;font-size:14px;color:#6B7280}',
    '.cms-calc{padding:16px;border-radius:calc(var(--brand-radius,12px));background:#F8FAFC;margin-bottom:18px}',""",
     """    '.cms-form{padding:30px 28px 24px;max-width:700px;margin:0 auto;background:var(--brand-bg,#fff)}',
    '.cms-calc{padding:20px;border-radius:16px;background:linear-gradient(160deg,color-mix(in srgb,var(--brand-primary,#0F172A) 7%,#fff),#F8FAFC);border:1px solid color-mix(in srgb,var(--brand-primary,#0F172A) 14%,#E2E8F0);margin-bottom:22px}',
    '.cms-btn[type=submit]{width:100%;margin-top:6px}',
    '@media(max-width:520px){.cms-form{padding:26px 18px 20px}.cms-calc{padding:16px}}',"""),
    ("""    '.cms-tier{position:relative;border:1.5px solid #E5E7EB;border-radius:calc(var(--brand-radius,12px) - 2px);padding:12px;cursor:pointer;transition:border-color .15s,background .15s}',""",
     """    '.cms-tier{position:relative;border:1.5px solid #E2E8F0;background:#fff;border-radius:14px;padding:14px;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s,transform .15s}',
    '.cms-tier:hover{transform:translateY(-1px)}',"""),
    ("""    '.cms-tier.is-selected{border-color:var(--brand-primary,#0F172A);background:color-mix(in srgb,var(--brand-primary,#0F172A) 6%,transparent)}',""",
     """    '.cms-tier.is-selected{border-color:var(--brand-primary,#0F172A);background:color-mix(in srgb,var(--brand-primary,#0F172A) 6%,#fff);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand-primary,#0F172A) 12%,transparent)}',
    '.cms-tier.is-selected::after{content:"\\\\2713";position:absolute;top:10px;right:12px;width:20px;height:20px;border-radius:50%;background:var(--brand-primary,#0F172A);color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center}',"""),
    ("""    '.cms-estimate{font-size:24px;font-weight:700;color:var(--brand-primary,#0F172A);margin-top:2px;line-height:1.1}',""",
     """    '.cms-estimate{font-size:30px;font-weight:800;letter-spacing:-.02em;color:var(--brand-primary,#0F172A);margin-top:2px;line-height:1.1}',"""),
    (BRANDBAR, """    form.appendChild(h.buildHeader(brand, 'Instant price estimate'));
"""),
    ("""    var btn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Get a tailored quote' });
    form.appendChild(btn);""", """    var btn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Get my tailored quote' });
    form.appendChild(btn);
    form.appendChild(h.buildTrustLine());"""),
])
print('ok')
