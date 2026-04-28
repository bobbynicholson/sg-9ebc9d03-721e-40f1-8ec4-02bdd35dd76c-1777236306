/* spit-braai-quick -- SA-specific. Date / pax / postcode / contact name / phone. WhatsApp icon. "We bring our own gas." */
(function () {
  'use strict';
  window.__cmsTemplates = window.__cmsTemplates || {};

  var CSS = [
    '.cms-form{padding:22px;max-width:460px;margin:0 auto;background:var(--brand-bg,#fff);border:1px solid #E5E7EB;border-radius:calc(var(--brand-radius,12px))}',
    '.cms-title{margin:0 0 4px;font-size:20px;font-weight:800;letter-spacing:-.01em}',
    '.cms-sub{margin:0 0 14px;font-size:14px;color:#6B7280}',
    '.cms-loadshed{display:flex;align-items:center;gap:8px;background:#FFFBEB;border:1px solid #FDE68A;color:#78350F;padding:8px 10px;border-radius:8px;font-size:13px;margin-bottom:14px}',
    '.cms-loadshed-icon{font-size:18px}',
    '.cms-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '@media(max-width:420px){.cms-row{grid-template-columns:1fr}}',
    '.cms-submit-row{display:flex;align-items:center;gap:10px;margin-top:10px}',
    '.cms-btn{flex:1}',
    '.cms-wa{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:999px;background:#25D366;color:#fff;flex-shrink:0;box-shadow:0 2px 6px rgba(37,211,102,.4)}',
    '.cms-wa svg{width:26px;height:26px}',
    '.cms-wa-note{font-size:12px;color:#6B7280;margin-top:6px;text-align:center}'
  ].join('');

  var WA_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.967-.94 1.164-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zm-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>';

  var SB_FIELDS = [
    { id: 'event_date', type: 'date', label: 'Date', required: true },
    { id: 'pax', type: 'number', label: 'Pax', required: true, validation: { min: 10, max: 1000 }, helpText: 'Min 10' },
    { id: 'postcode', type: 'text', label: 'Postal code', required: true, autocomplete: 'postal-code', validation: { pattern: '^\\d{4}$', patternMessage: 'Please enter a 4-digit SA postal code' } },
    { id: 'contact_name', type: 'text', label: 'Your name', required: true, autocomplete: 'name' },
    { id: 'phone', type: 'phone', label: 'WhatsApp number', required: true }
  ];

  function render(host, config, brand, h) {
    h.injectStyles(host, CSS);
    var configFields = (config.fields && config.fields.length) ? config.fields : SB_FIELDS;
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
    form.appendChild(h.el('h3', { class: 'cms-title', text: config.title || 'Spit braai quick quote' }));
    form.appendChild(h.el('p', { class: 'cms-sub', text: config.subtitle || 'Five details, we reply on WhatsApp.' }));

    var ls = h.el('div', { class: 'cms-loadshed' });
    ls.appendChild(h.el('span', { class: 'cms-loadshed-icon', text: '*' }));
    ls.appendChild(h.el('span', { text: 'Load-shedding? No problem -- we bring our own gas.' }));
    form.appendChild(ls);

    var entries = [];
    function addRow(ids) {
      var row = h.el('div', { class: 'cms-row' });
      ids.forEach(function (id) {
        var f = fields.find(function (x) { return x.id === id; });
        if (!f) return;
        var wrap = h.el('div', { class: 'cms-field', dataset: { fid: f.id } });
        var inputId = 'sb_' + f.id;
        wrap.appendChild(h.el('label', { class: 'cms-label', for: inputId, text: f.label + (f.required ? ' *' : '') }));
        if (f.helpText) wrap.appendChild(h.el('div', { class: 'cms-help', text: f.helpText }));
        var input = h.buildStandardInput(f, inputId);
        if (f.id === 'phone') input.placeholder = '+27 ...';
        var err = h.el('div', { class: 'cms-error', id: inputId + '_err', 'aria-live': 'polite' });
        wrap.appendChild(input); wrap.appendChild(err);
        row.appendChild(wrap);
        entries.push({ field: f, input: input, errorEl: err, wrapper: wrap });
      });
      form.appendChild(row);
    }
    addRow(['event_date', 'pax']);
    addRow(['postcode', 'phone']);
    addRow(['contact_name']);

    form.appendChild(h.buildHoneypot());
    var tslot = h.el('div', { class: 'cms-turnstile' }); form.appendChild(tslot);

    var submitRow = h.el('div', { class: 'cms-submit-row' });
    var btn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Send via WhatsApp' });
    submitRow.appendChild(btn);
    var wa = h.el('span', { class: 'cms-wa', 'aria-hidden': 'true', html: WA_SVG });
    submitRow.appendChild(wa);
    form.appendChild(submitRow);
    form.appendChild(h.el('p', { class: 'cms-wa-note', text: 'We will reply on WhatsApp within an hour.' }));

    host.appendChild(form);

    var token = null;
    if (config.turnstileSiteKey) h.mountTurnstile(host, tslot, config.turnstileSiteKey, function (t) { token = t; });
    h.bindFormRunner(host, form, fields, entries, h, {
      alertEl: alert, button: btn, config: config, getTurnstileToken: function () { return token; }
    });
  }
  window.__cmsTemplates['spit-braai-quick'] = { render: render };
})();
