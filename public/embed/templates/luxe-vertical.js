/* luxe-vertical -- premium serif heading, generous whitespace, soft shadow, swelling button.
   For wedding + high-end private chef tenants. */
(function () {
  'use strict';
  window.__cmsTemplates = window.__cmsTemplates || {};

  var CSS = [
    '.cms-form{padding:36px 32px;max-width:520px;margin:0 auto;background:var(--brand-bg,#fff);box-shadow:0 12px 32px -12px rgba(15,23,42,.18),0 2px 6px rgba(15,23,42,.06);border-radius:calc(var(--brand-radius,12px) + 4px)}',
    '.cms-eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--brand-secondary,#9C8A5E);margin:0 0 8px;font-weight:600}',
    '.cms-title{margin:0 0 8px;font-family:Georgia,"Cormorant Garamond","Playfair Display",serif;font-size:30px;font-weight:500;letter-spacing:-.01em;line-height:1.15;color:var(--brand-text,#0F172A)}',
    '.cms-sub{margin:0 0 26px;font-size:15px;color:#64748B;line-height:1.55}',
    '.cms-input,.cms-select,.cms-textarea{border:none;border-bottom:1px solid #D6D3D1;border-radius:0;background:transparent;padding-left:0;padding-right:0}',
    '.cms-input:focus,.cms-select:focus,.cms-textarea:focus{box-shadow:none;border-bottom-color:var(--brand-primary,#0F172A)}',
    '.cms-label{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#78716C}',
    '.cms-btn{margin-top:18px;width:100%;letter-spacing:.04em;text-transform:uppercase;font-size:13px;padding:16px 20px;transition:transform .25s ease,filter .25s ease}',
    '.cms-btn:hover{transform:translateY(-1px) scale(1.015)}',
    '@media(max-width:480px){.cms-form{padding:26px 22px}.cms-title{font-size:24px}}'
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
    form.appendChild(h.el('p', { class: 'cms-eyebrow', text: config.eyebrow || 'Private enquiries' }));
    form.appendChild(h.el('h3', { class: 'cms-title', text: config.title || 'Begin your event' }));
    form.appendChild(h.el('p', { class: 'cms-sub', text: config.subtitle || 'Share a few details and our events team will craft a tailored proposal.' }));

    var entries = [];
    fields.forEach(function (f) {
      var wrap = h.el('div', { class: 'cms-field', dataset: { fid: f.id } });
      var inputId = 'l_' + f.id;
      wrap.appendChild(h.el('label', { class: 'cms-label', for: inputId, text: f.label + (f.required ? ' *' : '') }));
      if (f.helpText) wrap.appendChild(h.el('div', { class: 'cms-help', text: f.helpText }));
      var input = h.buildStandardInput(f, inputId);
      var err = h.el('div', { class: 'cms-error', id: inputId + '_err', 'aria-live': 'polite' });
      wrap.appendChild(input); wrap.appendChild(err);
      form.appendChild(wrap);
      entries.push({ field: f, input: input, errorEl: err, wrapper: wrap });
    });

    form.appendChild(h.buildHoneypot());
    var tslot = h.el('div', { class: 'cms-turnstile' }); form.appendChild(tslot);
    var btn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Send enquiry' });
    form.appendChild(btn);
    host.appendChild(form);

    var token = null;
    if (config.turnstileSiteKey) h.mountTurnstile(host, tslot, config.turnstileSiteKey, function (t) { token = t; });
    h.bindFormRunner(host, form, fields, entries, h, {
      alertEl: alert, button: btn, config: config, getTurnstileToken: function () { return token; }
    });
  }
  window.__cmsTemplates['luxe-vertical'] = { render: render };
})();
