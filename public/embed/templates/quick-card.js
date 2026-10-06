/* quick-card -- compact single-column card. 60-second submission. SMB inline. */
(function () {
  'use strict';
  window.__cmsTemplates = window.__cmsTemplates || {};

  var CSS = [
    '.cms-form{padding:30px 28px 24px;max-width:560px;margin:0 auto}',
    '.cms-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}',
    '.cms-grid .cms-field.is-wide{grid-column:1/-1}',
    '.cms-btn{width:100%;margin-top:6px}',
    '@media(max-width:520px){.cms-form{padding:26px 18px 20px}.cms-grid{grid-template-columns:1fr}}'
  ].join('');

  function render(host, config, brand, h) {
    h.injectStyles(host, CSS);
    var fields = (config.fields || []).slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });

    var form = h.el('form', { class: 'cms-form', novalidate: 'novalidate' });
    var alert = h.el('div', { class: 'cms-alert', hidden: 'hidden', role: 'alert' });
    form.appendChild(alert);

    form.appendChild(h.buildHeader(brand, 'Catering enquiry'));
    form.appendChild(h.el('h3', { class: 'cms-title', text: config.title || 'Get a quick quote' }));
    form.appendChild(h.el('p', { class: 'cms-sub', text: config.subtitle || 'Tell us about your event and we will reply within a working day.' }));

    var entries = [];
    // Two-column grid on desktop: short inputs pair up, long ones
    // (textarea, choices, pickers, address) span the full width.
    var grid = h.el('div', { class: 'cms-grid' });
    form.appendChild(grid);
    var WIDE = { textarea: 1, radio: 1, checkboxes: 1, checkbox: 1, multiselect: 1 };
    fields.forEach(function (f) {
      var wrap = h.el('div', { class: 'cms-field', dataset: { fid: f.id } });
      var inputId = 'q_' + f.id;
      wrap.appendChild(h.el('label', { class: 'cms-label', for: inputId, text: f.label + (f.required ? ' *' : '') }));
      if (f.helpText) wrap.appendChild(h.el('div', { class: 'cms-help', text: f.helpText }));
      var input = buildInput(f, inputId, h);
      wrap.appendChild(input);
      var err = h.el('div', { class: 'cms-error', id: inputId + '_err', 'aria-live': 'polite' });
      wrap.appendChild(err);
      if (WIDE[f.type] || f.mapsTo === 'venue' || f.id === 'venue') wrap.classList.add('is-wide');
      grid.appendChild(wrap);
      entries.push({ field: f, input: input, errorEl: err, wrapper: wrap });
    });

    form.appendChild(h.buildHoneypot());
    var turnstileSlot = h.el('div', { class: 'cms-turnstile' });
    form.appendChild(turnstileSlot);

    var btn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Request my quote' });
    form.appendChild(btn);
    form.appendChild(h.buildTrustLine());

    host.appendChild(form);

    var turnstileToken = null;
    if (config.turnstileSiteKey) {
      h.mountTurnstile(host, turnstileSlot, config.turnstileSiteKey, function (t) { turnstileToken = t; });
    }

    // Shared runner: same value reading, validation, conditional logic
    // and server-error handling as every other template.
    var runner = h.bindFormRunner(host, form, fields, entries, h, {
      alertEl: alert, button: btn, config: config,
      getTurnstileToken: function () { return turnstileToken; }
    });
    runner.syncVisibility();
  }

  function buildInput(f, id, h) {
    return h.buildStandardInput(f, id);
  }

  window.__cmsTemplates['quick-card'] = { render: render };
})();
