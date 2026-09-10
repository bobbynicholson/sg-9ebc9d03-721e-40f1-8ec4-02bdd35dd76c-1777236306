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
    var template = templateOverride || 'quick-card';
    var fields = [
      { id: 'name', type: 'text', label: 'Your name', required: true, visible: true, order: 1 },
      { id: 'email', type: 'email', label: 'Email', required: true, visible: true, order: 2 },
      { id: 'phone', type: 'phone', label: 'Phone', required: true, visible: true, order: 3 },
      {
        id: 'event_type',
        type: 'select',
        label: 'Event type',
        required: true,
        visible: true,
        order: 4,
        options: [
          { value: '', label: 'Choose an event type' },
          { value: 'Birthday', label: 'Birthday' },
          { value: 'Wedding', label: 'Wedding' },
          { value: 'Corporate event', label: 'Corporate event' },
          { value: 'Family celebration', label: 'Family celebration' },
          { value: 'Other', label: 'Other' }
        ]
      },
      { id: 'event_date', type: 'date', label: 'Event date', required: true, visible: true, order: 5 },
      { id: 'guest_count', type: 'number', label: 'Number of guests', required: true, visible: true, validation: { min: 1, max: 5000 }, order: 6 },
      { id: 'venue', type: 'text', label: 'Venue address', required: true, visible: true, order: 7 }
    ];

    // The quote-oriented previews should demonstrate the complete visitor
    // journey, not the five-field generic lead form. These are clearly demo
    // choices; live embeds receive the tenant's current catalogue from the
    // config API.
    if (template === 'detailed-multi-step' || template === 'pricing-calculator') {
      var quoteOnly = { showIfFieldId: 'request_type', showIfValue: 'quote' };
      fields.unshift({
        id: 'request_type',
        type: 'radio',
        label: 'How can we help?',
        helpText: 'Choose a short enquiry, or build a detailed quote request from the live menu.',
        required: true,
        visible: true,
        order: 0,
        options: [
          { value: 'enquiry', label: 'Quick enquiry · tell us the basics' },
          { value: 'quote', label: 'Build my quote request · choose menu and equipment' }
        ]
      });
      fields.forEach(function (field) {
        if (field.id === 'venue') field.conditional = quoteOnly;
      });
      fields.push(
        {
          id: 'tier',
          type: 'tier',
          label: 'Preferred package',
          required: false,
          visible: true,
          order: 8,
          conditional: quoteOnly,
          options: [
            { value: 'essential', label: 'Essential' },
            { value: 'classic', label: 'Classic' },
            { value: 'premium', label: 'Premium' }
          ]
        },
        {
          id: 'menu_item_ids',
          type: 'checkboxes',
          label: 'Menu preferences',
          helpText: 'Choose the dishes you are interested in. We will confirm portions and availability before sending the quote.',
          required: false,
          visible: true,
          order: 9,
          conditional: quoteOnly,
          options: [
            { value: 'demo-beef-strips', label: 'Spicy Beef Strips · Starters · R50' },
            { value: 'demo-chicken-wings', label: 'Sticky Chicken Wings · Starters · R40' },
            { value: 'demo-lamb-ribs-half', label: 'Lamb Ribs Half Portion · Starters · R50' },
            { value: 'demo-boerewors', label: 'Grilled Boerewors (150g) · Mains · R25' },
            { value: 'demo-lamb-ribs-full', label: 'Lamb Ribs Full Portion · Mains · R85' },
            { value: 'demo-lamb-package-25', label: 'Lamb Spit (on-site) · serves 25 · Mains · R4,750' },
            { value: 'demo-lamb-package-35', label: 'Lamb Spit (on-site) · serves 35 · Mains · R5,250' },
            { value: 'demo-lamb-package-50', label: 'Lamb Spit (on-site) · serves 50 · Mains · R6,050' },
            { value: 'demo-lamb-full', label: 'Lamb Spit Full Portion · Mains · R105' },
            { value: 'demo-lamb-half', label: 'Lamb Spit Half Portion · Mains · R65' },
            { value: 'demo-chicken', label: 'Roasted Chicken Pieces · Mains · R40' },
            { value: 'demo-kiddies', label: 'Kiddies Meals · Mains · R75' },
            { value: 'demo-coleslaw', label: 'Coleslaw · Salads · R20' },
            { value: 'demo-curry-noodle', label: 'Curry Noodle Salad · Salads · R22.50' },
            { value: 'demo-greek', label: 'Greek Salad · Salads · R22.50' },
            { value: 'demo-green', label: 'Green Salad · Salads · R17.50' },
            { value: 'demo-pasta', label: 'Pasta Salad · Salads · R22.50' },
            { value: 'demo-pasta-vinaigrette', label: 'Pasta Vinaigrette · Salads · R22.50' },
            { value: 'demo-potato', label: 'Potato Salad · Salads · R22.50' },
            { value: 'demo-baby-potatoes', label: 'Baby Potatoes · Sides · R7.50' },
            { value: 'demo-garlic', label: 'Garlic Bread · Sides · R7.50' },
            { value: 'demo-veg', label: 'Mixed Chunky Vegetables · Sides · R25' },
            { value: 'demo-roasted-potatoes', label: 'Roasted Baby Potatoes · Sides · R10' },
            { value: 'demo-brownie', label: 'Chocolate Brownie & Cream · Desserts · R40' },
            { value: 'demo-malva', label: 'Malva Pudding & Custard · Desserts · R35' },
            { value: 'demo-peppermint', label: 'Peppermint Crisp Tart · Desserts · R35' },
            { value: 'demo-waiter', label: 'Waiter / Server · Service · R300' }
          ]
        },
        {
          id: 'equipment_item_ids',
          type: 'checkboxes',
          label: 'Equipment required',
          helpText: 'Optional. Select what you expect to need; the team will confirm editable quantities.',
          required: false,
          visible: true,
          order: 10,
          conditional: quoteOnly,
          options: [
            { value: 'demo-bowl-plastic', label: 'Plastic bowl · Crockery · R2.50' },
            { value: 'demo-bowl', label: 'Porcelain bowl · Crockery · R2.50' },
            { value: 'demo-plate-20', label: '20 cm Plate · Crockery · R2.50' },
            { value: 'demo-plate', label: '25 cm Plate · Crockery · R2.50' },
            { value: 'demo-fork', label: 'Stainless steel fork · Cutlery · R2' },
            { value: 'demo-knife', label: 'Stainless steel knife · Cutlery · R2' },
            { value: 'demo-spoon', label: 'Stainless steel spoon · Cutlery · R2' },
            { value: 'demo-chafing', label: 'Chafing dish · Service · R85' }
          ]
        },
        {
          id: 'dietary',
          type: 'textarea',
          label: 'Dietary requirements or allergies',
          placeholder: 'Vegetarian, halaal, allergies, children’s meals...',
          required: false,
          visible: true,
          order: 11,
          conditional: quoteOnly
        },
        {
          id: 'notes',
          type: 'textarea',
          label: 'Anything else we should know?',
          placeholder: 'Serving time, access information, special requests...',
          required: false,
          visible: true,
          order: 12
        }
      );
    }
    return {
      slug: slug || 'default',
      template: template,
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
      tiers: [
        { id: 'essential', name: 'Essential', price_per_person_min: 95, price_per_person_max: 135 },
        { id: 'classic', name: 'Classic', price_per_person_min: 150, price_per_person_max: 210 },
        { id: 'premium', name: 'Premium', price_per_person_min: 220, price_per_person_max: 300 }
      ],
      fields: fields
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
      : fetchConfig(token, slug);

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
