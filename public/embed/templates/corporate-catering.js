/* corporate-catering -- B2B fields, recurring frequency, 4 corporate-friendly tier cards. */
(function () {
  'use strict';
  window.__cmsTemplates = window.__cmsTemplates || {};

  var CSS = [
    '.cms-form{padding:26px;max-width:720px;margin:0 auto;border:1px solid #E5E7EB;background:var(--brand-bg,#fff)}',
    '.cms-title{margin:0 0 4px;font-size:22px;font-weight:700;letter-spacing:-.01em}',
    '.cms-sub{margin:0 0 18px;font-size:14px;color:#6B7280}',
    '.cms-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '@media(max-width:560px){.cms-row{grid-template-columns:1fr}}',
    '.cms-section-title{font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#475569;margin:18px 0 10px;padding-top:12px;border-top:1px solid #F1F5F9}',
    '.cms-tier-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:6px}',
    '.cms-tier{position:relative;border:1.5px solid #E5E7EB;border-radius:calc(var(--brand-radius,12px) - 2px);padding:14px;cursor:pointer;display:block;transition:border-color .15s,background .15s}',
    '.cms-tier input{position:absolute;opacity:0;pointer-events:none}',
    '.cms-tier:hover{border-color:#94A3B8}',
    '.cms-tier.is-selected{border-color:var(--brand-primary,#0F172A);background:color-mix(in srgb,var(--brand-primary,#0F172A) 6%,transparent)}',
    '.cms-tier-name{font-weight:700;font-size:15px;margin-bottom:2px}',
    '.cms-tier-desc{font-size:12px;color:#6B7280;line-height:1.4}',
    '.cms-tier-pp{font-weight:600;font-size:13px;color:var(--brand-primary,#0F172A);margin-top:6px}'
  ].join('');

  var CORPORATE_TIERS = [
    { id: 'breakfast', name: 'Breakfast', desc: 'Pastries, fruit, hot drinks', perPerson: 95 },
    { id: 'working', name: 'Working lunch', desc: 'Sandwiches, salads, sides', perPerson: 165 },
    { id: 'plated', name: 'Plated lunch', desc: 'Two-course served meal', perPerson: 295 },
    { id: 'function', name: 'Function', desc: 'Three-course or buffet, full service', perPerson: 495 }
  ];

  var CORPORATE_FIELDS = [
    { id: 'company_name', type: 'text', label: 'Company name', required: true, autocomplete: 'organization' },
    { id: 'contact_name', type: 'text', label: 'Contact name', required: true, autocomplete: 'name' },
    { id: 'billing_email', type: 'email', label: 'Billing email', required: true },
    { id: 'phone', type: 'phone', label: 'Phone', required: true },
    { id: 'po_number', type: 'text', label: 'PO number (optional)', required: false },
    { id: 'event_date', type: 'date', label: 'Date of first delivery', required: true },
    { id: 'guests', type: 'number', label: 'Headcount per delivery', required: true, validation: { min: 1, max: 5000 } },
    { id: 'delivery_address', type: 'text', label: 'Delivery address', required: true }
  ];

  var FREQ = [
    { value: 'one-off', label: 'One-off' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' }
  ];

  function render(host, config, brand, h) {
    h.injectStyles(host, CSS);
    var configFields = (config.fields && config.fields.length) ? config.fields : CORPORATE_FIELDS;
    var fields = configFields.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var tiers = (config.tiers && config.tiers.length) ? config.tiers : CORPORATE_TIERS;

    var form = h.el('form', { class: 'cms-form', novalidate: 'novalidate' });
    var alert = h.el('div', { class: 'cms-alert', hidden: 'hidden', role: 'alert' });
    form.appendChild(alert);
    if (brand && (brand.logoUrl || brand.companyName)) {
      var bar = h.el('div', { class: 'cms-brandbar' });
      if (brand.logoUrl) bar.appendChild(h.el('img', { src: brand.logoUrl, alt: brand.companyName || '' }));
      bar.appendChild(h.el('strong', { text: brand.companyName || '' }));
      form.appendChild(bar);
    }
    form.appendChild(h.el('h3', { class: 'cms-title', text: config.title || 'Corporate catering enquiry' }));
    form.appendChild(h.el('p', { class: 'cms-sub', text: config.subtitle || 'For one-off functions and recurring deliveries. Account terms available.' }));

    form.appendChild(h.el('div', { class: 'cms-section-title', text: 'Choose a service tier' }));
    var tierGroup = h.el('div', { class: 'cms-tier-grid', role: 'radiogroup', 'aria-label': 'Service tier' });
    var selectedTier = tiers[0].id;
    tiers.forEach(function (t, i) {
      var lbl = h.el('label', { class: 'cms-tier' + (i === 0 ? ' is-selected' : '') });
      var input = h.el('input', { type: 'radio', name: 'cc_tier', value: t.id });
      if (i === 0) input.checked = true;
      input.addEventListener('change', function () {
        selectedTier = t.id;
        Array.from(tierGroup.children).forEach(function (e) { e.classList.remove('is-selected'); });
        lbl.classList.add('is-selected');
      });
      lbl.appendChild(input);
      lbl.appendChild(h.el('div', { class: 'cms-tier-name', text: t.name }));
      lbl.appendChild(h.el('div', { class: 'cms-tier-desc', text: t.desc || '' }));
      lbl.appendChild(h.el('div', { class: 'cms-tier-pp', text: 'From ' + h.formatCurrency(t.perPerson, config.currency) + ' pp' }));
      tierGroup.appendChild(lbl);
    });
    form.appendChild(tierGroup);

    form.appendChild(h.el('div', { class: 'cms-section-title', text: 'Account details' }));
    var entries = [];
    function addRow(ids) {
      var row = h.el('div', { class: 'cms-row' });
      ids.forEach(function (id) {
        var f = fields.find(function (x) { return x.id === id; });
        if (!f) return;
        var wrap = h.el('div', { class: 'cms-field', dataset: { fid: f.id } });
        var inputId = 'cc_' + f.id;
        wrap.appendChild(h.el('label', { class: 'cms-label', for: inputId, text: f.label + (f.required ? ' *' : '') }));
        var input = h.buildStandardInput(f, inputId);
        var err = h.el('div', { class: 'cms-error', id: inputId + '_err', 'aria-live': 'polite' });
        wrap.appendChild(input); wrap.appendChild(err);
        row.appendChild(wrap);
        entries.push({ field: f, input: input, errorEl: err, wrapper: wrap });
      });
      form.appendChild(row);
    }
    addRow(['company_name', 'contact_name']);
    addRow(['billing_email', 'phone']);
    addRow(['po_number', 'event_date']);
    addRow(['guests', 'delivery_address']);

    form.appendChild(h.el('div', { class: 'cms-section-title', text: 'Frequency' }));
    var freqWrap = h.el('div', { class: 'cms-field' });
    freqWrap.appendChild(h.el('label', { class: 'cms-label', for: 'cc_freq', text: 'How often?' }));
    var freq = h.el('select', { class: 'cms-select', id: 'cc_freq', name: 'recurring_frequency' });
    FREQ.forEach(function (o) { freq.appendChild(h.el('option', { value: o.value, text: o.label })); });
    freqWrap.appendChild(freq);
    form.appendChild(freqWrap);

    form.appendChild(h.buildHoneypot());
    var tslot = h.el('div', { class: 'cms-turnstile' }); form.appendChild(tslot);
    var btn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Request a quote' });
    btn.style.marginTop = '14px';
    form.appendChild(btn);
    host.appendChild(form);

    var token = null;
    if (config.turnstileSiteKey) h.mountTurnstile(host, tslot, config.turnstileSiteKey, function (t) { token = t; });
    h.bindFormRunner(host, form, fields, entries, h, {
      alertEl: alert, button: btn, config: config,
      getTurnstileToken: function () { return token; },
      extraValues: function () { return { tier: selectedTier, recurring_frequency: freq.value }; }
    });
  }
  window.__cmsTemplates['corporate-catering'] = { render: render };
})();
