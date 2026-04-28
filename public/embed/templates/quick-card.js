/* quick-card -- compact single-column card. 60-second submission. SMB inline. */
(function () {
  'use strict';
  window.__cmsTemplates = window.__cmsTemplates || {};

  var CSS = [
    '.cms-form{padding:20px;max-width:420px;margin:0 auto;border:1px solid #E5E7EB;box-shadow:0 1px 2px rgba(0,0,0,.04)}',
    '.cms-title{margin:0 0 4px;font-size:18px;font-weight:700}',
    '.cms-sub{margin:0 0 16px;font-size:14px;color:#6B7280}',
    '@media(max-width:380px){.cms-form{padding:16px}}'
  ].join('');

  function render(host, config, brand, h) {
    h.injectStyles(host, CSS);
    var fields = (config.fields || []).slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });

    var form = h.el('form', { class: 'cms-form', novalidate: 'novalidate' });
    var alert = h.el('div', { class: 'cms-alert', hidden: 'hidden', role: 'alert' });
    form.appendChild(alert);

    if (brand && (brand.logoUrl || brand.companyName)) {
      var bar = h.el('div', { class: 'cms-brandbar' });
      if (brand.logoUrl) bar.appendChild(h.el('img', { src: brand.logoUrl, alt: brand.companyName || '' }));
      bar.appendChild(h.el('strong', { text: brand.companyName || '' }));
      form.appendChild(bar);
    }
    form.appendChild(h.el('h3', { class: 'cms-title', text: config.title || 'Get a quick quote' }));
    form.appendChild(h.el('p', { class: 'cms-sub', text: config.subtitle || 'Tell us about your event and we will reply within a working day.' }));

    var inputs = {};
    var errorEls = {};
    var visible = h.runConditionalLogic(fields, {});

    fields.forEach(function (f) {
      var wrap = h.el('div', { class: 'cms-field', dataset: { fid: f.id } });
      var inputId = 'q_' + f.id;
      wrap.appendChild(h.el('label', { class: 'cms-label', for: inputId, text: f.label + (f.required ? ' *' : '') }));
      if (f.helpText) wrap.appendChild(h.el('div', { class: 'cms-help', text: f.helpText }));
      var input = buildInput(f, inputId, h);
      input.addEventListener('input', onChange);
      input.addEventListener('change', onChange);
      wrap.appendChild(input);
      var err = h.el('div', { class: 'cms-error', id: inputId + '_err', 'aria-live': 'polite' });
      wrap.appendChild(err);
      inputs[f.id] = input;
      errorEls[f.id] = err;
      if (!visible.has(f.id)) wrap.style.display = 'none';
      form.appendChild(wrap);
    });

    form.appendChild(h.buildHoneypot());
    var turnstileSlot = h.el('div', { class: 'cms-turnstile' });
    form.appendChild(turnstileSlot);

    var btn = h.el('button', { class: 'cms-btn', type: 'submit', text: config.submitLabel || 'Send enquiry' });
    form.appendChild(btn);

    host.appendChild(form);

    var turnstileToken = null;
    if (config.turnstileSiteKey) {
      h.mountTurnstile(host, turnstileSlot, config.turnstileSiteKey, function (t) { turnstileToken = t; });
    }

    function readPayload() {
      var p = {};
      Object.keys(inputs).forEach(function (id) {
        var input = inputs[id];
        var f = fields.find(function (x) { return x.id === id; });
        if (f.type === 'checkbox') p[id] = input.checked;
        else if (f.type === 'multiselect') {
          p[id] = Array.from(input.selectedOptions || []).map(function (o) { return o.value; });
        } else {
          p[id] = input.value;
        }
      });
      return p;
    }

    function onChange() {
      var payload = readPayload();
      var nowVisible = h.runConditionalLogic(fields, payload);
      fields.forEach(function (f) {
        var w = form.querySelector('[data-fid="' + f.id + '"]');
        if (!w) return;
        w.style.display = nowVisible.has(f.id) ? '' : 'none';
      });
      visible = nowVisible;
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      alert.hidden = true;
      var payload = readPayload();
      var ok = true;
      fields.forEach(function (f) {
        if (!visible.has(f.id)) { errorEls[f.id].textContent = ''; return; }
        var msg = h.validateField(f, payload[f.id]);
        errorEls[f.id].textContent = msg || '';
        if (msg) {
          ok = false;
          inputs[f.id].setAttribute('aria-invalid', 'true');
          inputs[f.id].setAttribute('aria-describedby', errorEls[f.id].id);
        } else {
          inputs[f.id].removeAttribute('aria-invalid');
        }
      });
      if (!ok) {
        h.announce(host, 'Please correct the highlighted fields.');
        var firstBad = fields.find(function (f) { return errorEls[f.id].textContent; });
        if (firstBad) inputs[firstBad.id].focus();
        return;
      }
      var clean = {};
      Object.keys(payload).forEach(function (k) { if (visible.has(k)) clean[k] = payload[k]; });
      btn.disabled = true;
      btn.textContent = 'Sending...';
      h.submit(clean, turnstileToken, form.querySelector('input[name="website"]').value)
        .then(function (res) { h.onSuccess(res); })
        .catch(function (err) {
          alert.hidden = false;
          alert.textContent = (err && err.message) || 'Could not submit. Please try again.';
          h.announce(host, alert.textContent);
          btn.disabled = false;
          btn.textContent = config.submitLabel || 'Send enquiry';
        });
    });
  }

  function buildInput(f, id, h) {
    if (f.type === 'select') {
      var sel = h.el('select', { class: 'cms-select', id: id, name: f.id });
      (f.options || []).forEach(function (o) {
        sel.appendChild(h.el('option', { value: o.value, text: o.label }));
      });
      return sel;
    }
    if (f.type === 'textarea') {
      return h.el('textarea', { class: 'cms-textarea', id: id, name: f.id, placeholder: f.placeholder || '', rows: '4' });
    }
    if (f.type === 'checkbox') {
      return h.el('input', { class: 'cms-checkbox', type: 'checkbox', id: id, name: f.id });
    }
    var typeMap = { phone: 'tel', guests: 'number' };
    return h.el('input', {
      class: 'cms-input',
      type: typeMap[f.type] || f.type || 'text',
      id: id,
      name: f.id,
      placeholder: f.placeholder || '',
      autocomplete: f.autocomplete || (f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'on')
    });
  }

  window.__cmsTemplates['quick-card'] = { render: render };
})();
