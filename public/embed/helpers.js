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

  // Options may be saved as {value,label} objects or as plain strings by
  // older configs. Normalise to objects and drop blank rows so a select
  // never renders an "undefined" choice.
  function normalizeOptions(options) {
    if (!Array.isArray(options)) return [];
    var out = [];
    options.forEach(function (o) {
      if (o === null || o === undefined) return;
      if (typeof o === 'string' || typeof o === 'number') {
        var s = String(o).trim();
        if (s) out.push({ value: s, label: s });
        return;
      }
      var value = o.value !== undefined && o.value !== null ? String(o.value) : '';
      var label = o.label !== undefined && o.label !== null ? String(o.label) : value;
      if (!value && !label) return;
      out.push({ value: value || label, label: label || value });
    });
    return out;
  }

  function todayIso() {
    var d = new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
  }

  // Mirrors server-side validation. Returns null if valid, else error string.
  function validateField(field, value) {
    if (!field) return null;
    var v = value;
    if (typeof v === 'string') v = v.trim();
    var empty = v === undefined || v === null || v === '' ||
      (Array.isArray(v) && v.length === 0) ||
      (field.type === 'checkbox' && v === false);

    if (field.required && empty) {
      if (field.type === 'checkbox') return 'Please tick this box to continue';
      if (field.type === 'select' || field.type === 'radio' || field.type === 'tier') {
        return 'Please choose an option';
      }
      if (field.type === 'checkboxes' || field.type === 'multiselect') {
        return 'Please choose at least one option';
      }
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
      // Same rule as the server (PHONE_RE in lib/embedFormApi.ts) so a
      // number the browser accepts is never rejected after submit.
      if (!/^[+\d][\d\s\-().]{5,24}$/.test(String(v)) || String(v).replace(/\D/g, '').length < 7) {
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
      // Event dates are bookings; a past date is always a typo. ISO
      // yyyy-mm-dd strings compare correctly as text.
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) && String(v) < todayIso()) {
        return 'Please choose today or a future date';
      }
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
        // The submit API answers some failures (e.g. a failed spam
        // challenge) with HTTP 200 + ok:false, so check both.
        if (!res.ok || (data && data.ok === false)) {
          var fallback = data && data.errors ? 'Please correct the highlighted fields.' : 'Something went wrong. Please try again.';
          var err = new Error((data && data.message) || fallback);
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
        formSlug: formSlug || 'default',
        payload: payload,
        turnstileToken: turnstileToken || '',
        honeypot: honeypot || '',
        referrer: document.referrer || null,
        clientMeta: {
          pageUrl: location.href,
          userAgent: navigator.userAgent,
          submittedAt: new Date().toISOString()
        }
      }
    });
  }

  function fetchEstimate(apiBase, token, guests, tierId) {
    var url = apiBase + '/api/public/embed/' + encodeURIComponent(token) +
      '/estimate?guests=' + encodeURIComponent(guests || 0) +
      '&tierId=' + encodeURIComponent(tierId || '');
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
    setVar('--brand-primary', t.primaryColor || t.primary_color || b.primaryColor || '#0F172A');
    setVar('--brand-secondary', t.secondaryColor || t.secondary_color || b.secondaryColor || '#F59E0B');
    setVar('--brand-text', t.textColor || t.text_color || '#0F172A');
    setVar('--brand-bg', t.bgColor || t.bg_color || '#FFFFFF');
    var rawRadius = t.radius !== undefined ? t.radius : t.button_radius;
    var radiusMap = { none: '0px', small: '6px', medium: '12px', full: '9999px' };
    var resolvedRadius = radiusMap[rawRadius] ||
      (typeof rawRadius === 'number' ? rawRadius + 'px' : rawRadius) ||
      '12px';
    setVar('--brand-radius', resolvedRadius);
    setVar('--brand-font', t.fontFamily || t.font_family);
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
    '.cms-form{position:relative;background:var(--brand-bg,#fff);border-radius:20px;color:var(--brand-text,#0F172A);font-family:var(--brand-font,"Inter",system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif);box-shadow:0 1px 2px rgba(15,23,42,.05),0 12px 32px -8px rgba(15,23,42,.14);border:1px solid #E8ECF2}',
    /* Brand accent strip across the top of every form card. */
    '.cms-form::before{content:"";position:absolute;left:0;right:0;top:0;height:5px;border-radius:20px 20px 0 0;background:linear-gradient(90deg,var(--brand-primary,#0F172A),var(--brand-secondary,#F59E0B))}',
    '.cms-title{font-size:22px!important;font-weight:800!important;letter-spacing:-.02em;line-height:1.25;margin:0 0 6px!important}',
    '.cms-sub{color:#64748B!important;font-size:14.5px!important;margin:0 0 20px!important}',
    '.cms-field{display:flex;flex-direction:column;gap:7px;margin-bottom:16px}',
    '.cms-label{font-size:13.5px;font-weight:600;color:#334155;letter-spacing:.005em}',
    '.cms-help{font-size:12.5px;color:#64748B;margin-top:-3px}',
    '.cms-input,.cms-select,.cms-textarea{font:inherit;font-size:15px;color:inherit;width:100%;padding:12px 14px;border:1.5px solid #E2E8F0;border-radius:calc(var(--brand-radius,12px) - 2px);background:#F8FAFC;transition:border-color .18s ease,box-shadow .18s ease,background-color .18s ease;min-height:48px}',
    '.cms-input::placeholder,.cms-textarea::placeholder{color:#94A3B8}',
    '.cms-select{appearance:none;-webkit-appearance:none;padding-right:40px;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%2364748B%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M4 6l4 4 4-4%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center}',
    '.cms-input:hover,.cms-select:hover,.cms-textarea:hover{border-color:#CBD5E1;background-color:#fff}',
    '.cms-textarea{min-height:88px;resize:vertical}',
    '.cms-input:focus,.cms-select:focus,.cms-textarea:focus{outline:none;background-color:#fff;border-color:var(--brand-primary,#0F172A);box-shadow:0 0 0 4px color-mix(in srgb,var(--brand-primary,#0F172A) 16%,transparent)}',
    '.cms-input[aria-invalid="true"],.cms-select[aria-invalid="true"],.cms-textarea[aria-invalid="true"]{border-color:#DC2626}',
    '.cms-input[aria-invalid="true"]:focus,.cms-select[aria-invalid="true"]:focus,.cms-textarea[aria-invalid="true"]:focus{box-shadow:0 0 0 4px rgba(220,38,38,.18)}',
    '.cms-error{color:#B91C1C;font-size:13px;min-height:1em}',
    '.cms-btn{font:inherit;font-size:15.5px;cursor:pointer;border:none;border-radius:calc(var(--brand-radius,12px) - 2px);padding:14px 24px;font-weight:700;letter-spacing:.01em;background:linear-gradient(135deg,var(--brand-primary,#0F172A),color-mix(in srgb,var(--brand-primary,#0F172A) 78%,#000));color:#fff;min-height:52px;transition:transform .12s ease,filter .15s ease,box-shadow .15s ease;box-shadow:0 1px 2px rgba(15,23,42,.08),0 4px 12px color-mix(in srgb,var(--brand-primary,#0F172A) 20%,transparent)}',
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
    '.cms-radio-option,.cms-checkbox-option{display:flex;align-items:center;gap:12px;padding:13px 14px;border:1.5px solid #E2E8F0;background:#fff;border-radius:calc(var(--brand-radius,12px) - 2px);cursor:pointer;transition:border-color .15s,background-color .15s,box-shadow .15s}',
    '.cms-radio-option:has(input:checked),.cms-checkbox-option:has(input:checked){border-color:var(--brand-primary,#0F172A);background:color-mix(in srgb,var(--brand-primary,#0F172A) 6%,#fff);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand-primary,#0F172A) 10%,transparent)}',
    '.cms-radio-option:has(input:checked) .cms-radio-label{font-weight:600}',
    '.cms-radio-option:hover,.cms-checkbox-option:hover{border-color:var(--brand-primary,#9CA3AF);background:color-mix(in srgb,var(--brand-primary,#0F172A) 4%,#fff)}',
    '.cms-radio-option input,.cms-checkbox-option input{accent-color:var(--brand-primary,#0F172A);width:18px;height:18px;flex-shrink:0}',
    '.cms-radio-label,.cms-checkbox-label{font-size:14.5px;color:var(--brand-text,#0F172A)}',
    /* Shared layout pieces for the redesigned templates. */
    '.cms-head{display:flex;align-items:center;gap:12px;margin-bottom:18px}',
    '.cms-head img{max-height:40px;max-width:120px;width:auto;height:auto;border-radius:8px}',
    '.cms-head-badge{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;font-weight:800;font-size:16px;color:#fff;background:linear-gradient(135deg,var(--brand-primary,#0F172A),var(--brand-secondary,#F59E0B));flex-shrink:0}',
    '.cms-head-name{font-size:14px;font-weight:700;color:#0F172A;line-height:1.2}',
    '.cms-head-tag{font-size:12px;color:#64748B}',
    '.cms-section{margin:22px 0 12px;padding-top:18px;border-top:1px dashed #E2E8F0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--brand-primary,#0F172A)}',
    /* Two-column field grid: short inputs pair up, long ones span. */
    '.cms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:0 18px}',
    '.cms-grid>.cms-field.is-wide,.cms-grid>.cms-field[data-wide]{grid-column:1/-1}',
    '@media(max-width:560px){.cms-grid{grid-template-columns:1fr}}',
    '.cms-trust{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 16px;margin-top:14px;font-size:12.5px;color:#64748B}',
    '.cms-trust span::before{content:"\\2713";margin-right:5px;color:var(--brand-primary,#16A34A);font-weight:700}',
    /* Type-ahead suggestion list (venue address + menu / equipment). */
    '.cms-suggest-anchor{position:relative}',
    '.cms-suggest{position:absolute;left:0;z-index:30;max-height:320px;overflow-y:auto;background:#fff;border:1px solid #E2E8F0;border-radius:12px;box-shadow:0 16px 40px -8px rgba(15,23,42,.22),0 2px 6px rgba(15,23,42,.06);padding:6px}',
    '.cms-suggest-item{display:flex;align-items:center;gap:10px;padding:9px 10px;font-size:14px;cursor:pointer;border-radius:8px;color:#0F172A}',
    '.cms-suggest-item:hover,.cms-suggest-item.is-active{background:#F1F5F9}',
    '.cms-suggest-text{display:flex;flex:1;min-width:0;align-items:baseline;justify-content:space-between;gap:10px}',
    '.cms-suggest-item.is-stacked .cms-suggest-text{flex-direction:column;align-items:flex-start;gap:1px}',
    '.cms-suggest-label{font-weight:500;overflow:hidden;text-overflow:ellipsis}',
    '.cms-suggest-item.is-stacked .cms-suggest-label{font-weight:600;white-space:nowrap;max-width:100%}',
    '.cms-suggest-hint{font-size:12px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}',
    '.cms-suggest-icon{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:32px;height:32px;border-radius:50%;background:color-mix(in srgb,var(--brand-primary,#0F172A) 10%,#fff);color:var(--brand-primary,#0F172A)}',
    '.cms-suggest-icon svg{width:16px;height:16px}',
    '.cms-suggest-status{padding:10px 12px;font-size:13px;color:#64748B}',
    '.cms-suggest-footer{padding:8px 10px 4px;margin-top:4px;border-top:1px solid #F1F5F9;font-size:11.5px;color:#94A3B8}',
    /* Menu by course: one card per course, dropdown lines + Add line. */
    '.cms-course-picker{display:flex;flex-direction:column;gap:12px;padding:4px 0}',
    '.cms-course-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,380px),1fr));gap:16px}',
    '.cms-course{border:1px solid #E2E8F0;border-radius:16px;padding:16px 16px 14px;background:#fff;display:flex;flex-direction:column;gap:12px;transition:border-color .15s,box-shadow .15s}',
    '.cms-course.has-picks{border-color:color-mix(in srgb,var(--brand-primary,#0F172A) 35%,#E2E8F0);box-shadow:0 1px 0 rgba(15,23,42,.02),0 6px 18px -10px color-mix(in srgb,var(--brand-primary,#0F172A) 45%,transparent)}',
    '.cms-course-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px}',
    '.cms-course-name{font-size:15px;font-weight:700;color:#0F172A;letter-spacing:-.01em}',
    '.cms-course-meta{display:flex;align-items:center;gap:8px}',
    '.cms-course-count{min-width:22px;height:22px;padding:0 7px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;background:var(--brand-primary,#0F172A)}',
    '.cms-course-count:empty{display:none}',
    '.cms-course-avail{font-size:12px;color:#94A3B8}',
    '.cms-course-select{min-height:46px;font-size:14.5px;background-color:#F8FAFC}',
    '.cms-course-select:disabled{opacity:.6;cursor:default}',
    '.cms-chips{display:flex;flex-wrap:wrap;gap:8px}',
    '.cms-chips:empty{display:none}',
    '.cms-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:6px 6px 6px 12px;border-radius:999px;font-size:13.5px;font-weight:500;color:#0F172A;background:color-mix(in srgb,var(--brand-primary,#0F172A) 8%,#fff);border:1px solid color-mix(in srgb,var(--brand-primary,#0F172A) 22%,#fff);animation:cmsChipIn .18s ease-out both}',
    '.cms-chip-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.cms-chip-x{flex-shrink:0;width:22px;height:22px;border:0;border-radius:50%;background:transparent;color:#64748B;font-size:16px;line-height:1;cursor:pointer}',
    '.cms-chip-x:hover{background:#FEE2E2;color:#B91C1C}',
    '@keyframes cmsChipIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}',
    '.cms-course-summary{font-size:13px;color:#64748B;padding-top:2px}',
    /* Catalogue picker: chosen rows below the search box. */
    '.cms-catalogue-picker{display:flex;flex-direction:column;gap:8px}',
    '.cms-catalogue-search{position:relative}',
    '.cms-catalogue-selected{display:flex;flex-direction:column;gap:7px}',
    '.cms-catalogue-status{font-size:12px;color:#64748B;min-height:18px}',
    '.cms-catalogue-empty{font-size:13px;color:#64748B;padding:4px 0}',
    '.cms-catalogue-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid #E2E8F0;border-radius:calc(var(--brand-radius,12px) - 4px);background:#F8FAFC}',
    '.cms-catalogue-name{display:flex;flex-direction:column;font-size:14px;min-width:0}',
    '.cms-catalogue-name small{font-size:12px;color:#64748B}',
    '.cms-catalogue-remove{font:inherit;font-size:13px;font-weight:600;color:#B91C1C;background:transparent;border:0;cursor:pointer;padding:4px 6px;border-radius:6px;flex-shrink:0}',
    '.cms-catalogue-remove:hover{background:#FEE2E2}',
    /* Standalone single checkbox -- align with adjacent label */
    '.cms-checkbox{accent-color:var(--brand-primary,#0F172A);width:18px;height:18px;flex-shrink:0}',
    '.cms-checkbox-single{align-self:flex-start}',
    '.cms-radio-group[aria-invalid="true"] .cms-radio-option,.cms-checkbox-group[aria-invalid="true"] .cms-checkbox-option,.cms-checkbox-single[aria-invalid="true"]{border-color:#DC2626}',
    '.cms-preview-note{font-size:12px;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:6px 10px;margin-bottom:12px}',
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

  // Read one field's value from the element buildStandardInput returned.
  // Radio / checkbox groups and the single checkbox come back as wrapper
  // elements, so read the real <input> states inside them.
  function readFieldValue(field, inp) {
    if (!inp) return undefined;
    if (field.type === 'radio') {
      if (inp.type === 'radio') return inp.checked ? inp.value : '';
      var picked = inp.querySelector ? inp.querySelector('input[type="radio"]:checked') : null;
      return picked ? picked.value : '';
    }
    if (field.type === 'checkboxes' || field.type === 'multiselect') {
      if (inp.selectedOptions) {
        // Legacy <select multiple> path.
        return Array.from(inp.selectedOptions).map(function (o) { return o.value; });
      }
      if (inp.querySelectorAll) {
        var picks = inp.querySelectorAll('input[type="checkbox"]:checked');
        return Array.prototype.map.call(picks, function (c) { return c.value; });
      }
      return [];
    }
    if (field.type === 'checkbox') {
      if (inp.type === 'checkbox') return inp.checked;
      var cb = inp.querySelector ? inp.querySelector('input[type="checkbox"]') : null;
      return cb ? cb.checked : false;
    }
    if (field.type === 'number' || field.type === 'guests') {
      var raw = String(inp.value || '').trim();
      return raw === '' ? '' : raw;
    }
    return typeof inp.value === 'string' ? inp.value.trim() : inp.value;
  }

  // Focus the first real control of a field (groups are plain divs).
  function focusInput(inp) {
    if (!inp) return;
    var target = inp;
    if (inp.tagName === 'DIV' || inp.tagName === 'LABEL') {
      target = inp.querySelector('input:not([type="hidden"]):not(.cms-sr),select,textarea') || inp;
    }
    try { target.focus(); } catch (e) { /* ignore */ }
    try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ignore */ }
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
        if (!e.input) { p[e.field.id] = e.value; return; }
        p[e.field.id] = readFieldValue(e.field, e.input);
      });
      if (opts.extraValues) {
        var extras = opts.extraValues();
        Object.keys(extras).forEach(function (k) { p[k] = extras[k]; });
      }
      return p;
    }
    function setError(e, msg) {
      if (e.errorEl) e.errorEl.textContent = msg || '';
      if (!e.input) return;
      if (msg) {
        e.input.setAttribute('aria-invalid', 'true');
        if (e.errorEl && e.errorEl.id) e.input.setAttribute('aria-describedby', e.errorEl.id);
      } else {
        e.input.removeAttribute('aria-invalid');
      }
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
      // Clear a field's error as soon as the visitor fixes it.
      e.input.addEventListener('change', function () {
        if (e.errorEl && e.errorEl.textContent) {
          var msg = validateField(e.field, readFieldValue(e.field, e.input));
          if (!msg) setError(e, '');
        }
      });
    });
    // `only` optionally restricts validation to some entries (used by
    // the multi-step template to validate one step at a time).
    function validate(only) {
      var p = readPayload();
      var ok = true;
      var firstBad = null;
      entries.forEach(function (e) {
        if (only && !only(e)) return;
        if (!visible.has(e.field.id)) { setError(e, ''); return; }
        var msg = validateField(e.field, p[e.field.id]);
        setError(e, msg);
        if (msg) {
          ok = false;
          if (!firstBad) firstBad = e;
        }
      });
      return { ok: ok, payload: p, firstBad: firstBad };
    }
    function showInvalid(firstBad) {
      announce(host, 'Please correct the highlighted fields.');
      if (!firstBad) return;
      if (opts.onInvalid) opts.onInvalid(firstBad);
      setTimeout(function () { focusInput(firstBad.input); }, opts.onInvalid ? 120 : 0);
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (alertEl) alertEl.hidden = true;
      var v = validate();
      if (!v.ok) {
        showInvalid(v.firstBad);
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
          // Server-side field errors ({errors: {fieldId: msg}}) go under
          // the matching inputs instead of a generic banner.
          var serverErrors = err && err.data && err.data.errors;
          var firstBad = null;
          if (serverErrors && typeof serverErrors === 'object') {
            entries.forEach(function (e) {
              var msg = serverErrors[e.field.id];
              if (msg) {
                setError(e, String(msg));
                if (!firstBad) firstBad = e;
              }
            });
          }
          if (alertEl) {
            alertEl.hidden = false;
            alertEl.textContent = (err && err.message) || 'Could not submit. Please try again.';
            announce(host, alertEl.textContent);
          }
          if (firstBad) showInvalid(firstBad);
          if (btn) { btn.disabled = false; btn.textContent = defaultLabel; }
        });
    });
    return { syncVisibility: syncVisibility, validate: validate, readPayload: readPayload, getVisible: function () { return visible; } };
  }

  // Render every configured field a template did not lay out itself.
  // Templates with hand-placed rows (spit-braai, corporate, wedding) used
  // to drop custom fields entirely, and a required one then failed
  // server validation with nothing on screen to fill in.
  function appendRemainingFields(form, fields, entries, prefix, skipIds, beforeEl) {
    var skip = {};
    (skipIds || []).forEach(function (id) { skip[id] = true; });
    fields.forEach(function (f) {
      if (skip[f.id]) return;
      if (entries.some(function (e) { return e.field.id === f.id; })) return;
      var id = prefix + f.id;
      var wrap = el('div', { class: 'cms-field', dataset: { fid: f.id } });
      wrap.appendChild(el('label', { class: 'cms-label', for: id, text: f.label + (f.required ? ' *' : '') }));
      if (f.helpText) wrap.appendChild(el('div', { class: 'cms-help', text: f.helpText }));
      var input = buildStandardInput(f, id);
      var err = el('div', { class: 'cms-error', id: id + '_err', 'aria-live': 'polite' });
      wrap.appendChild(input);
      wrap.appendChild(err);
      if (beforeEl && beforeEl.parentNode === form) form.insertBefore(wrap, beforeEl);
      else form.appendChild(wrap);
      entries.push({ field: f, input: input, errorEl: err, wrapper: wrap });
    });
  }

  // Standard input builder used by most templates. Covers every
  // EmbedFieldType the customiser exposes, plus a couple of legacy
  // aliases (tel, guests, multiselect) carried in older configs.
  function buildStandardInput(f, id) {
    var opts = normalizeOptions(f.options);
    if (f.type === 'select' || f.type === 'tier') {
      // 'tier' renders the same as 'select' visually -- pricing-aware
      // templates listen for change events and call estimate().
      var sel = el('select', { class: 'cms-select', id: id, name: f.id });
      // Always start on an empty choice. Without it the browser
      // preselects the first option, so a visitor who never touched the
      // dropdown silently submitted "Wedding" and `required` could
      // never fail.
      var hasBlank = opts.some(function (o) { return o.value === ''; });
      if (!hasBlank) {
        sel.appendChild(el('option', { value: '', text: f.placeholder || 'Select an option' }));
      }
      opts.forEach(function (o) {
        sel.appendChild(el('option', { value: o.value, text: o.label || o.value }));
      });
      sel.value = '';
      return sel;
    }
    if (f.type === 'textarea') {
      return el('textarea', { class: 'cms-textarea', id: id, name: f.id, placeholder: f.placeholder || '', rows: '4' });
    }
    if (f.type === 'checkbox') {
      // Tick box with its own clickable text (placeholder doubles as the
      // statement, e.g. "I agree to the terms").
      var cbLabel = el('label', { class: 'cms-checkbox-option cms-checkbox-single' });
      cbLabel.appendChild(el('input', { class: 'cms-checkbox', type: 'checkbox', id: id, name: f.id, value: 'true' }));
      cbLabel.appendChild(el('span', { class: 'cms-checkbox-label', text: f.placeholder || 'Yes' }));
      return cbLabel;
    }
    if (f.type === 'radio') {
      // A vertical group of labelled radios sharing the field's name.
      var radioWrap = el('div', { class: 'cms-radio-group', role: 'radiogroup', 'aria-label': f.label || f.id });
      opts.forEach(function (o, i) {
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
      // Menu with courses: one section per course with "Add line".
      if (f.id === 'menu_item_ids' && (f.options || []).some(function (o) { return o && o.group; })) {
        return buildCategoryPicker(f, id);
      }
      if (f.id === 'menu_item_ids' || f.id === 'equipment_item_ids') {
        return buildCataloguePicker(f, id);
      }
      // Multi-pick checkbox group. The submit collector reads
      // querySelectorAll(':checked') on these per group.
      var cbWrap = el('div', { class: 'cms-checkbox-group', role: 'group', 'aria-label': f.label || f.id });
      opts.forEach(function (o, i) {
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
    var knownTypes = { text: 1, email: 1, tel: 1, number: 1, date: 1, url: 1 };
    var htmlType = typeMap[f.type] || f.type || 'text';
    if (!knownTypes[htmlType]) htmlType = 'text';
    var rules = f.validation || {};
    var attrs = {
      class: 'cms-input',
      type: htmlType,
      id: id,
      name: f.id,
      placeholder: f.placeholder || '',
      autocomplete: f.autocomplete || (f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'on')
    };
    if (htmlType === 'number') {
      attrs.inputmode = 'numeric';
      attrs.step = rules.step !== undefined ? String(rules.step) : 'any';
      if (rules.min !== undefined) attrs.min = String(rules.min);
      if (rules.max !== undefined) attrs.max = String(rules.max);
    }
    if (htmlType === 'tel') attrs.inputmode = 'tel';
    if (htmlType === 'date') attrs.min = rules.minDate || todayIso();
    var input = el('input', attrs);
    // loader.js sets addressSuggestUrl on venue-type fields.
    if (f.addressSuggestUrl && htmlType === 'text') {
      input.setAttribute('autocomplete', 'street-address');
      if (!f.placeholder) input.setAttribute('placeholder', 'Start typing the venue address');
      attachAddressSuggest(input, f.addressSuggestUrl, f.addressGoogle || null);
    }
    return input;
  }

  // Shared type-ahead list anchored under an input. `source(term, cb)`
  // supplies items ({value,label,hint}); `onPick(item)` runs on click /
  // Enter. Keyboard: Up/Down to move, Enter to pick, Escape to close.
  function attachSuggestions(input, source, onPick, opts) {
    opts = opts || {};
    var list = el('div', { class: 'cms-suggest', role: 'listbox', hidden: 'hidden' });
    var items = [];
    var active = -1;
    var seq = 0;
    // Set while a pick writes the chosen value back: that write fires an
    // input event, which must not start a new search and reopen the list.
    var picking = false;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');

    function mountList() {
      var parent = input.parentNode;
      if (!parent) return;
      if (!list.parentNode) {
        parent.classList.add('cms-suggest-anchor');
        if (input.nextSibling) parent.insertBefore(list, input.nextSibling);
        else parent.appendChild(list);
      }
      // Pin the list directly under the input. Without explicit offsets an
      // absolute child of a flex column sits at the top of the field and
      // covers its label.
      list.style.top = (input.offsetTop + input.offsetHeight + 4) + 'px';
      list.style.left = input.offsetLeft + 'px';
      list.style.width = input.offsetWidth + 'px';
    }
    function close() {
      list.hidden = true;
      active = -1;
      input.setAttribute('aria-expanded', 'false');
    }
    function highlight(i) {
      active = i;
      Array.prototype.forEach.call(list.children, function (node, idx) {
        node.classList.toggle('is-active', idx === i);
        if (idx === i) { try { node.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
      });
    }
    function render(next, status) {
      items = next || [];
      list.innerHTML = '';
      if (!items.length) {
        if (status) {
          mountList();
          list.appendChild(el('div', { class: 'cms-suggest-status', text: status }));
          list.hidden = false;
        } else {
          close();
        }
        return;
      }
      mountList();
      items.forEach(function (item, i) {
        var row = el('div', { class: 'cms-suggest-item' + (opts.stacked ? ' is-stacked' : ''), role: 'option', id: input.id + '__opt' + i });
        if (opts.icon) row.appendChild(el('span', { class: 'cms-suggest-icon', 'aria-hidden': 'true', html: opts.icon }));
        var textWrap = el('span', { class: 'cms-suggest-text' });
        textWrap.appendChild(el('span', { class: 'cms-suggest-label', text: item.label }));
        if (item.hint) textWrap.appendChild(el('span', { class: 'cms-suggest-hint', text: item.hint }));
        row.appendChild(textWrap);
        // mousedown (not click) so the input's blur doesn't close first.
        row.addEventListener('mousedown', function (ev) { ev.preventDefault(); pick(i); });
        list.appendChild(row);
      });
      if (opts.footer) list.appendChild(el('div', { class: 'cms-suggest-footer', text: opts.footer }));
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      active = -1;
    }
    function pick(i) {
      var item = items[i];
      if (!item) return;
      close();
      seq++; // drop any search still in flight
      picking = true;
      try { onPick(item); } finally { picking = false; }
    }
    var run = debounce(function () {
      var mine = ++seq;
      var term = input.value.trim();
      if (opts.loadingText && term.length >= (opts.minChars || 0)) render([], opts.loadingText);
      source(term, function (result, status) {
        if (mine !== seq) return; // a newer keystroke won
        // Visitor tabbed away while results were loading: don't pop open.
        var rootNode = input.getRootNode ? input.getRootNode() : document;
        if (input.isConnected && rootNode.activeElement !== input && document.activeElement !== input) return;
        render(result, status);
      });
    }, opts.delay || 0);
    input.addEventListener('focus', function () { mountList(); if (opts.openOnFocus) run(); });
    input.addEventListener('input', function () { if (picking) return; mountList(); run(); });
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    input.addEventListener('keydown', function (ev) {
      if (list.hidden || !items.length) {
        if (ev.key === 'ArrowDown') { mountList(); run(); }
        return;
      }
      if (ev.key === 'ArrowDown') { ev.preventDefault(); highlight(Math.min(items.length - 1, active + 1)); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); highlight(Math.max(0, active - 1)); }
      else if (ev.key === 'Enter') { ev.preventDefault(); pick(active >= 0 ? active : 0); }
      else if (ev.key === 'Escape') { close(); }
    });
    return { close: close, refresh: run };
  }

  var PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>';

  // Google Places (same search the platform's own address boxes use).
  // Only offered on our own domain, where the referrer-restricted key is
  // valid; anywhere it fails we fall back to the OpenStreetMap search.
  var googleState = { promise: null, failed: false };
  function loadGooglePlaces(key) {
    if (root.google && root.google.maps && root.google.maps.places) return Promise.resolve(root.google);
    if (googleState.promise) return googleState.promise;
    googleState.promise = new Promise(function (resolve, reject) {
      var prevAuthFailure = root.gm_authFailure;
      root.gm_authFailure = function () {
        googleState.failed = true;
        if (typeof prevAuthFailure === 'function') prevAuthFailure();
      };
      var s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&libraries=places&loading=async&callback=__cmsGoogleReady';
      s.async = true;
      root.__cmsGoogleReady = function () { resolve(root.google); };
      s.onerror = function () { googleState.failed = true; reject(new Error('google load failed')); };
      document.head.appendChild(s);
      setTimeout(function () { if (!(root.google && root.google.maps && root.google.maps.places)) reject(new Error('google timeout')); }, 8000);
    });
    return googleState.promise;
  }

  function googlePredictions(term, google, country, cb, fail) {
    try {
      var svc = new google.maps.places.AutocompleteService();
      var req = { input: term };
      if (country) req.componentRestrictions = { country: country };
      svc.getPlacePredictions(req, function (preds, status) {
        if (status === 'OK' && preds) {
          cb(preds.map(function (p) {
            var sf = p.structured_formatting || {};
            return { value: p.description, label: sf.main_text || p.description, hint: sf.secondary_text || '' };
          }));
        } else if (status === 'ZERO_RESULTS') {
          cb([]);
        } else {
          fail();
        }
      });
    } catch (e) { fail(); }
  }

  // Venue address: suggestions while typing. The visitor can always
  // ignore them and type the full address.
  function attachAddressSuggest(input, url, google) {
    function photon(term, cb) {
      fetch(url + '?q=' + encodeURIComponent(term), { credentials: 'omit', mode: 'cors' })
        .then(function (r) { return r.ok ? r.json() : { suggestions: [] }; })
        .then(function (data) {
          if (Array.isArray(data.items) && data.items.length) {
            cb(data.items.map(function (it) { return { value: it.full, label: it.main, hint: it.secondary }; }));
          } else {
            cb((data.suggestions || []).map(function (s) { return { value: s, label: s }; }));
          }
        })
        .catch(function () { cb([]); });
    }
    attachSuggestions(input, function (term, cb) {
      if (term.length < 3) { cb([]); return; }
      if (google && google.key && !googleState.failed) {
        loadGooglePlaces(google.key).then(function (g) {
          if (googleState.failed) { photon(term, cb); return; }
          googlePredictions(term, g, google.country, cb, function () {
            googleState.failed = true;
            photon(term, cb);
          });
        }, function () { photon(term, cb); });
        return;
      }
      photon(term, cb);
    }, function (item) {
      input.value = item.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, { delay: 250, minChars: 3, loadingText: 'Searching addresses...', stacked: true, icon: PIN_SVG, footer: 'Pick your address, or keep typing the full address' });
  }

  // Course order for the menu sections. Unknown categories follow,
  // alphabetically, so any tenant's catalogue still renders sensibly.
  var COURSE_ORDER = ['starters', 'starter', 'appetisers', 'appetizers', 'canapes', 'mains', 'main', 'main course', 'sides', 'side', 'salads', 'salad', 'desserts', 'dessert', 'drinks', 'beverages', 'service', 'other'];
  function courseRank(name) {
    var i = COURSE_ORDER.indexOf(String(name || '').toLowerCase().trim());
    return i === -1 ? 50 : i;
  }
  function singular(name) {
    var n = String(name || '').trim();
    if (/ies$/i.test(n)) return n.slice(0, -3) + 'y';
    if (/s$/i.test(n) && !/ss$/i.test(n)) return n.slice(0, -1);
    return n;
  }

  // Menu picker laid out like the tenant's quote sheet: one section per
  // course (Starters, Mains, Sides, Salads, Desserts...), each with a
  // dropdown of that course's dishes and an "Add line" button for more.
  // Selected ids are mirrored into hidden checked checkboxes so the
  // form runner reads them like any multi-select.
  function buildCategoryPicker(f, id) {
    var options = normalizeOptions(f.options).map(function (o, i) {
      var raw = (f.options || [])[i];
      return { value: o.value, label: o.label, group: (raw && raw.group) || 'Other' };
    });
    var groups = {};
    var order = [];
    options.forEach(function (o) {
      if (!groups[o.group]) { groups[o.group] = []; order.push(o.group); }
      groups[o.group].push(o);
    });
    order.sort(function (a, b) {
      var ra = courseRank(a), rb = courseRank(b);
      return ra !== rb ? ra - rb : a.localeCompare(b);
    });

    // Per course: one roomy card with a dropdown ("Add a starter...").
    // Picking a dish adds it straight away as a removable chip, so there
    // are no empty select rows or separate "Add line" steps to manage.
    var wrap = el('div', { class: 'cms-course-picker', role: 'group', tabindex: '-1', 'aria-label': f.label || 'Menu' });
    var grid = el('div', { class: 'cms-course-grid' });
    var hidden = el('div', { class: 'cms-course-hidden' });
    var summary = el('div', { class: 'cms-course-summary', 'aria-live': 'polite' });
    wrap.appendChild(grid);
    wrap.appendChild(summary);
    wrap.appendChild(hidden);
    var sections = [];

    function sync() {
      hidden.innerHTML = '';
      var total = 0;
      sections.forEach(function (section) {
        total += section.picked.length;
        section.card.classList.toggle('has-picks', section.picked.length > 0);
        section.count.textContent = section.picked.length ? String(section.picked.length) : '';
        // Dropdown lists only dishes not yet chosen in this course.
        var left = 0;
        Array.prototype.forEach.call(section.select.options, function (opt) {
          if (!opt.value) return;
          var taken = section.picked.indexOf(opt.value) !== -1;
          opt.hidden = taken;
          opt.disabled = taken;
          if (!taken) left++;
        });
        section.select.disabled = left === 0;
        section.select.options[0].text = left === 0
          ? 'All ' + section.name.toLowerCase() + ' added'
          : (section.picked.length ? 'Add another ' : 'Add a ') + singular(section.name).toLowerCase() + '...';
        section.chips.innerHTML = '';
        section.picked.forEach(function (value) {
          var opt = section.items.find(function (o) { return o.value === value; });
          var remove = el('button', { type: 'button', class: 'cms-chip-x', 'aria-label': 'Remove ' + (opt ? opt.label : value), html: '&times;' });
          remove.addEventListener('click', function () {
            section.picked.splice(section.picked.indexOf(value), 1);
            sync();
            wrap.dispatchEvent(new Event('change', { bubbles: true }));
            try { section.select.focus(); } catch (e) { /* ignore */ }
          });
          section.chips.appendChild(el('span', { class: 'cms-chip' }, [el('span', { class: 'cms-chip-label', text: opt ? opt.label : value }), remove]));
          var cb = el('input', { type: 'checkbox', name: f.id, value: value, class: 'cms-sr', tabindex: '-1', 'aria-hidden': 'true' });
          cb.checked = true;
          hidden.appendChild(cb);
        });
      });
      summary.textContent = total
        ? total + ' dish' + (total === 1 ? '' : 'es') + ' chosen'
        : 'Pick from any course. You can choose several dishes per course.';
    }

    order.forEach(function (name) {
      var section = { name: name, items: groups[name], picked: [] };
      section.count = el('span', { class: 'cms-course-count' });
      section.chips = el('div', { class: 'cms-chips' });
      section.select = el('select', { class: 'cms-select cms-course-select', 'aria-label': 'Add from ' + name });
      section.select.appendChild(el('option', { value: '', text: '' }));
      section.items.forEach(function (o) { section.select.appendChild(el('option', { value: o.value, text: o.label })); });
      section.select.addEventListener('change', function () {
        var v = section.select.value;
        if (v && section.picked.indexOf(v) === -1) section.picked.push(v);
        section.select.value = '';
        sync();
        wrap.dispatchEvent(new Event('change', { bubbles: true }));
      });
      section.card = el('div', { class: 'cms-course' }, [
        el('div', { class: 'cms-course-head' }, [
          el('span', { class: 'cms-course-name', text: name }),
          el('span', { class: 'cms-course-meta' }, [section.count, el('span', { class: 'cms-course-avail', text: section.items.length + ' option' + (section.items.length === 1 ? '' : 's') })])
        ]),
        section.select,
        section.chips
      ]);
      grid.appendChild(section.card);
      sections.push(section);
    });
    sync();
    return wrap;
  }

  // Menu / equipment picker: type to search (or just click to browse),
  // pick from the list, chosen items appear below with Remove.
  function buildCataloguePicker(f, id) {
    var options = normalizeOptions(f.options);
    var selected = new Map();
    var isMenu = f.id === 'menu_item_ids';
    var wrap = el('div', {
      class: 'cms-catalogue-picker',
      role: 'group',
      tabindex: '-1',
      'aria-label': f.label || 'Catalogue items'
    });
    var search = el('input', {
      class: 'cms-input',
      type: 'search',
      id: id,
      placeholder: isMenu ? 'Type a dish, e.g. lamb, salad, dessert...' : 'Type an item, e.g. plates, chafing dish...',
      autocomplete: 'off'
    });
    var searchWrap = el('div', { class: 'cms-catalogue-search' }, [search]);
    var resultStatus = el('div', { class: 'cms-catalogue-status', 'aria-live': 'polite' });
    var picked = el('div', { class: 'cms-catalogue-selected', 'aria-live': 'polite' });
    wrap.appendChild(searchWrap);
    wrap.appendChild(resultStatus);
    wrap.appendChild(picked);

    function matches(term) {
      var words = term.toLowerCase().split(/\s+/).filter(Boolean);
      return options.filter(function (option) {
        if (selected.has(String(option.value))) return false;
        var hay = (String(option.label || option.value) + ' ' + (option.group || '')).toLowerCase();
        return words.every(function (w) { return hay.indexOf(w) !== -1; });
      });
    }
    function updateStatus() {
      resultStatus.textContent = selected.size > 0
        ? selected.size + ' added'
        : options.length + ' to choose from';
    }
    function renderSelected() {
      picked.innerHTML = '';
      if (selected.size === 0) {
        picked.appendChild(el('div', { class: 'cms-catalogue-empty', text: 'Nothing added yet.' }));
        updateStatus();
        return;
      }
      selected.forEach(function (option, value) {
        var hidden = el('input', {
          type: 'checkbox',
          name: f.id,
          value: value,
          checked: 'checked',
          class: 'cms-sr',
          tabindex: '-1',
          'aria-hidden': 'true'
        });
        hidden.checked = true;
        var remove = el('button', {
          class: 'cms-catalogue-remove',
          type: 'button',
          text: 'Remove',
          'aria-label': 'Remove ' + (option.label || value)
        });
        remove.addEventListener('click', function () {
          selected.delete(value);
          renderSelected();
          wrap.dispatchEvent(new Event('change', { bubbles: true }));
        });
        var text = el('span', { class: 'cms-catalogue-name' }, [option.label || value]);
        if (option.group) text.appendChild(el('small', { text: option.group }));
        picked.appendChild(el('div', { class: 'cms-catalogue-row' }, [hidden, text, remove]));
      });
      updateStatus();
    }
    attachSuggestions(search, function (term, cb) {
      var found = matches(term).slice(0, 60);
      cb(found.map(function (o) { return { value: o.value, label: o.label, hint: o.group || '', option: o }; }),
        term ? 'No matches for "' + term + '"' : 'Everything is already added');
    }, function (item) {
      selected.set(String(item.value), item.option);
      search.value = '';
      renderSelected();
      wrap.dispatchEvent(new Event('change', { bubbles: true }));
      // Keep the list open so several items can be added in a row.
      setTimeout(function () { search.focus(); }, 0);
    }, { openOnFocus: true });
    renderSelected();
    return wrap;
  }

  // Long answers, choices, pickers and addresses take a full row.
  var WIDE_TYPES = { textarea: 1, radio: 1, checkboxes: 1, checkbox: 1, multiselect: 1 };
  function isWideField(f) {
    // Service tick boxes sit side by side.
    if (f.id === 'waiter_service' || f.id === 'onsite_chef') return false;
    return !!(WIDE_TYPES[f.type] || f.mapsTo === 'venue' || f.id === 'venue' ||
      f.id === 'venue_address' || f.id === 'menu_item_ids' || f.id === 'equipment_item_ids');
  }

  // Brand header used by the redesigned templates: logo (or an initial
  // badge in the brand colours) + company name + a short tagline.
  function buildHeader(brand, tagline) {
    var b = brand || {};
    var head = el('div', { class: 'cms-head' });
    function badge() {
      return el('span', { class: 'cms-head-badge', 'aria-hidden': 'true', text: String(b.companyName || '?').trim().charAt(0).toUpperCase() });
    }
    if (b.logoUrl) {
      var img = el('img', { src: b.logoUrl, alt: b.companyName || '' });
      // A broken or expired logo URL would show alt text in a broken box.
      img.addEventListener('error', function () {
        if (img.parentNode) img.parentNode.replaceChild(badge(), img);
      });
      head.appendChild(img);
    } else if (b.companyName) {
      head.appendChild(badge());
    }
    if (b.companyName || tagline) {
      head.appendChild(el('div', null, [
        b.companyName ? el('div', { class: 'cms-head-name', text: b.companyName }) : null,
        tagline ? el('div', { class: 'cms-head-tag', text: tagline }) : null
      ]));
    }
    return head;
  }

  function buildTrustLine(items) {
    var row = el('div', { class: 'cms-trust' });
    (items || ['Free, no-obligation quote', 'Reply within 1 working day', 'Your details stay private']).forEach(function (t) {
      row.appendChild(el('span', { text: t }));
    });
    return row;
  }

  // Public API exposed to templates only via the helpers param.
  root.__cmsEmbedHelpers = {
    bindFormRunner: bindFormRunner,
    buildStandardInput: buildStandardInput,
    readFieldValue: readFieldValue,
    focusInput: focusInput,
    normalizeOptions: normalizeOptions,
    appendRemainingFields: appendRemainingFields,
    buildHeader: buildHeader,
    isWideField: isWideField,
    buildTrustLine: buildTrustLine,
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
