/* Hosted quote-request page bootstrap. Shared by the clean link
   (/quote/<company>/<form>, rendered by /api/public/embed/hosted) and the
   legacy /embed/form.html?token=...&slug=... link.

   Reads window.__CMS_HOSTED = { token, slug, preview, compact } when the
   server provided it, otherwise the URL query. Mounts the real form (the
   loader fetches fields, template and brand) into #hp-mount and fills the
   brand panel from the same config when the server didn't prerender it. */
(function () {
  'use strict';
  var SCRIPT = document.currentScript;
  var BASE = (function () {
    try { return new URL(SCRIPT.src).pathname.replace(/hosted\.js.*$/, ''); } catch (e) { return '/embed/'; }
  })();
  var params = new URLSearchParams(location.search);
  var opts = window.__CMS_HOSTED || {};
  var token = String(opts.token || params.get('token') || '').trim();
  var slug = String(opts.slug || params.get('slug') || 'default').trim();
  var preview = opts.preview === true || params.get('preview') === '1';
  var compact = opts.compact === true || params.get('compact') === '1';

  var mountEl = document.getElementById('hp-mount');
  var brandEl = document.getElementById('hp-brand');
  if (compact) document.body.classList.add('compact');
  if (preview) {
    var bar = document.getElementById('hp-preview-bar');
    if (bar) bar.hidden = false;
  }

  // The APIs validate the token as a UUID; mirror that so a mangled link
  // shows a clear message instead of a dead spinner.
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(token)) {
    mountEl.innerHTML = '<div class="hp-err">This form link is incomplete or invalid. Please ask for a fresh link.</div>';
    return;
  }

  function text(tag, cls, value) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    n.textContent = value;
    return n;
  }

  function fillBrand(brand) {
    if (!brandEl || brandEl.getAttribute('data-prerendered') === 'true') return;
    var b = brand || {};
    var root = document.documentElement;
    if (b.primaryColor) root.style.setProperty('--hp-primary', b.primaryColor);
    if (b.secondaryColor) root.style.setProperty('--hp-secondary', b.secondaryColor);
    var inner = document.createElement('div');
    inner.className = 'hp-brand-inner';
    if (b.logoUrl) {
      var logo = document.createElement('div');
      logo.className = 'hp-logo';
      var img = document.createElement('img');
      img.src = b.logoUrl;
      img.alt = b.companyName || '';
      img.onerror = function () { logo.replaceWith(text('div', 'hp-logo-badge', (b.companyName || '?').charAt(0).toUpperCase())); };
      logo.appendChild(img);
      inner.appendChild(logo);
    } else if (b.companyName) {
      inner.appendChild(text('div', 'hp-logo-badge', b.companyName.charAt(0).toUpperCase()));
    }
    if (b.companyName) inner.appendChild(text('div', 'hp-company', b.companyName));
    inner.appendChild(text('h1', 'hp-title', 'Request a quote'));
    inner.appendChild(text('p', 'hp-lede', 'Tell us about your event, pick what you would like from our menu, and we will send you a tailored quote.'));
    var ul = document.createElement('ul');
    ul.className = 'hp-points';
    ['Free, no-obligation quote', 'Reply within 1 working day', 'Menu and equipment tailored to your event', 'Your details stay private'].forEach(function (p) {
      ul.appendChild(text('li', '', p));
    });
    inner.appendChild(ul);
    brandEl.innerHTML = '';
    brandEl.appendChild(inner);
  }

  var div = document.createElement('div');
  div.setAttribute('data-embed-form', '');
  div.setAttribute('data-token', token);
  div.setAttribute('data-slug', slug);
  // The page gives the form the full right-hand column.
  div.style.setProperty('--cms-form-max', '100%');
  if (preview) div.setAttribute('data-preview', 'true');
  mountEl.appendChild(div);

  // Brand panel + tab title. preview=1 so this cosmetic fetch never counts
  // as a form view (the loader's own fetch does that).
  fetch('/api/public/embed/' + encodeURIComponent(token) + '/config?slug=' + encodeURIComponent(slug) + '&preview=1', { credentials: 'omit' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) {
      if (!cfg) return;
      fillBrand(cfg.brand);
      if (cfg.brand && cfg.brand.companyName) document.title = 'Request a quote | ' + cfg.brand.companyName;
    })
    .catch(function () { /* cosmetic only */ });

  var s = document.createElement('script');
  s.src = BASE + 'loader.js';
  s.async = true;
  document.body.appendChild(s);
})();
