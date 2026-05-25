/* pricing-calculator -- guests slider + tier radio cards + live "From RX-RY per person" estimate.
   Conversion-killer feature. Calls /estimate. */
(function () {
  'use strict';
  window.__cmsTemplates = window.__cmsTemplates || {};

  var CSS = [
    '.cms-form{padding:24px;max-width:680px;margin:0 auto;border:1px solid #E5E7EB;background:var(--brand-bg,#fff)}',
    '.cms-title{margin:0 0 4px;font-size:22px;font-weight:700}',
    '.cms-sub{margin:0 0 16px;font-size:14px;color:#6B7280}',
    '.cms-calc{padding:16px;border-radius:calc(var(--brand-radius,12px));background:#F8FAFC;margin-bottom:18px}',
    '.cms-slider-row{display:flex;align-items:center;gap:12px;margin-bottom:8px}',
    '.cms-slider{flex:1;-webkit-appearance:none;appearance:none;height:6px;border-radius:999px;background:#E5E7EB;outline:none}',
    '.cms-slider::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:50%;background:var(--brand-primary,#0F172A);cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.18)}',
    '.cms-slider::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:var(--brand-primary,#0F172A);cursor:pointer;border:none}',
    '.cms-guests{font-weight:700;font-size:18px;min-width:80px;text-align:right}',
    '.cms-tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}',
    '.cms-tier{position:relative;border:1.5px solid #E5E7EB;border-radius:calc(var(--brand-radius,12px) - 2px);padding:12px;cursor:pointer;transition:border-color .15s,background .15s}',
    '.cms-tier input{position:absolute;opacity:0;pointer-events:none}',
    '.cms-tier:hover{border-color:#94A3B8}',
    '.cms-tier.is-selected{border-color:var(--brand-primary,#0F172A);background:color-mix(in srgb,var(--brand-primary,#0F172A) 6%,transparent)}',
    '.cms-tier-name{font-weight:600;margin-bottom:2px}',
    '.cms-tier-pp{font-size:12px;color:#6B7280}',
    '.cms-estimate-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#6B7280;margin-top:6px}',
    '.cms-estimate{font-size:24px;font-weight:700;color:var(--brand-primary,#0F172A);margin-top:2px;line-height:1.1}',
    '.cms-estimate-sub{font-size:12px;color:#6B7280;margin-top:6px}'
  ].join('');

  function render(host, config, brand, h) {
    h.injectStyles(host, CSS);
    var fields = (config.fields || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    // LCF-H (task #229, 2026-05-25): two robustness fixes.
    //
    // 1. Empty-array crash. Pre-LCF-H this was `config.tiers || [...]`.
    //    When the API returns tiers: [] (the `token=preview` fallback
    //    path the admin gallery uses) the empty array is truthy, so
    //    the hardcoded fallback never kicked in. Line ~62 then tried
    //    tiers[0].id and threw "Cannot read properties of undefined
    //    (reading 'id')". Now we explicitly check length.
    //
    // 2. Shape mismatch. The admin customiser persists tiers in the
    //    DB with price_per_person_min + price_per_person_max +
    //    currency, but this template was authored against an older
    //    shape that used perPerson (a single number). Normalise both
    //    shapes to {id,name,perPerson} so a tenant's saved tiers
    //    don't render NaN.
    var rawTiers = (config.tiers && config.tiers.length > 0) ? config.tiers : [
      { id: 'basic', name: 'Basic', perPerson: 250 },
      { id: 'standard', name: 'Standard', perPerson: 350 },
      { id: 'premium', name: 'Premium', perPerson: 450 }
    ];
    var tiers = rawTiers.map(function (t) {
      // Prefer perPerson; fall back to the min/max DB shape.
      var pp = (typeof t.perPerson === 'number')
        ? t.perPerson
        : (typeof t.price_per_person_min === 'number'
            ? Number(t.price_per_person_min)
            : 0);
      return {
        id: t.id || ('tier_' + Math.random().toString(36).slice(2, 8)),
        name: t.name || 'Tier',
        perPerson: pp,
        perPersonMax: typeof t.price_per_person_max === 'number'
          ? Number(t.price_per_person_max)
          : null,
      };
    });
    var minGuests = (config.guestsMin) || 10;
    var maxGuests = (config.guestsMax) || 500;
    var startGuests = config.guestsDefault || Math.max(minGuests, 50);

    var form = h.el('form', { class: 'cms-form', novalidate: 'novalidate' });
    var alert = h.el('div', { class: 'cms-alert', hidden: 'hidden', role: 'alert' });
    form.appendChild(alert);
    if (brand && (brand.logoUrl || brand.companyName)) {
      var bar = h.el('div', { class: 'cms-brandbar' });
      if (brand.logoUrl) bar.appendChild(h.el('img', { src: brand.logoUrl, alt: brand.companyName || '' }));
      bar.appendChild(h.el('strong', { text: brand.companyName || '' }));
      form.appendChild(bar);
    }
    form.appendChild(h.el('h3', { class: 'cms-title', text: config.title || 'Estimate your event' }));
    form.appendChild(h.el('p', { class: 'cms-sub', text: config.subtitle || 'Slide for guest count, pick a menu, see pricing instantly.' }));

    var calc = h.el('div', { class: 'cms-calc' });
    calc.appendChild(h.el('label', { class: 'cms-label', for: 'pc_guests', text: 'Number of guests' }));
    var slider = h.el('input', { class: 'cms-slider', type: 'range', id: 'pc_guests', min: String(minGuests), max: String(maxGuests), step: '5', value: String(startGuests), 'aria-valuemin': String(minGuests), 'aria-valuemax': String(maxGuests) });
    var guestNum = h.el('span', { class: 'cms-guests', text: String(startGuests), 'aria-live': 'polite' });
    var sliderRow = h.el('div', { class: 'cms-slider-row' }, [slider, guestNum]);
    calc.appendChild(sliderRow);

    var tierGroup = h.el('div', { class: 'cms-tiers', role: 'radiogroup', 'aria-label': 'Menu tier' });
    var selectedTier = tiers[0].id;
    tiers.forEach(function (t, i) {
      var lbl = h.el('label', { class: 'cms-tier' + (i === 0 ? ' is-selected' : ''), dataset: { tier: t.id } });
      var input = h.el('input', { type: 'radio', name: 'pc_tier', value: t.id });
      if (i === 0) input.checked = true;
      lbl.appendChild(input);
      lbl.appendChild(h.el('div', { class: 'cms-tier-name', text: t.name }));
      lbl.appendChild(h.el('div', { class: 'cms-tier-pp', text: 'From ' + h.formatCurrency(t.perPerson, config.currency) + ' pp' }));
      // 'From' wording is intentional -- the figure is an indicative
      // starting price, not a binding quote. The disclaimer below
      // (cms-estimate-sub) reinforces this so the visitor doesn't
      // expect parity with the final tailored quote.
      input.addEventListener('change', function () {
        selectedTier = t.id;
        Array.from(tierGroup.children).forEach(function (el) { el.classList.remove('is-selected'); });
        lbl.classList.add('is-selected');
        updateEstimate();
      });
      tierGroup.appendChild(lbl);
    });
    calc.appendChild(tierGroup);

    var estimate = h.el('div', { class: 'cms-estimate', text: '...', 'aria-live': 'polite' });
    // Honesty disclaimer -- the calculator pulls from companies.embed_pricing_tiers
    // which is a marketing-only "starting from" indicator, not the
    // operator's live menu_tiers. Tenants edit menu pricing in
    // /admin/menu without knowing the embed tiers exist; if we promised
    // an exact total we'd silently mislead clients. Tagline now says
    // "indicative starting price" + an explicit final-quote caveat.
    var estLabel = h.el('div', { class: 'cms-estimate-label', text: 'Indicative starting price' });
    var estSub = h.el('div', { class: 'cms-estimate-sub', text: 'A guideline based on guest count and menu tier. Your final quote may vary based on menu choices, dietary requirements, venue and travel.' });
    calc.appendChild(estLabel);
    calc.appendChild(estimate);
    calc.appendChild(estSub);
    form.appendChild(calc);

    function localEstimate() {
      var g = Number(slider.value) || 0;
      var t = tiers.find(function (x) { return x.id === selectedTier; }) || tiers[0];
      var lo = g * t.perPerson;
      var hi = lo * 1.25;
      return { lo: lo, hi: hi };
    }
    var debouncedRemote = h.debounce(function () {
      if (!h.estimate) return;
      h.estimate(Number(slider.value), selectedTier).then(function (data) {
        if (data && data.low !== undefined && data.high !== undefined) {
          // LCF-H: single hyphen between low + high (Bobby's hard rule -
          // no double dashes anywhere in user-facing copy).
          estimate.textContent = h.formatCurrency(data.low, config.currency) + ' - ' + h.formatCurrency(data.high, config.currency);
        }
      }).catch(function () { /* keep local estimate */ });
    }, 300);
    function updateEstimate() {
      guestNum.textContent = slider.value;
      var est = localEstimate();
      estimate.textContent = h.formatCurrency(est.lo, config.currency) + ' - ' + h.formatCurrency(est.hi, config.currency);
      debouncedRemote();
    }
    slider.addEventListener('input', updateEstimate);
    updateEstimate();

    var entries = [];
    fields.forEach(function (f) {
      // Skip guest/tier fields if defined -- the calc owns those.
      if (f.id === 'guests' || f.id === 'tier') return;
      var wrap = h.el('div', { class: 'cms-field', dataset: { fid: f.id } });
      var id = 'pc_' + f.id;
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
    var btn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Get a tailored quote' });
    form.appendChild(btn);
    host.appendChild(form);

    var token = null;
    if (config.turnstileSiteKey) h.mountTurnstile(host, tslot, config.turnstileSiteKey, function (t) { token = t; });
    h.bindFormRunner(host, form, fields.filter(function (f) { return f.id !== 'guests' && f.id !== 'tier'; }), entries, h, {
      alertEl: alert, button: btn, config: config,
      getTurnstileToken: function () { return token; },
      extraValues: function () { return { guests: Number(slider.value), tier: selectedTier }; }
    });
  }
  window.__cmsTemplates['pricing-calculator'] = { render: render };
})();
