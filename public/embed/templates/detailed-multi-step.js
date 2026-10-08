/* detailed-multi-step -- 3-step wizard. Contact -> Event -> Preferences. Per-step validation, animated transitions. */
(function () {
  'use strict';
  window.__cmsTemplates = window.__cmsTemplates || {};

  var CSS = [
    '.cms-form{padding:32px 32px 26px;max-width:var(--cms-form-max,760px);margin:0 auto;background:var(--brand-bg,#fff)}',
    '.cms-progress{display:flex;gap:8px;margin-bottom:10px}',
    '.cms-progress-step{flex:1;height:6px;background:#E2E8F0;border-radius:999px;position:relative;overflow:hidden;transition:background .25s}',
    '.cms-progress-step.is-done,.cms-progress-step.is-active{background:var(--brand-primary,#0F172A)}',
    '.cms-step-labels{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;color:#94A3B8;margin:0 0 22px}',
    '.cms-step-labels span{display:inline-flex;align-items:center;gap:6px}',
    '.cms-step-labels span b{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#E2E8F0;color:#64748B;font-size:11px}',
    '.cms-step-labels span.is-active{color:var(--brand-primary,#0F172A);font-weight:700}',
    '.cms-step-labels span.is-active b,.cms-step-labels span.is-done b{background:var(--brand-primary,#0F172A);color:#fff}',
    '.cms-step-actions .cms-btn{min-width:130px}',
    '@media(max-width:520px){.cms-form{padding:26px 18px 20px}}',
    '.cms-step{display:none;animation:cmsFade .25s ease}',
    '.cms-step.is-active{display:grid}',
    '@keyframes cmsFade{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:none}}',
    '.cms-step-actions{display:flex;justify-content:space-between;gap:10px;margin-top:18px}',
    '.cms-row{display:grid;grid-template-columns:1fr 1fr;gap:var(--field-row-gap,12px) 12px}',
    '@media(max-width:520px){.cms-row{grid-template-columns:1fr}}',
    '.cms-title{margin:0 0 4px;font-size:20px;font-weight:700}',
    '.cms-sub{margin:0 0 14px;font-size:14px;color:#6B7280}'
  ].join('');

  // Default 3-step grouping if config does not specify groups.
  var DEFAULT_GROUPS = [
    { key: 'contact', label: 'Contact', match: ['request_type', 'name', 'first_name', 'last_name', 'email', 'phone', 'company'] },
    { key: 'event', label: 'Event', match: ['event_date', 'event_time', 'guest_count', 'guests', 'venue', 'event_type', 'postcode', 'location'] },
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
    // Drop steps that ended up with no fields so the visitor never
    // lands on a blank page.
    var rawGroups = groupFields(fields);
    var grouped = [];
    var stepNames = [];
    rawGroups.forEach(function (g, i) {
      if (g.length > 0) { grouped.push(g); stepNames.push(DEFAULT_GROUPS[i].label); }
    });
    if (grouped.length === 0) { grouped.push([]); stepNames.push(DEFAULT_GROUPS[0].label); }

    var form = h.el('form', { class: 'cms-form', novalidate: 'novalidate' });
    var alert = h.el('div', { class: 'cms-alert', hidden: 'hidden', role: 'alert' });
    form.appendChild(alert);
    form.appendChild(h.buildHeader(brand, 'Event quote request'));
    form.appendChild(h.el('h3', { class: 'cms-title', text: config.title || 'Tell us about your event' }));
    form.appendChild(h.el('p', { class: 'cms-sub', text: config.subtitle || (stepNames.length + ' quick steps. Takes about 90 seconds.') }));

    var bars = stepNames.map(function (_, i) { return h.el('div', { class: 'cms-progress-step' + (i === 0 ? ' is-active' : '') }); });
    var prog = h.el('div', { class: 'cms-progress', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(stepNames.length), 'aria-valuenow': '1' });
    bars.forEach(function (b) { prog.appendChild(b); });
    form.appendChild(prog);
    var labels = h.el('div', { class: 'cms-step-labels' }, stepNames.map(function (name, i) {
      return h.el('span', { class: i === 0 ? 'is-active' : '' }, [h.el('b', { text: String(i + 1) }), name]);
    }));
    form.appendChild(labels);

    var entries = [];
    var stepEls = [];
    grouped.forEach(function (groupFields, idx) {
      var step = h.el('div', { class: 'cms-step cms-grid' + (idx === 0 ? ' is-active' : ''), dataset: { step: String(idx) } });
      groupFields.forEach(function (f) {
        var wrap = h.el('div', { class: 'cms-field' + (h.isWideField(f) ? ' is-wide' : ''), dataset: { fid: f.id } });
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
    var submitBtn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Request my quote' });
    if (stepNames.length > 1) submitBtn.style.display = 'none';
    else nextBtn.style.display = 'none';
    actions.appendChild(backBtn);
    var rightWrap = h.el('div', null, [nextBtn, submitBtn]);
    actions.appendChild(rightWrap);
    form.appendChild(actions);
    form.appendChild(h.buildTrustLine());
    host.appendChild(form);

    var current = 0;
    var token = null;
    if (config.turnstileSiteKey) h.mountTurnstile(host, tslot, config.turnstileSiteKey, function (t) { token = t; });

    var runner = h.bindFormRunner(host, form, fields, entries, h, {
      alertEl: alert, button: submitBtn, config: config, getTurnstileToken: function () { return token; },
      // A bad field on an earlier step (or a server-side error) jumps
      // back to that step so the visitor can see what to fix.
      onInvalid: function (bad) {
        if (bad && typeof bad.step === 'number' && bad.step !== current) {
          current = bad.step;
          showStep(current, true);
        }
      }
    });
    runner.syncVisibility();

    function showStep(i, skipFocus) {
      stepEls.forEach(function (s, idx) { s.classList.toggle('is-active', idx === i); });
      bars.forEach(function (b, idx) {
        b.classList.toggle('is-done', idx < i);
        b.classList.toggle('is-active', idx === i);
      });
      Array.from(labels.children).forEach(function (sp, idx) {
        sp.classList.toggle('is-active', idx === i);
        sp.classList.toggle('is-done', idx < i);
      });
      prog.setAttribute('aria-valuenow', String(i + 1));
      backBtn.style.visibility = i === 0 ? 'hidden' : 'visible';
      var isLast = i === stepEls.length - 1;
      nextBtn.style.display = isLast ? 'none' : '';
      submitBtn.style.display = isLast ? '' : 'none';
      var first = stepEls[i].querySelector('input:not(.cms-sr),select,textarea');
      if (first && !skipFocus) setTimeout(function () { first.focus(); }, 80);
      h.announce(host, 'Step ' + (i + 1) + ' of ' + stepEls.length);
    }
    function validateStep(i) {
      // Only this step's fields: validating everything used to paint
      // errors on steps the visitor had not reached yet.
      var v = runner.validate(function (e) { return e.step === i; });
      if (!v.ok && v.firstBad) h.focusInput(v.firstBad.input);
      return v.ok;
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
