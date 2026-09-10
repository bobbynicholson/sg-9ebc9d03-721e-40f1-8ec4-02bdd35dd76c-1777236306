/* floating-widget -- bottom-right pill that expands into a 380px panel. Minimisable. sessionStorage. */
(function () {
  'use strict';
  window.__cmsTemplates = window.__cmsTemplates || {};

  var CSS = [
    ':host{position:fixed;right:20px;bottom:20px;z-index:2147483000}',
    '.cms-fab{display:inline-flex;align-items:center;gap:8px;padding:12px 18px;background:var(--brand-primary,#0F172A);color:#fff;border:none;border-radius:999px;font:inherit;font-weight:600;cursor:pointer;box-shadow:0 8px 24px -6px rgba(15,23,42,.35);transition:transform .2s,box-shadow .2s}',
    '.cms-fab:hover{transform:translateY(-2px);box-shadow:0 12px 28px -6px rgba(15,23,42,.45)}',
    '.cms-panel{position:absolute;right:0;bottom:60px;width:380px;max-width:calc(100vw - 40px);background:var(--brand-bg,#fff);border-radius:calc(var(--brand-radius,12px) + 2px);box-shadow:0 18px 48px -12px rgba(15,23,42,.35),0 4px 12px rgba(15,23,42,.08);overflow:hidden;display:none}',
    '.cms-panel.is-open{display:block;animation:cmsPop .22s ease-out}',
    '@keyframes cmsPop{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}',
    '.cms-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--brand-primary,#0F172A);color:#fff}',
    '.cms-head strong{font-size:15px}',
    '.cms-close{background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:4px 8px}',
    '.cms-form{padding:18px 16px;background:var(--brand-bg,#fff);max-height:70vh;overflow-y:auto}',
    '@media(max-width:480px){:host{right:12px;bottom:12px;left:12px}.cms-panel{width:auto;right:0;left:0}}'
  ].join('');

  function render(host, config, brand, h) {
    h.injectStyles(host, CSS);
    var fields = (config.fields || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

    var fab = h.el('button', { class: 'cms-fab', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'cms-fwidget-panel', text: config.fabLabel || 'Get a quote' });
    var panel = h.el('div', { class: 'cms-panel', id: 'cms-fwidget-panel', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Quote request form' });
    var head = h.el('div', { class: 'cms-head' }, [
      h.el('strong', { text: config.title || (brand && brand.companyName) || 'Quick quote' })
    ]);
    var closeBtn = h.el('button', { class: 'cms-close', type: 'button', 'aria-label': 'Close form', text: 'X' });
    head.appendChild(closeBtn);
    panel.appendChild(head);

    var form = h.el('form', { class: 'cms-form', novalidate: 'novalidate' });
    var alert = h.el('div', { class: 'cms-alert', hidden: 'hidden', role: 'alert' });
    form.appendChild(alert);
    form.appendChild(h.el('p', { class: 'cms-help', text: config.subtitle || 'A few details and we will reply quickly.' }));

    var entries = [];
    fields.forEach(function (f) {
      var wrap = h.el('div', { class: 'cms-field', dataset: { fid: f.id } });
      var id = 'fw_' + f.id;
      wrap.appendChild(h.el('label', { class: 'cms-label', for: id, text: f.label + (f.required ? ' *' : '') }));
      if (f.helpText) wrap.appendChild(h.el('div', { class: 'cms-help', text: f.helpText }));
      var input = h.buildStandardInput(f, id);
      var err = h.el('div', { class: 'cms-error', id: id + '_err', 'aria-live': 'polite' });
      wrap.appendChild(input); wrap.appendChild(err);
      form.appendChild(wrap);
      entries.push({ field: f, input: input, errorEl: err, wrapper: wrap });
    });

    form.appendChild(h.buildHoneypot());
    var tslot = h.el('div', { class: 'cms-turnstile' }); form.appendChild(tslot);
    var btn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Send' });
    form.appendChild(btn);
    panel.appendChild(form);
    host.appendChild(fab);
    host.appendChild(panel);

    var STORAGE_KEY = 'cms-fwidget-' + (config.slug || 'default');
    function setOpen(open) {
      panel.classList.toggle('is-open', open);
      fab.setAttribute('aria-expanded', open ? 'true' : 'false');
      try { sessionStorage.setItem(STORAGE_KEY, open ? '1' : '0'); } catch (e) {}
      if (open) {
        var first = form.querySelector('input,select,textarea');
        if (first) setTimeout(function () { first.focus(); }, 80);
      }
    }
    fab.addEventListener('click', function () { setOpen(!panel.classList.contains('is-open')); });
    closeBtn.addEventListener('click', function () { setOpen(false); fab.focus(); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && panel.classList.contains('is-open')) setOpen(false);
    });
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === '1') setOpen(true);
    } catch (e) {}

    var token = null;
    if (config.turnstileSiteKey) h.mountTurnstile(host, tslot, config.turnstileSiteKey, function (t) { token = t; });
    h.bindFormRunner(host, form, fields, entries, h, {
      alertEl: alert, button: btn, config: config, getTurnstileToken: function () { return token; }
    });
  }
  window.__cmsTemplates['floating-widget'] = { render: render };
})();
