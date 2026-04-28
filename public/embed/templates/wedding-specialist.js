/* wedding-specialist -- warm aesthetic, wedding-specific fields, dietary mix, styling checkbox. */
(function () {
  'use strict';
  window.__cmsTemplates = window.__cmsTemplates || {};

  var CSS = [
    '.cms-form{padding:30px;max-width:620px;margin:0 auto;background:linear-gradient(180deg,#FFF8F1 0%,var(--brand-bg,#fff) 80%);border-radius:calc(var(--brand-radius,12px) + 6px);box-shadow:0 8px 28px -10px rgba(120,80,40,.18)}',
    '.cms-eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--brand-secondary,#B8860B);margin:0 0 6px;font-weight:700}',
    '.cms-title{margin:0 0 6px;font-family:Georgia,"Cormorant Garamond",serif;font-size:28px;font-weight:500;color:var(--brand-text,#0F172A)}',
    '.cms-sub{margin:0 0 22px;font-size:14px;color:#6B7280}',
    '.cms-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '@media(max-width:520px){.cms-row{grid-template-columns:1fr}}',
    '.cms-section-title{font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#92400E;margin:18px 0 8px}',
    '.cms-checkbox-row{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;background:#FFFBEB;border-radius:8px;border:1px solid #FDE68A}',
    '.cms-checkbox-row input{margin-top:3px}',
    '.cms-dietary{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}',
    '.cms-dietary-item{display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid #E5E7EB;border-radius:8px;cursor:pointer;font-size:14px}',
    '.cms-dietary-item input{margin:0}',
    '.cms-dietary-item.is-checked{border-color:var(--brand-primary,#0F172A);background:color-mix(in srgb,var(--brand-primary,#0F172A) 5%,transparent)}'
  ].join('');

  var WEDDING_FIELDS = [
    { id: 'bride_name', type: 'text', label: 'Partner 1 name', required: true, autocomplete: 'given-name' },
    { id: 'groom_name', type: 'text', label: 'Partner 2 name', required: true, autocomplete: 'given-name' },
    { id: 'email', type: 'email', label: 'Email', required: true },
    { id: 'phone', type: 'phone', label: 'Phone', required: true },
    { id: 'wedding_date', type: 'date', label: 'Wedding date', required: true },
    { id: 'ceremony_time', type: 'time', label: 'Ceremony time', required: false },
    { id: 'reception_time', type: 'time', label: 'Reception time', required: false },
    { id: 'venue', type: 'text', label: 'Venue', required: false },
    { id: 'guests', type: 'number', label: 'Guest count', required: true, validation: { min: 2, max: 1000 } }
  ];
  var DIETARY = ['Vegetarian', 'Vegan', 'Halaal', 'Kosher', 'Gluten-free', 'Nut allergy'];

  function render(host, config, brand, h) {
    h.injectStyles(host, CSS);
    var configFields = (config.fields && config.fields.length) ? config.fields : WEDDING_FIELDS;
    var fields = configFields.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

    var form = h.el('form', { class: 'cms-form', novalidate: 'novalidate' });
    var alert = h.el('div', { class: 'cms-alert', hidden: 'hidden', role: 'alert' });
    form.appendChild(alert);
    if (brand && (brand.logoUrl || brand.companyName)) {
      var bar = h.el('div', { class: 'cms-brandbar' });
      if (brand.logoUrl) bar.appendChild(h.el('img', { src: brand.logoUrl, alt: brand.companyName || '' }));
      bar.appendChild(h.el('strong', { text: brand.companyName || '' }));
      form.appendChild(bar);
    }
    form.appendChild(h.el('p', { class: 'cms-eyebrow', text: 'Wedding catering enquiry' }));
    form.appendChild(h.el('h3', { class: 'cms-title', text: config.title || 'Your day, beautifully catered' }));
    form.appendChild(h.el('p', { class: 'cms-sub', text: config.subtitle || 'A few details so our wedding team can tailor a proposal.' }));

    var entries = [];
    function addPair(a, b) {
      var row = h.el('div', { class: 'cms-row' });
      [a, b].filter(Boolean).forEach(function (f) {
        var wrap = h.el('div', { class: 'cms-field', dataset: { fid: f.id } });
        var id = 'w_' + f.id;
        wrap.appendChild(h.el('label', { class: 'cms-label', for: id, text: f.label + (f.required ? ' *' : '') }));
        var input = h.buildStandardInput(f, id);
        var err = h.el('div', { class: 'cms-error', id: id + '_err', 'aria-live': 'polite' });
        wrap.appendChild(input); wrap.appendChild(err);
        row.appendChild(wrap);
        entries.push({ field: f, input: input, errorEl: err, wrapper: wrap });
      });
      form.appendChild(row);
    }
    addPair(findF('bride_name'), findF('groom_name'));
    addPair(findF('email'), findF('phone'));
    addPair(findF('wedding_date') || findF('event_date'), findF('venue'));
    addPair(findF('ceremony_time'), findF('reception_time'));
    addPair(findF('guests'), null);
    function findF(id) { return fields.find(function (f) { return f.id === id; }); }

    // Dietary mix multi-checkbox.
    form.appendChild(h.el('div', { class: 'cms-section-title', text: 'Dietary mix (optional)' }));
    var dietary = h.el('div', { class: 'cms-dietary' });
    var dietaryValues = [];
    DIETARY.forEach(function (d) {
      var lbl = h.el('label', { class: 'cms-dietary-item' });
      var cb = h.el('input', { type: 'checkbox', value: d });
      cb.addEventListener('change', function () {
        lbl.classList.toggle('is-checked', cb.checked);
        dietaryValues = Array.from(dietary.querySelectorAll('input:checked')).map(function (i) { return i.value; });
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(d));
      dietary.appendChild(lbl);
    });
    form.appendChild(dietary);

    // Styling checkbox.
    var stylingWrap = h.el('label', { class: 'cms-checkbox-row' });
    var stylingCb = h.el('input', { type: 'checkbox' });
    stylingWrap.appendChild(stylingCb);
    stylingWrap.appendChild(h.el('span', { text: 'Yes, I would like full event styling (florals, table settings, decor).' }));
    form.appendChild(h.el('div', { class: 'cms-section-title', text: 'Styling' }));
    form.appendChild(stylingWrap);

    form.appendChild(h.buildHoneypot());
    var tslot = h.el('div', { class: 'cms-turnstile' }); form.appendChild(tslot);
    var btn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Send our wedding team' });
    btn.style.marginTop = '18px';
    form.appendChild(btn);
    host.appendChild(form);

    var token = null;
    if (config.turnstileSiteKey) h.mountTurnstile(host, tslot, config.turnstileSiteKey, function (t) { token = t; });
    h.bindFormRunner(host, form, fields, entries, h, {
      alertEl: alert, button: btn, config: config,
      getTurnstileToken: function () { return token; },
      extraValues: function () { return { dietary: dietaryValues, full_styling: stylingCb.checked }; }
    });
  }
  window.__cmsTemplates['wedding-specialist'] = { render: render };
})();
