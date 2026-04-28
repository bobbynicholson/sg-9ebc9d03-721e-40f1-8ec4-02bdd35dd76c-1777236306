/* event-estimator -- big visual estimate front-and-centre, number-pad guests input, three menu cards. "Get a binding quote". */
(function () {
  'use strict';
  window.__cmsTemplates = window.__cmsTemplates || {};

  var CSS = [
    '.cms-form{padding:28px;max-width:680px;margin:0 auto;background:var(--brand-bg,#fff);border-radius:calc(var(--brand-radius,12px) + 4px);box-shadow:0 8px 28px -10px rgba(15,23,42,.18)}',
    '.cms-hero{text-align:center;padding:18px 0 8px;border-bottom:1px solid #F1F5F9;margin-bottom:18px}',
    '.cms-hero-label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#6B7280;margin:0 0 6px}',
    '.cms-hero-est{font-size:42px;font-weight:800;color:var(--brand-primary,#0F172A);letter-spacing:-.02em;line-height:1.1}',
    '.cms-hero-sub{font-size:13px;color:#6B7280;margin-top:6px}',
    '.cms-numpad{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;margin:12px 0 16px;justify-content:center}',
    '.cms-num-btn{width:44px;height:44px;border-radius:999px;border:1.5px solid #E5E7EB;background:#fff;font-size:22px;font-weight:700;cursor:pointer;color:var(--brand-text,#0F172A)}',
    '.cms-num-btn:hover{border-color:var(--brand-primary,#0F172A)}',
    '.cms-num-display{font-size:36px;font-weight:800;text-align:center;min-width:120px;color:var(--brand-text,#0F172A)}',
    '.cms-num-label{text-align:center;font-size:12px;color:#6B7280;margin-top:-10px;margin-bottom:14px}',
    '.cms-tier-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}',
    '@media(max-width:520px){.cms-tier-grid{grid-template-columns:1fr}}',
    '.cms-tier{position:relative;border:1.5px solid #E5E7EB;border-radius:calc(var(--brand-radius,12px) - 2px);padding:14px;cursor:pointer;text-align:center;transition:border-color .15s,background .15s}',
    '.cms-tier input{position:absolute;opacity:0;pointer-events:none}',
    '.cms-tier:hover{border-color:#94A3B8}',
    '.cms-tier.is-selected{border-color:var(--brand-primary,#0F172A);background:color-mix(in srgb,var(--brand-primary,#0F172A) 6%,transparent)}',
    '.cms-tier-icon{font-size:28px;margin-bottom:4px}',
    '.cms-tier-name{font-weight:700;font-size:15px}',
    '.cms-tier-pp{font-size:12px;color:#6B7280}',
    '.cms-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '@media(max-width:520px){.cms-row{grid-template-columns:1fr}}'
  ].join('');

  var DEFAULT_TIERS = [
    { id: 'simple', name: 'Casual', icon: 'C', perPerson: 220 },
    { id: 'plated', name: 'Plated', icon: 'P', perPerson: 380 },
    { id: 'premium', name: 'Premium', icon: '*', perPerson: 580 }
  ];

  function render(host, config, brand, h) {
    h.injectStyles(host, CSS);
    var fields = (config.fields || [
      { id: 'name', type: 'text', label: 'Your name', required: true, autocomplete: 'name' },
      { id: 'email', type: 'email', label: 'Email', required: true },
      { id: 'phone', type: 'phone', label: 'Phone', required: true },
      { id: 'event_date', type: 'date', label: 'Event date', required: true }
    ]).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var tiers = (config.tiers && config.tiers.length) ? config.tiers : DEFAULT_TIERS;

    var form = h.el('form', { class: 'cms-form', novalidate: 'novalidate' });
    var alert = h.el('div', { class: 'cms-alert', hidden: 'hidden', role: 'alert' });
    form.appendChild(alert);

    var hero = h.el('div', { class: 'cms-hero' });
    hero.appendChild(h.el('p', { class: 'cms-hero-label', text: 'Estimated total' }));
    var estDisp = h.el('div', { class: 'cms-hero-est', text: '...', 'aria-live': 'polite' });
    hero.appendChild(estDisp);
    hero.appendChild(h.el('p', { class: 'cms-hero-sub', text: 'Final pricing depends on menu and venue.' }));
    form.appendChild(hero);

    var guests = config.guestsDefault || 50;
    var pad = h.el('div', { class: 'cms-numpad' });
    var minus = h.el('button', { class: 'cms-num-btn', type: 'button', 'aria-label': 'Decrease guests', text: '-' });
    var plus = h.el('button', { class: 'cms-num-btn', type: 'button', 'aria-label': 'Increase guests', text: '+' });
    var disp = h.el('input', { class: 'cms-num-display', type: 'number', value: String(guests), min: '1', max: '5000', 'aria-label': 'Number of guests' });
    disp.style.border = 'none'; disp.style.background = 'transparent'; disp.style.outline = 'none';
    pad.appendChild(minus); pad.appendChild(disp); pad.appendChild(plus);
    form.appendChild(pad);
    form.appendChild(h.el('div', { class: 'cms-num-label', text: 'guests' }));

    var tierGroup = h.el('div', { class: 'cms-tier-grid', role: 'radiogroup', 'aria-label': 'Menu tier' });
    var selectedTier = tiers[0].id;
    tiers.forEach(function (t, i) {
      var lbl = h.el('label', { class: 'cms-tier' + (i === 0 ? ' is-selected' : '') });
      var input = h.el('input', { type: 'radio', name: 'ee_tier', value: t.id });
      if (i === 0) input.checked = true;
      input.addEventListener('change', function () {
        selectedTier = t.id;
        Array.from(tierGroup.children).forEach(function (e) { e.classList.remove('is-selected'); });
        lbl.classList.add('is-selected');
        update();
      });
      lbl.appendChild(input);
      lbl.appendChild(h.el('div', { class: 'cms-tier-icon', text: t.icon || '' }));
      lbl.appendChild(h.el('div', { class: 'cms-tier-name', text: t.name }));
      lbl.appendChild(h.el('div', { class: 'cms-tier-pp', text: h.formatCurrency(t.perPerson, config.currency) + ' pp' }));
      tierGroup.appendChild(lbl);
    });
    form.appendChild(tierGroup);

    function update() {
      var n = Math.max(1, Math.min(5000, Number(disp.value) || 1));
      var t = tiers.find(function (x) { return x.id === selectedTier; }) || tiers[0];
      var total = n * t.perPerson;
      estDisp.textContent = h.formatCurrency(total, config.currency);
      // Optional remote refine.
      if (h.estimate && h.token) {
        h.estimate(n, selectedTier).then(function (data) {
          if (data && data.low !== undefined) estDisp.textContent = h.formatCurrency(data.low, config.currency) + ' -- ' + h.formatCurrency(data.high, config.currency);
        }).catch(function () {});
      }
    }
    var debouncedUpdate = h.debounce(update, 200);
    minus.addEventListener('click', function () { disp.value = String(Math.max(1, (Number(disp.value) || 0) - 5)); update(); });
    plus.addEventListener('click', function () { disp.value = String(Math.min(5000, (Number(disp.value) || 0) + 5)); update(); });
    disp.addEventListener('input', debouncedUpdate);
    update();

    var entries = [];
    var rowsConfig = [['name', 'email'], ['phone', 'event_date']];
    rowsConfig.forEach(function (ids) {
      var row = h.el('div', { class: 'cms-row' });
      ids.forEach(function (id) {
        var f = fields.find(function (x) { return x.id === id; });
        if (!f) return;
        var wrap = h.el('div', { class: 'cms-field', dataset: { fid: f.id } });
        var inputId = 'ee_' + f.id;
        wrap.appendChild(h.el('label', { class: 'cms-label', for: inputId, text: f.label + (f.required ? ' *' : '') }));
        var input = h.buildStandardInput(f, inputId);
        var err = h.el('div', { class: 'cms-error', id: inputId + '_err', 'aria-live': 'polite' });
        wrap.appendChild(input); wrap.appendChild(err);
        row.appendChild(wrap);
        entries.push({ field: f, input: input, errorEl: err, wrapper: wrap });
      });
      form.appendChild(row);
    });
    // Any remaining fields after the two rows.
    fields.forEach(function (f) {
      if (entries.find(function (e) { return e.field.id === f.id; })) return;
      if (f.id === 'guests' || f.id === 'tier') return;
      var wrap = h.el('div', { class: 'cms-field', dataset: { fid: f.id } });
      var id = 'ee_' + f.id;
      wrap.appendChild(h.el('label', { class: 'cms-label', for: id, text: f.label + (f.required ? ' *' : '') }));
      var input = h.buildStandardInput(f, id);
      var err = h.el('div', { class: 'cms-error', id: id + '_err', 'aria-live': 'polite' });
      wrap.appendChild(input); wrap.appendChild(err);
      form.appendChild(wrap);
      entries.push({ field: f, input: input, errorEl: err, wrapper: wrap });
    });

    form.appendChild(h.buildHoneypot());
    var tslot = h.el('div', { class: 'cms-turnstile' }); form.appendChild(tslot);
    var btn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Get a binding quote' });
    btn.style.width = '100%';
    btn.style.marginTop = '14px';
    form.appendChild(btn);
    host.appendChild(form);

    var token = null;
    if (config.turnstileSiteKey) h.mountTurnstile(host, tslot, config.turnstileSiteKey, function (t) { token = t; });
    h.bindFormRunner(host, form, fields.filter(function (f) { return f.id !== 'guests' && f.id !== 'tier'; }), entries, h, {
      alertEl: alert, button: btn, config: config,
      getTurnstileToken: function () { return token; },
      extraValues: function () { return { guests: Number(disp.value) || 0, tier: selectedTier }; }
    });
  }
  window.__cmsTemplates['event-estimator'] = { render: render };
})();
