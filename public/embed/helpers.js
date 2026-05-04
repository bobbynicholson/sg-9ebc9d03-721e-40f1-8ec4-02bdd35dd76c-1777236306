/* CateringMS embed helpers -- shared utilities for all templates.
   Vanilla JS, no dependencies. Loaded once by loader, passed into every render. */
(function (root) {
  'use strict';

  var LOCALE_BY_CURRENCY = {
    ZAR: 'en-ZA',
    GBP: 'en-GB',
    USD: 'en-US',
    EUR: 'en-IE',
    AUD: 'en-AU'
  };

  function formatCurrency(amount, currency) {
    var ccy = (currency || 'ZAR').toUpperCase();
    var locale = LOCALE_BY_CURRENCY[ccy] || 'en-ZA';
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: ccy,
        maximumFractionDigits: 0
      }).format(Number(amount) || 0);
    } catch (e) {
      return ccy + ' ' + (Math.round(Number(amount) || 0)).toLocaleString();
    }
  }

  // Mirrors server-side validation. Returns null if valid, else error string.
  function validateField(field, value) {
    if (!field) return null;
    var v = value;
    if (typeof v === 'string') v = v.trim();
    var empty = v === undefined || v === null || v === '' ||
      (Array.isArray(v) && v.length === 0);

    if (field.required && empty) {
      return (field.label || 'This field') + ' is required';
    }
    if (empty) return null;

    var rules = field.validation || {};
    if (field.type === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) {
        return 'Please enter a valid email address';
      }
    }
    if (field.type === 'phone' || field.type === 'tel') {
      var digits = String(v).replace(/[^\d+]/g, '');
      if (digits.replace(/\D/g, '').length < 7) {
        return 'Please enter a valid phone number';
      }
    }
    if (field.type === 'number' || field.type === 'guests') {
      var n = Number(v);
      if (Number.isNaN(n)) return 'Must be a number';
      if (rules.min !== undefined && n < rules.min) return 'Must be at least ' + rules.min;
      if (rules.max !== undefined && n > rules.max) return 'Must be no more than ' + rules.max;
    }
    if (field.type === 'date') {
      var d = new Date(v);
      if (isNaN(d.getTime())) return 'Please enter a valid date';
      if (rules.minDate) {
        var md = new Date(rules.minDate);
        if (d < md) return 'Date must be on or after ' + rules.minDate;
      }
    }
    if (rules.minLength && String(v).length < rules.minLength) {
      return 'Must be at least ' + rules.minLength + ' characters';
    }
    if (rules.maxLength && String(v).length > rules.maxLength) {
      return 'Must be no more than ' + rules.maxLength + ' characters';
    }
    if (rules.pattern) {
      try {
        var re = new RegExp(rules.pattern);
        if (!re.test(String(v))) return rules.patternMessage || 'Invalid format';
      } catch (e) { /* ignore bad pattern */ }
    }
    return null;
  }

  // Returns a Set of currently-visible field IDs given the payload state.
  function runConditionalLogic(fields, payload) {
    var visible = new Set();
    if (!Array.isArray(fields)) return visible;
    fields.forEach(function (f) {
      if (f.visible === false) return;
      var c = f.conditional;
      if (!c || !c.showIfFieldId) {
        visible.add(f.id);
        return;
      }
      var current = payload[c.showIfFieldId];
      var target = c.showIfValue;
      var match = false;
      if (Array.isArray(target)) {
        match = target.indexOf(current) !== -1;
      } else if (Array.isArray(current)) {
        match = current.indexOf(target) !== -1;
      } else {
        match = String(current) === String(target);
      }
      if (c.operator === 'not_equals') match = !match;
      if (match) visible.add(f.id);
    });
    return visible;
  }

  function jsonFetch(url, options) {
    var opts = options || {};
    return fetch(url, {
      method: opts.method || 'GET',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }, opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'omit',
      mode: 'cors'
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.message) || 'Request failed');
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      }, function () {
        if (!res.ok) throw new Error('Request failed (' + res.status + ')');
        return {};
      });
    });
  }

  function submitForm(apiBase, token, formSlug, payload, turnstileToken, honeypot) {
    return jsonFetch(apiBase + '/api/public/embed/' + encodeURIComponent(token) + '/submit', {
      method: 'POST',
      body: {
        slug: formSlug || 'default',
        payload: payload,
        turnstile_token: turnstileToken || null,
        honeypot: honeypot || '',
        client_meta: {
          referrer: document.referrer || null,
          page_url: location.href,
          user_agent: navigator.userAgent,
          submitted_at: new Date().toISOString()
        }
      }
    });
  }

  function fetchEstimate(apiBase, token, guests, tierId) {
    var url = apiBase + '/api/public/embed/' + encodeURIComponent(token) +
      '/estimate?guests=' + encodeURIComponent(guests || 0) +
      '&tier=' + encodeURIComponent(tierId || '');
    return jsonFetch(url);
  }

  // Cloudflare Turnstile injection. Falls back silently if no site key.
  function mountTurnstile(host, container, siteKey, callback) {
    if (!siteKey) { callback && callback(null); return; }
    var existing = document.querySelector('script[data-embed-turnstile]');
    var ensure = existing
      ? Promise.resolve()
      : new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
          s.async = true;
          s.defer = true;
          s.setAttribute('data-embed-turnstile', '1');
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
    // Turnstile cannot render inside a closed shadow root. Use a sibling element
    // attached to the host's parent so it remains in the light DOM.
    var slot = document.createElement('div');
    slot.style.cssText = 'margin-top:8px';
    container.appendChild(slot);
    ensure.then(function () {
      if (!root.turnstile) { callback && callback(null); return; }
      try {
        root.turnstile.render(slot, {
          sitekey: siteKey,
          callback: function (token) { callback && callback(token); },
          'error-callback': function () { callback && callback(null); },
          'expired-callback': function () { callback && callback(null); },
          theme: 'auto'
        });
      } catch (e) { callback && callback(null); }
    }).catch(function () { callback && callback(null); });
  }

  // Apply white-label colours to the shadow root via CSS custom properties.
  function applyTheme(host, brand, theme) {
    var b = brand || {};
    var t = theme || {};
    var styleHost = host.host || host;
    function setVar(name, val) {
      if (val) styleHost.style.setProperty(name, val);
    }
    setVar('--brand-primary', t.primaryColor || b.primaryColor || '#0F172A');
    setVar('--brand-secondary', t.secondaryColor || b.secondaryColor || '#F59E0B');
    setVar('--brand-text', t.textColor || '#0F172A');
    setVar('--brand-bg', t.bgColor || '#FFFFFF');
    setVar('--brand-radius', (t.radius || '12') + (typeof (t.radius) === 'number' ? 'px' : ''));
    if (t.fontFamily) setVar('--brand-font', t.fontFamily);
  }

  // Tiny safe-HTML helper -- never use innerHTML with untrusted data.
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === false || v === null || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v; // only used for trusted inline SVG
        else if (k.indexOf('on') === 0 && typeof v === 'function') {
          node.addEventListener(k.slice(2), v);
        } else if (k === 'dataset' && typeof v === 'object') {
          Object.keys(v).forEach(function (dk) { node.dataset[dk] = v[dk]; });
        } else {
          node.setAttribute(k, v);
        }
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  // Common reset + brand-aware base styles every template extends.
  // 2024-tier polish over the original 2021-baseline:
  // softer drop-shadow on the form card, smoother focus-ring
  // transitions, animated success icon, radio + checkbox group
  // layouts (the customiser now exposes these field types).
  var baseCSS = [
    '*,*::before,*::after{box-sizing:border-box}',
    ':host{all:initial;display:block;font-family:var(--brand-font,inherit);color:var(--brand-text,#0F172A);font-size:16px;line-height:1.5}',
    '.cms-form{background:var(--brand-bg,#fff);border-radius:var(--brand-radius,16px);color:var(--brand-text,#0F172A);font-family:var(--brand-font,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif);box-shadow:0 1px 3px rgba(15,23,42,.04),0 4px 16px rgba(15,23,42,.06)}',
    '.cms-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}',
    '.cms-label{font-size:14px;font-weight:600;color:var(--brand-text,#0F172A)}',
    '.cms-help{font-size:12px;color:#6B7280}',
    '.cms-input,.cms-select,.cms-textarea{font:inherit;color:inherit;width:100%;padding:11px 13px;border:1px solid #D1D5DB;border-radius:calc(var(--brand-radius,12px) - 4px);background:#fff;transition:border-color .18s ease,box-shadow .18s ease,background-color .18s ease;min-height:44px}',
    '.cms-input:hover,.cms-select:hover,.cms-textarea:hover{border-color:#9CA3AF}',
    '.cms-textarea{min-height:88px;resize:vertical}',
    '.cms-input:focus,.cms-select:focus,.cms-textarea:focus{outline:none;border-color:var(--brand-primary,#0F172A);box-shadow:0 0 0 4px color-mix(in srgb,var(--brand-primary,#0F172A) 22%,transparent)}',
    '.cms-input[aria-invalid="true"],.cms-select[aria-invalid="true"],.cms-textarea[aria-invalid="true"]{border-color:#DC2626}',
    '.cms-input[aria-invalid="true"]:focus,.cms-select[aria-invalid="true"]:focus,.cms-textarea[aria-invalid="true"]:focus{box-shadow:0 0 0 4px rgba(220,38,38,.18)}',
    '.cms-error{color:#B91C1C;font-size:13px;min-height:1em}',
    '.cms-btn{font:inherit;cursor:pointer;border:none;border-radius:calc(var(--brand-radius,12px) - 2px);padding:13px 22px;font-weight:600;background:var(--brand-primary,#0F172A);color:#fff;min-height:48px;transition:transform .12s ease,filter .15s ease,box-shadow .15s ease;box-shadow:0 1px 2px rgba(15,23,42,.08),0 4px 12px color-mix(in srgb,var(--brand-primary,#0F172A) 20%,transparent)}',
    '.cms-btn:hover{filter:brightness(1.06);box-shadow:0 2px 4px rgba(15,23,42,.10),0 6px 16px color-mix(in srgb,var(--brand-primary,#0F172A) 30%,transparent)}',
    '.cms-btn:active{transform:translateY(1px);filter:brightness(.96)}',
    '.cms-btn:focus-visible{outline:none;box-shadow:0 0 0 4px color-mix(in srgb,var(--brand-primary,#0F172A) 30%,transparent),0 6px 16px color-mix(in srgb,var(--brand-primary,#0F172A) 30%,transparent)}',
    '.cms-btn:disabled{opacity:.55;cursor:not-allowed;box-shadow:none}',
    '.cms-btn-secondary{background:transparent;color:var(--brand-primary,#0F172A);border:1px solid var(--brand-primary,#0F172A);box-shadow:none}',
    '.cms-honeypot{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}',
    /* Polished success card with animated checkmark. */
    '.cms-success{padding:32px 24px;text-align:center;animation:cmsSuccessIn .35s ease-out both}',
    '.cms-success h3{margin:14px 0 8px;font-size:22px;font-weight:700}',
    '.cms-success p{margin:0;color:#475569;font-size:15px}',
    '.cms-success-check{display:inline-flex;width:56px;height:56px;border-radius:50%;background:color-mix(in srgb,var(--brand-primary,#10B981) 14%,#fff);align-items:center;justify-content:center;margin-bottom:8px;animation:cmsSuccessPulse .55s ease-out both}',
    '.cms-success-check svg{width:28px;height:28px;stroke:var(--brand-primary,#10B981);stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:48;stroke-dashoffset:48;animation:cmsCheckDraw .45s .12s ease-out forwards}',
    '@keyframes cmsSuccessIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    '@keyframes cmsSuccessPulse{0%{transform:scale(.4)}60%{transform:scale(1.06)}100%{transform:scale(1)}}',
    '@keyframes cmsCheckDraw{to{stroke-dashoffset:0}}',
    '.cms-alert{background:#FEF2F2;color:#991B1B;padding:10px 12px;border-radius:8px;font-size:14px;margin-bottom:12px}',
    '.cms-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '@media(max-width:480px){.cms-row{grid-template-columns:1fr}}',
    '.cms-brandbar{display:flex;align-items:center;gap:10px;margin-bottom:14px}',
    '.cms-brandbar img{max-height:32px;max-width:140px;width:auto;height:auto}',
    /* Radio + checkbox group layouts (used by buildStandardInput). */
    '.cms-radio-group,.cms-checkbox-group{display:flex;flex-direction:column;gap:8px}',
    '.cms-radio-option,.cms-checkbox-option{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #E5E7EB;border-radius:calc(var(--brand-radius,12px) - 4px);cursor:pointer;transition:border-color .15s,background-color .15s}',
    '.cms-radio-option:hover,.cms-checkbox-option:hover{border-color:var(--brand-primary,#9CA3AF);background:color-mix(in srgb,var(--brand-primary,#0F172A) 4%,#fff)}',
    '.cms-radio-option input,.cms-checkbox-option input{accent-color:var(--brand-primary,#0F172A);width:18px;height:18px;flex-shrink:0}',
    '.cms-radio-label,.cms-checkbox-label{font-size:14px;color:var(--brand-text,#0F172A)}',
    /* Standalone single checkbox -- align with adjacent label */
    '.cms-checkbox{accent-color:var(--brand-primary,#0F172A);width:18px;height:18px}',
    '.cms-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}'
  ].join('');

  // Helper: build an aria-live region appended to the shadow root once.
  function ensureLiveRegion(host) {
    var live = host.querySelector('.cms-live');
    if (live) return live;
    live = document.createElement('div');
    live.className = 'cms-live cms-sr';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    host.appendChild(live);
    return live;
  }

  function announce(host, msg) {
    var l = ensureLiveRegion(host);
    l.textContent = '';
    setTimeout(function () { l.textContent = msg; }, 30);
  }

  function injectStyles(host, extraCSS) {
    var style = document.createElement('style');
    style.textContent = baseCSS + (extraCSS || '');
    host.appendChild(style);
    return style;
  }

  function buildHoneypot() {
    return el('input', {
      class: 'cms-honeypot',
      type: 'text',
      name: 'website',
      tabindex: '-1',
      autocomplete: 'off',
      'aria-hidden': 'true'
    });
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  // Build a standard form runner: validation, conditional logic, submit.
  // Templates pass a list of {field, input, errorEl, wrapper} entries plus the form element.
  function bindFormRunner(host, form, fields, entries, h, opts) {
    opts = opts || {};
    var alertEl = opts.alertEl;
    var btn = opts.button;
    var defaultLabel = btn ? btn.textContent : '';
    var config = opts.config || {};
    var visible = runConditionalLogic(fields, {});
    function readPayload() {
      var p = {};
      entries.forEach(function (e) {
        var inp = e.input;
        if (!inp) { p[e.field.id] = e.value; return; }
        // Single-pick radio group (rendered by buildStandardInput as
        // a wrapping div). buildStandardInput returns the wrapper div
        // for radio + checkboxes types so we read child <input> states.
        if (e.field.type === 'radio') {
          var picked = inp.querySelector
            ? inp.querySelector('input[type="radio"]:checked')
            : null;
          p[e.field.id] = picked ? picked.value : '';
          return;
        }
        if (e.field.type === 'checkboxes' || e.field.type === 'multiselect') {
          if (inp.selectedOptions) {
            // Legacy <select multiple> path.
            p[e.field.id] = Array.from(inp.selectedOptions).map(function (o) { return o.value; });
          } else if (inp.querySelectorAll) {
            var picks = inp.querySelectorAll('input[type="checkbox"]:checked');
            p[e.field.id] = Array.prototype.map.call(picks, function (c) { return c.value; });
          } else {
            p[e.field.id] = [];
          }
          return;
        }
        if (e.field.type === 'checkbox') { p[e.field.id] = inp.checked; return; }
        if (inp.type === 'radio') {
          var checked = form.querySelector('input[name="' + inp.name + '"]:checked');
          p[e.field.id] = checked ? checked.value : '';
          return;
        }
        p[e.field.id] = inp.value;
      });
      if (opts.extraValues) {
        var extras = opts.extraValues();
        Object.keys(extras).forEach(function (k) { p[k] = extras[k]; });
      }
      return p;
    }
    function syncVisibility() {
      var p = readPayload();
      visible = runConditionalLogic(fields, p);
      entries.forEach(function (e) {
        if (e.wrapper) e.wrapper.style.display = visible.has(e.field.id) ? '' : 'none';
      });
      if (opts.onChange) opts.onChange(p, visible);
    }
    entries.forEach(function (e) {
      if (!e.input) return;
      e.input.addEventListener('input', syncVisibility);
      e.input.addEventListener('change', syncVisibility);
    });
    function validate() {
      var p = readPayload();
      var ok = true;
      var firstBad = null;
      entries.forEach(function (e) {
        if (!visible.has(e.field.id)) { if (e.errorEl) e.errorEl.textContent = ''; return; }
        var msg = validateField(e.field, p[e.field.id]);
        if (e.errorEl) e.errorEl.textContent = msg || '';
        if (msg) {
          ok = false;
          if (e.input) {
            e.input.setAttribute('aria-invalid', 'true');
            if (e.errorEl && e.errorEl.id) e.input.setAttribute('aria-describedby', e.errorEl.id);
          }
          if (!firstBad) firstBad = e;
        } else if (e.input) {
          e.input.removeAttribute('aria-invalid');
        }
      });
      return { ok: ok, payload: p, firstBad: firstBad };
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (alertEl) alertEl.hidden = true;
      var v = validate();
      if (!v.ok) {
        announce(host, 'Please correct the highlighted fields.');
        if (v.firstBad && v.firstBad.input) v.firstBad.input.focus();
        return;
      }
      var clean = {};
      var fieldIds = new Set(fields.map(function (f) { return f.id; }));
      Object.keys(v.payload).forEach(function (k) {
        // Keep all extraValues (not in fields list); for declared fields, respect visibility.
        if (!fieldIds.has(k) || visible.has(k)) clean[k] = v.payload[k];
      });
      if (btn) { btn.disabled = true; btn.textContent = opts.sendingLabel || 'Sending...'; }
      var hp = form.querySelector('input[name="website"]');
      h.submit(clean, opts.getTurnstileToken ? opts.getTurnstileToken() : null, hp ? hp.value : '')
        .then(function (res) { h.onSuccess(res); })
        .catch(function (err) {
          if (alertEl) {
            alertEl.hidden = false;
            alertEl.textContent = (err && err.message) || 'Could not submit. Please try again.';
            announce(host, alertEl.textContent);
          }
          if (btn) { btn.disabled = false; btn.textContent = defaultLabel; }
        });
    });
    return { syncVisibility: syncVisibility, validate: validate, readPayload: readPayload, getVisible: function () { return visible; } };
  }

  // Standard input builder used by most templates. Covers every
  // EmbedFieldType the customiser exposes, plus a couple of legacy
  // aliases (tel, guests, multiselect) carried in older configs.
  function buildStandardInput(f, id) {
    if (f.type === 'select' || f.type === 'tier') {
      // 'tier' renders the same as 'select' visually -- pricing-aware
      // templates listen for change events and call estimate().
      var sel = el('select', { class: 'cms-select', id: id, name: f.id });
      (f.options || []).forEach(function (o) {
        sel.appendChild(el('option', { value: o.value, text: o.label || o.value }));
      });
      return sel;
    }
    if (f.type === 'textarea') {
      return el('textarea', { class: 'cms-textarea', id: id, name: f.id, placeholder: f.placeholder || '', rows: '4' });
    }
    if (f.type === 'checkbox') {
      return el('input', { class: 'cms-checkbox', type: 'checkbox', id: id, name: f.id });
    }
    if (f.type === 'radio') {
      // A vertical group of labelled radios sharing the field's name.
      var radioWrap = el('div', { class: 'cms-radio-group', role: 'radiogroup' });
      (f.options || []).forEach(function (o, i) {
        var optId = id + '__' + i;
        var label = el('label', { class: 'cms-radio-option' });
        var input = el('input', { type: 'radio', id: optId, name: f.id, value: o.value });
        label.appendChild(input);
        label.appendChild(el('span', { class: 'cms-radio-label', text: o.label || o.value }));
        radioWrap.appendChild(label);
      });
      return radioWrap;
    }
    if (f.type === 'checkboxes' || f.type === 'multiselect') {
      // Multi-pick checkbox group. The submit collector reads
      // querySelectorAll(':checked') on these per group.
      var cbWrap = el('div', { class: 'cms-checkbox-group', role: 'group' });
      (f.options || []).forEach(function (o, i) {
        var optId = id + '__' + i;
        var label = el('label', { class: 'cms-checkbox-option' });
        var input = el('input', { type: 'checkbox', id: optId, name: f.id, value: o.value });
        label.appendChild(input);
        label.appendChild(el('span', { class: 'cms-checkbox-label', text: o.label || o.value }));
        cbWrap.appendChild(label);
      });
      return cbWrap;
    }
    if (f.type === 'time') {
      return el('input', {
        class: 'cms-input',
        type: 'time',
        id: id,
        name: f.id,
        placeholder: f.placeholder || ''
      });
    }
    var typeMap = { phone: 'tel', guests: 'number' };
    return el('input', {
      class: 'cms-input',
      type: typeMap[f.type] || f.type || 'text',
      id: id,
      name: f.id,
      placeholder: f.placeholder || '',
      autocomplete: f.autocomplete || (f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'on')
    });
  }

  // Public API exposed to templates only via the helpers param.
  root.__cmsEmbedHelpers = {
    bindFormRunner: bindFormRunner,
    buildStandardInput: buildStandardInput,
    formatCurrency: formatCurrency,
    validateField: validateField,
    runConditionalLogic: runConditionalLogic,
    submitForm: submitForm,
    fetchEstimate: fetchEstimate,
    mountTurnstile: mountTurnstile,
    applyTheme: applyTheme,
    el: el,
    injectStyles: injectStyles,
    buildHoneypot: buildHoneypot,
    announce: announce,
    debounce: debounce
  };
})(window);
