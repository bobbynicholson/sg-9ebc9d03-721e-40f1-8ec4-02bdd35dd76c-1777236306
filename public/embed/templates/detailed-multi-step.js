/* detailed-multi-step -- 3-step wizard. Contact -> Event -> Preferences. Per-step validation, animated transitions. */
(function () {
  'use strict';
  window.__cmsTemplates = window.__cmsTemplates || {};

  var CSS = [
    '.cms-form{padding:24px;max-width:640px;margin:0 auto;border:1px solid #E5E7EB;background:var(--brand-bg,#fff)}',
    '.cms-progress{display:flex;gap:8px;margin-bottom:18px}',
    '.cms-progress-step{flex:1;height:6px;background:#E5E7EB;border-radius:999px;position:relative;overflow:hidden}',
    '.cms-progress-step.is-done,.cms-progress-step.is-active{background:var(--brand-primary,#0F172A)}',
    '.cms-step-labels{display:flex;justify-content:space-between;font-size:12px;color:#6B7280;margin:-10px 0 18px}',
    '.cms-step-labels span.is-active{color:var(--brand-primary,#0F172A);font-weight:600}',
    '.cms-step{display:none;animation:cmsFade .25s ease}',
    '.cms-step.is-active{display:block}',
    '@keyframes cmsFade{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:none}}',
    '.cms-step-actions{display:flex;justify-content:space-between;gap:10px;margin-top:18px}',
    '.cms-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '@media(max-width:520px){.cms-row{grid-template-columns:1fr}}',
    '.cms-title{margin:0 0 4px;font-size:20px;font-weight:700}',
    '.cms-sub{margin:0 0 14px;font-size:14px;color:#6B7280}'
  ].join('');

  // Default 3-step grouping if config does not specify groups.
  var DEFAULT_GROUPS = [
    { key: 'contact', label: 'Contact', match: ['name', 'first_name', 'last_name', 'email', 'phone', 'company'] },
    { key: 'event', label: 'Event', match: ['event_date', 'event_time', 'guests', 'venue', 'event_type', 'postcode', 'location'] },
    { key: 'prefs', label: 'Preferences', match: ['tier', 'dietary', 'menu', 'budget', 'notes', 'message', 'extras'] }
  ];

  function groupFields(fields) {
    var groups = [[], [], []];
    fields.forEach(function (f) {
      if (typeof f.step === 'number' && groups[f.step]) { groups[f.step].push(f); return; }
      var idx = DEFAULT_GROUPS.findIndex(function (g) {
        return g.match.some(function (m) { return f.id.indexOf(m) !== -1; });
      });
      if (idx === -1) idx = 2;
      groups[idx].push(f);
    });
    return groups;
  }

  function render(host, config, brand, h) {
    h.injectStyles(host, CSS);
    var fields = (config.fields || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var grouped = groupFields(fields);

    var form = h.el('form', { class: 'cms-form', novalidate: 'novalidate' });
    var alert = h.el('div', { class: 'cms-alert', hidden: 'hidden', role: 'alert' });
    form.appendChild(alert);
    form.appendChild(h.el('h3', { class: 'cms-title', text: config.title || 'Tell us about your event' }));
    form.appendChild(h.el('p', { class: 'cms-sub', text: config.subtitle || 'Three quick steps. Takes about 90 seconds.' }));

    var bars = [h.el('div', { class: 'cms-progress-step is-active' }), h.el('div', { class: 'cms-progress-step' }), h.el('div', { class: 'cms-progress-step' })];
    var prog = h.el('div', { class: 'cms-progress', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': '3', 'aria-valuenow': '1' });
    bars.forEach(function (b) { prog.appendChild(b); });
    form.appendChild(prog);
    var labels = h.el('div', { class: 'cms-step-labels' }, DEFAULT_GROUPS.map(function (g, i) {
      return h.el('span', { text: g.label, class: i === 0 ? 'is-active' : '' });
    }));
    form.appendChild(labels);

    var entries = [];
    var stepEls = [];
    grouped.forEach(function (groupFields, idx) {
      var step = h.el('div', { class: 'cms-step' + (idx === 0 ? ' is-active' : ''), dataset: { step: String(idx) } });
      groupFields.forEach(function (f) {
        var wrap = h.el('div', { class: 'cms-field', dataset: { fid: f.id } });
        var id = 'd_' + f.id;
        wrap.appendChild(h.el('label', { class: 'cms-label', for: id, text: f.label + (f.required ? ' *' : '') }));
        if (f.helpText) wrap.appendChild(h.el('div', { class: 'cms-help', text: f.helpText }));
        var input = h.buildStandardInput(f, id);
        var err = h.el('div', { class: 'cms-error', id: id + '_err', 'aria-live': 'polite' });
        wrap.appendChild(input); wrap.appendChild(err);
        step.appendChild(wrap);
        entries.push({ field: f, input: input, errorEl: err, wrapper: wrap, step: idx });
      });
      stepEls.push(step);
      form.appendChild(step);
    });

    form.appendChild(h.buildHoneypot());
    var tslot = h.el('div', { class: 'cms-turnstile' }); form.appendChild(tslot);

    var actions = h.el('div', { class: 'cms-step-actions' });
    var backBtn = h.el('button', { class: 'cms-btn cms-btn-secondary', type: 'button', text: 'Back' });
    backBtn.style.visibility = 'hidden';
    var nextBtn = h.el('button', { class: 'cms-btn', type: 'button', text: 'Next' });
    var submitBtn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Send enquiry' });
    submitBtn.style.display = 'none';
    actions.appendChild(backBtn);
    var rightWrap = h.el('div', null, [nextBtn, submitBtn]);
    actions.appendChild(rightWrap);
    form.appendChild(actions);
    host.appendChild(form);

    var current = 0;
    var token = null;
    if (config.turnstileSiteKey) h.mountTurnstile(host, tslot, config.turnstileSiteKey, function (t) { token = t; });

    var runner = h.bindFormRunner(host, form, fields, entries, h, {
      alertEl: alert, button: submitBtn, config: config, getTurnstileToken: function () { return token; }
    });

    function showStep(i) {
      stepEls.forEach(function (s, idx) { s.classList.toggle('is-active', idx === i); });
      bars.forEach(function (b, idx) {
        b.classList.toggle('is-done', idx < i);
        b.classList.toggle('is-active', idx === i);
      });
      Array.from(labels.children).forEach(function (sp, idx) {
        sp.classList.toggle('is-active', idx === i);
      });
      prog.setAttribute('aria-valuenow', String(i + 1));
      backBtn.style.visibility = i === 0 ? 'hidden' : 'visible';
      var isLast = i === stepEls.length - 1;
      nextBtn.style.display = isLast ? 'none' : '';
      submitBtn.style.display = isLast ? '' : 'none';
      var first = stepEls[i].querySelector('input,select,textarea');
      if (first) setTimeout(function () { first.focus(); }, 80);
      h.announce(host, 'Step ' + (i + 1) + ' of ' + stepEls.length);
    }
    function validateStep(i) {
      var v = runner.validate();
      var stepBad = entries.find(function (e) { return e.step === i && e.errorEl.textContent; });
      if (stepBad) { stepBad.input.focus(); return false; }
      // Even if other steps are invalid, allow advance for this step only.
      var visible = runner.getVisible();
      var ok = true;
      entries.forEach(function (e) {
        if (e.step !== i) return;
        if (!visible.has(e.field.id)) return;
        if (e.errorEl.textContent) ok = false;
      });
      return ok;
    }
    nextBtn.addEventListener('click', function () {
      if (validateStep(current)) { current = Math.min(current + 1, stepEls.length - 1); showStep(current); }
      else h.announce(host, 'Please correct fields on this step.');
    });
    backBtn.addEventListener('click', function () {
      current = Math.max(0, current - 1); showStep(current);
    });
  }
  window.__cmsTemplates['detailed-multi-step'] = { render: render };
})();
