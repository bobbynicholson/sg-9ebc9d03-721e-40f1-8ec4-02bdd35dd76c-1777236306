/* modern-inline -- horizontal where it fits, floating labels, micro-interactions. Corporate aesthetic. */
(function () {
  'use strict';
  window.__cmsTemplates = window.__cmsTemplates || {};

  var CSS = [
    '.cms-form{padding:24px;border:1px solid #E5E7EB;background:var(--brand-bg,#fff);max-width:880px;margin:0 auto}',
    '.cms-title{margin:0 0 4px;font-size:22px;font-weight:600;letter-spacing:-.01em}',
    '.cms-sub{margin:0 0 18px;font-size:14px;color:#6B7280}',
    '.cms-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}',
    '@media(max-width:600px){.cms-grid{grid-template-columns:1fr}}',
    '.cms-float{position:relative}',
    '.cms-float .cms-input,.cms-float .cms-select,.cms-float .cms-textarea{padding-top:18px;padding-bottom:8px}',
    '.cms-float .cms-label{position:absolute;left:13px;top:14px;margin:0;font-size:14px;color:#6B7280;pointer-events:none;transition:transform .18s,color .18s,font-size .18s;background:transparent}',
    '.cms-float.is-filled .cms-label,.cms-float.is-focused .cms-label{transform:translateY(-9px);font-size:11px;color:var(--brand-primary,#0F172A);font-weight:600}',
    '.cms-float .cms-help{max-height:0;overflow:hidden;opacity:0;transition:max-height .2s,opacity .2s}',
    '.cms-float.is-focused .cms-help{max-height:32px;opacity:1;margin-top:4px}',
    '.cms-actions{display:flex;justify-content:flex-end;margin-top:8px;gap:10px}'
  ].join('');

  function render(host, config, brand, h) {
    h.injectStyles(host, CSS);
    var fields = (config.fields || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

    var form = h.el('form', { class: 'cms-form', novalidate: 'novalidate' });
    var alert = h.el('div', { class: 'cms-alert', hidden: 'hidden', role: 'alert' });
    form.appendChild(alert);
    if (brand && (brand.logoUrl || brand.companyName)) {
      var bar = h.el('div', { class: 'cms-brandbar' });
      if (brand.logoUrl) bar.appendChild(h.el('img', { src: brand.logoUrl, alt: brand.companyName || '' }));
      bar.appendChild(h.el('strong', { text: brand.companyName || '' }));
      form.appendChild(bar);
    }
    form.appendChild(h.el('h3', { class: 'cms-title', text: config.title || 'Request a quote' }));
    form.appendChild(h.el('p', { class: 'cms-sub', text: config.subtitle || 'A few quick details and we will get back to you.' }));

    var grid = h.el('div', { class: 'cms-grid' });
    var entries = [];
    fields.forEach(function (f) {
      var wrap = h.el('div', { class: 'cms-field cms-float', dataset: { fid: f.id } });
      var inputId = 'm_' + f.id;
      var input = h.buildStandardInput(f, inputId);
      input.placeholder = ' ';
      var label = h.el('label', { class: 'cms-label', for: inputId, text: f.label + (f.required ? ' *' : '') });
      var help = f.helpText ? h.el('div', { class: 'cms-help', text: f.helpText }) : null;
      var err = h.el('div', { class: 'cms-error', id: inputId + '_err', 'aria-live': 'polite' });
      input.addEventListener('focus', function () { wrap.classList.add('is-focused'); });
      input.addEventListener('blur', function () { wrap.classList.remove('is-focused'); });
      input.addEventListener('input', function () {
        wrap.classList.toggle('is-filled', !!input.value);
      });
      wrap.appendChild(input);
      wrap.appendChild(label);
      if (help) wrap.appendChild(help);
      wrap.appendChild(err);
      // Span the textarea full-width for breathing room.
      if (f.type === 'textarea') wrap.style.gridColumn = '1 / -1';
      grid.appendChild(wrap);
      entries.push({ field: f, input: input, errorEl: err, wrapper: wrap });
    });
    form.appendChild(grid);
    form.appendChild(h.buildHoneypot());
    var tslot = h.el('div', { class: 'cms-turnstile' }); form.appendChild(tslot);

    var actions = h.el('div', { class: 'cms-actions' });
    var btn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Send enquiry' });
    actions.appendChild(btn);
    form.appendChild(actions);
    host.appendChild(form);

    var turnstileToken = null;
    if (config.turnstileSiteKey) h.mountTurnstile(host, tslot, config.turnstileSiteKey, function (t) { turnstileToken = t; });

    h.bindFormRunner(host, form, fields, entries, h, {
      alertEl: alert, button: btn, config: config, getTurnstileToken: function () { return turnstileToken; }
    });
  }
  window.__cmsTemplates['modern-inline'] = { render: render };
})();
