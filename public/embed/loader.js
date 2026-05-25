/* CateringMS embed loader -- single entry point.
   Tenants drop a <script async src=".../embed/loader.js"> + a <div data-embed-form>.
   Vanilla JS, IIFE, no globals leaked. */
(function () {
  'use strict';

  // Resolve the API base from the script's own URL so it Just Works on prod and dev.
  var SELF = document.currentScript || (function () {
    var ss = document.getElementsByTagName('script');
    return ss[ss.length - 1];
  })();
  var SELF_SRC = (SELF && SELF.src) || '';
  var API_BASE = (function () {
    try {
      var u = new URL(SELF_SRC);
      return u.origin;
    } catch (e) {
      return '';
    }
  })();
  var EMBED_BASE = (function () {
    try {
      var u = new URL(SELF_SRC);
      return u.origin + u.pathname.replace(/loader\.js.*$/, '');
    } catch (e) {
      return '/embed/';
    }
  })();

  var TEMPLATE_IDS = {
    'quick-card': 1,
    'modern-inline': 1,
    'luxe-vertical': 1,
    'floating-widget': 1,
    'detailed-multi-step': 1,
    'pricing-calculator': 1,
    'wedding-specialist': 1,
    'corporate-catering': 1,
    'event-estimator': 1,
    'spit-braai-quick': 1
  };

  var helpersPromise = null;
  var templatePromises = {};
  var configCache = {};

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function getHelpers() {
    if (window.__cmsEmbedHelpers) return Promise.resolve(window.__cmsEmbedHelpers);
    if (!helpersPromise) {
      helpersPromise = loadScript(EMBED_BASE + 'helpers.js').then(function () {
        return window.__cmsEmbedHelpers;
      });
    }
    return helpersPromise;
  }

  function getTemplate(id) {
    if (!TEMPLATE_IDS[id]) id = 'quick-card';
    if (window.__cmsTemplates && window.__cmsTemplates[id]) {
      return Promise.resolve(window.__cmsTemplates[id]);
    }
    if (!templatePromises[id]) {
      templatePromises[id] = loadScript(EMBED_BASE + 'templates/' + id + '.js').then(function () {
        return (window.__cmsTemplates && window.__cmsTemplates[id]) || null;
      });
    }
    return templatePromises[id];
  }

  function fetchConfig(token, slug) {
    var key = token + '::' + (slug || 'default');
    if (configCache[key]) return Promise.resolve(configCache[key]);
    var url = API_BASE + '/api/public/embed/' + encodeURIComponent(token) + '/config?slug=' + encodeURIComponent(slug || 'default');
    return fetch(url, { credentials: 'omit', mode: 'cors' }).then(function (r) {
      if (!r.ok) throw new Error('Config request failed (' + r.status + ')');
      return r.json();
    }).then(function (data) {
      configCache[key] = data;
      return data;
    });
  }

  // LCF-H (task #229, 2026-05-25): companyName arg + brandPrimary +
  // brandSecondary. The admin live-preview iframes pass the tenant's
  // real company name + brand colours through the URL, so the
  // fallback config used in demoMode (when the API config fetch is
  // skipped) shows "Spit Braai Delivery" instead of the platform-
  // generic "Catering Co." placeholder.
  function fallbackConfig(slug, templateOverride, opts) {
    opts = opts || {};
    return {
      slug: slug || 'default',
      template: templateOverride || 'quick-card',
      brand: {
        companyName: opts.companyName || 'Your Company',
        primaryColor: opts.primaryColor || '#0F172A',
        secondaryColor: opts.secondaryColor || '#F59E0B',
        logoUrl: opts.logoUrl || null
      },
      theme: {},
      currency: opts.currency || 'ZAR',
      successMessage: 'Thanks. We will be in touch shortly.',
      redirectUrl: null,
      tiers: [],
      fields: [
        { id: 'name', type: 'text', label: 'Your name', required: true, order: 1 },
        { id: 'email', type: 'email', label: 'Email', required: true, order: 2 },
        { id: 'phone', type: 'phone', label: 'Phone', required: false, order: 3 },
        { id: 'event_date', type: 'date', label: 'Event date', required: true, order: 4 },
        { id: 'guests', type: 'number', label: 'Guests', required: true, validation: { min: 1, max: 5000 }, order: 5 }
      ]
    };
  }

  function showError(host, msg) {
    host.innerHTML = '';
    var d = document.createElement('div');
    d.style.cssText = 'font:14px system-ui,-apple-system,sans-serif;color:#991B1B;padding:12px;border:1px solid #FECACA;border-radius:8px;background:#FEF2F2';
    d.textContent = msg;
    host.appendChild(d);
  }

  function mount(hostEl) {
    if (hostEl.__cmsMounted) return;
    hostEl.__cmsMounted = true;

    var token = hostEl.getAttribute('data-token');
    var slug = hostEl.getAttribute('data-slug') || 'default';
    var templateOverride = hostEl.getAttribute('data-template') || null;
    var demoMode = hostEl.getAttribute('data-demo') === 'true';
    // LCF-H (task #229, 2026-05-25): tenant-aware demo fallback.
    // Admin preview iframes pass companyName + primaryColor +
    // secondaryColor as data attrs so the fallback config used in
    // demoMode shows the real tenant branding, not the platform
    // placeholder. Read here; threaded into fallbackConfig below.
    var demoCompanyName = hostEl.getAttribute('data-company-name') || null;
    var demoPrimaryColor = hostEl.getAttribute('data-primary-color') || null;
    var demoSecondaryColor = hostEl.getAttribute('data-secondary-color') || null;
    var demoLogoUrl = hostEl.getAttribute('data-logo-url') || null;
    var demoCurrency = hostEl.getAttribute('data-currency') || null;

    if (!token && !demoMode) {
      showError(hostEl, 'Embed form is missing data-token.');
      return;
    }

    // Attach an open shadow root for style isolation.
    var shadow = hostEl.attachShadow ? hostEl.attachShadow({ mode: 'open' }) : hostEl;

    // Insert a loading placeholder immediately so layout doesn't jump.
    var placeholder = document.createElement('div');
    placeholder.style.cssText = 'min-height:120px;display:flex;align-items:center;justify-content:center;font:14px system-ui,sans-serif;color:#6B7280';
    placeholder.textContent = 'Loading form...';
    shadow.appendChild(placeholder);

    // LCF-H: tenant brand opts threaded through both the demoMode
    // path (admin preview iframes) and the API-fetch failure path
    // (third-party site loading with a stale token).
    var demoOpts = {
      companyName: demoCompanyName,
      primaryColor: demoPrimaryColor,
      secondaryColor: demoSecondaryColor,
      logoUrl: demoLogoUrl,
      currency: demoCurrency,
    };
    var configReq = demoMode
      ? Promise.resolve(fallbackConfig(slug, templateOverride, demoOpts))
      : fetchConfig(token, slug).catch(function () {
          // Graceful degradation: still render something usable in dev.
          return fallbackConfig(slug, templateOverride, demoOpts);
        });

    Promise.all([configReq, getHelpers()]).then(function (results) {
      var config = results[0];
      var helpers = results[1];
      if (templateOverride) config.template = templateOverride;
      var templateId = config.template || 'quick-card';

      return getTemplate(templateId).then(function (tpl) {
        if (!tpl || typeof tpl.render !== 'function') {
          throw new Error('Template not available: ' + templateId);
        }
        // Clear placeholder, apply theme, render.
        shadow.innerHTML = '';
        helpers.applyTheme(shadow, config.brand, config.theme);

        // Wrap submission so the loader controls success/redirect uniformly.
        // Demo-mode short-circuits: a leaked /embed/demo.html?token=victim
        // URL must NOT actually post to the live API.
        var renderHelpers = Object.assign({}, helpers, {
          submit: function (payload, turnstileToken, honeypot) {
            if (demoMode) {
              return Promise.resolve({ ok: true, message: '[demo] form submission was skipped' });
            }
            return helpers.submitForm(API_BASE, token, slug, payload, turnstileToken, honeypot);
          },
          estimate: function (guests, tierId) {
            if (demoMode) {
              return Promise.resolve({ ok: true, total: 0, perPerson: 0 });
            }
            return helpers.fetchEstimate(API_BASE, token, guests, tierId);
          },
          onSuccess: function (response) {
            handleSuccess(shadow, config, response, helpers);
          },
          apiBase: API_BASE,
          token: token,
          slug: slug,
          demoMode: demoMode
        });

        tpl.render(shadow, config, config.brand || {}, renderHelpers);
      });
    }).catch(function (err) {
      // Replace shadow content with a graceful error.
      try {
        shadow.innerHTML = '';
        var d = document.createElement('div');
        d.style.cssText = 'font:14px system-ui,-apple-system,sans-serif;color:#991B1B;padding:12px;border:1px solid #FECACA;border-radius:8px;background:#FEF2F2';
        d.textContent = 'Sorry, the form could not load. ' + (err && err.message ? err.message : '');
        shadow.appendChild(d);
      } catch (e) { /* ignore */ }
    });
  }

  function isSafeRedirect(url) {
    // Defence in depth -- admin-write side validates too, but a stale
    // config from before the validator landed could still carry a
    // javascript:/data: payload that runs on the embedding host.
    if (typeof url !== 'string' || !url) return false;
    var trimmed = url.trim();
    if (trimmed.length > 2000) return false;
    try {
      var u = new URL(trimmed);
      if (u.protocol !== 'https:') return false;
      if (u.username || u.password) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function handleSuccess(shadow, config, response, helpers) {
    var redirect = (response && response.redirect_url) || config.redirectUrl;
    if (redirect && isSafeRedirect(redirect)) {
      try { window.top.location.href = redirect; return; } catch (e) {
        window.location.href = redirect;
        return;
      }
    }
    shadow.innerHTML = '';
    helpers.injectStyles(shadow, '');
    helpers.applyTheme(shadow, config.brand, config.theme);
    var msg = (response && response.message) || config.successMessage || 'Thanks. We will be in touch shortly.';

    // Animated check icon -- the .cms-success-check + .cms-success-check svg
    // CSS in helpers.js handles the pulse-in + line-draw animation.
    var checkWrap = document.createElement('span');
    checkWrap.className = 'cms-success-check';
    checkWrap.setAttribute('aria-hidden', 'true');
    checkWrap.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="5,12 10,17 19,7"/></svg>';

    var wrap = helpers.el('div', { class: 'cms-form cms-success', role: 'status', 'aria-live': 'polite' });
    wrap.appendChild(checkWrap);
    wrap.appendChild(helpers.el('h3', { text: 'Thank you' }));
    wrap.appendChild(helpers.el('p', { text: msg }));
    shadow.appendChild(wrap);
    helpers.announce(shadow, 'Form submitted successfully.');
  }

  function init() {
    var nodes = document.querySelectorAll('[data-embed-form]');
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Watch for late-injected mount points (e.g. SPA hosts).
  if (typeof MutationObserver !== 'undefined') {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches('[data-embed-form]')) mount(n);
          if (n.querySelectorAll) {
            var inner = n.querySelectorAll('[data-embed-form]');
            for (var k = 0; k < inner.length; k++) mount(inner[k]);
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
