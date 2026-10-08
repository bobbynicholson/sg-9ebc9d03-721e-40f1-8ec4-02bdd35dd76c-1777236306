def patch(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8').write(s)


# ---------------------------------------------------------------- helpers.js
patch('public/embed/helpers.js', [
    # List positioned explicitly under the input (absolute children of a
    # flex column otherwise sit at the top and cover the label).
    ("""    function mountList() {
      if (list.parentNode) return;
      var parent = input.parentNode;
      if (!parent) return;
      parent.classList.add('cms-suggest-anchor');
      if (input.nextSibling) parent.insertBefore(list, input.nextSibling);
      else parent.appendChild(list);
    }""", """    function mountList() {
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
    }"""),
    ("""      items.forEach(function (item, i) {
        var row = el('div', { class: 'cms-suggest-item', role: 'option', id: input.id + '__opt' + i });
        row.appendChild(el('span', { class: 'cms-suggest-label', text: item.label }));
        if (item.hint) row.appendChild(el('span', { class: 'cms-suggest-hint', text: item.hint }));""",
     """      mountList();
      items.forEach(function (item, i) {
        var row = el('div', { class: 'cms-suggest-item' + (opts.stacked ? ' is-stacked' : ''), role: 'option', id: input.id + '__opt' + i });
        if (opts.icon) row.appendChild(el('span', { class: 'cms-suggest-icon', 'aria-hidden': 'true', html: opts.icon }));
        var textWrap = el('span', { class: 'cms-suggest-text' });
        textWrap.appendChild(el('span', { class: 'cms-suggest-label', text: item.label }));
        if (item.hint) textWrap.appendChild(el('span', { class: 'cms-suggest-hint', text: item.hint }));
        row.appendChild(textWrap);"""),
    ("""      if (!items.length) {
        if (status) {
          list.appendChild(el('div', { class: 'cms-suggest-status', text: status }));""",
     """      if (!items.length) {
        if (status) {
          mountList();
          list.appendChild(el('div', { class: 'cms-suggest-status', text: status }));"""),
    ("""        list.appendChild(row);
      });
      list.hidden = false;""", """        list.appendChild(row);
      });
      if (opts.footer) list.appendChild(el('div', { class: 'cms-suggest-footer', text: opts.footer }));
      list.hidden = false;"""),
    # Address source: Google Places on our own domain, Photon elsewhere.
    ("""  // Venue address: suggestions from /address-suggest while typing. The
  // visitor can always ignore them and type the full address.
  function attachAddressSuggest(input, url) {
    attachSuggestions(input, function (term, cb) {
      if (term.length < 4) { cb([]); return; }
      fetch(url + '?q=' + encodeURIComponent(term), { credentials: 'omit', mode: 'cors' })
        .then(function (r) { return r.ok ? r.json() : { suggestions: [] }; })
        .then(function (data) {
          cb((data.suggestions || []).map(function (s) { return { value: s, label: s }; }));
        })
        .catch(function () { cb([]); });
    }, function (item) {
      input.value = item.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, { delay: 300, minChars: 4, loadingText: 'Searching addresses...' });
  }""", """  var PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>';

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
  }"""),
    ("""    if (f.addressSuggestUrl && htmlType === 'text') {
      input.setAttribute('autocomplete', 'street-address');
      attachAddressSuggest(input, f.addressSuggestUrl);
    }""", """    if (f.addressSuggestUrl && htmlType === 'text') {
      input.setAttribute('autocomplete', 'street-address');
      if (!f.placeholder) input.setAttribute('placeholder', 'Start typing the venue address');
      attachAddressSuggest(input, f.addressSuggestUrl, f.addressGoogle || null);
    }"""),
    # Styles: neutral highlight, stacked two-line rows with a pin.
    ("""    '.cms-suggest{position:absolute;left:0;right:0;z-index:20;margin-top:4px;max-height:280px;overflow-y:auto;background:#fff;border:1px solid #CBD5E1;border-radius:calc(var(--brand-radius,12px) - 4px);box-shadow:0 10px 28px rgba(15,23,42,.14)}',
    '.cms-suggest-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;font-size:14px;cursor:pointer;border-bottom:1px solid #F1F5F9}',
    '.cms-suggest-item:last-child{border-bottom:0}',
    '.cms-suggest-item:hover,.cms-suggest-item.is-active{background:color-mix(in srgb,var(--brand-primary,#0F172A) 8%,#fff)}',
    '.cms-suggest-hint{font-size:12px;color:#64748B;white-space:nowrap}',
    '.cms-suggest-status{padding:10px 12px;font-size:13px;color:#64748B}',""",
     """    '.cms-suggest{position:absolute;left:0;z-index:30;max-height:320px;overflow-y:auto;background:#fff;border:1px solid #E2E8F0;border-radius:12px;box-shadow:0 16px 40px -8px rgba(15,23,42,.22),0 2px 6px rgba(15,23,42,.06);padding:6px}',
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
    '.cms-suggest-footer{padding:8px 10px 4px;margin-top:4px;border-top:1px solid #F1F5F9;font-size:11.5px;color:#94A3B8}',"""),
    # Wide screens: auto-fit columns.
    ("""    '.cms-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}',""",
     """    '.cms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:0 18px}',"""),
])

# ---------------------------------------------------------------- loader.js
patch('public/embed/loader.js', [
    ("""      if (isAddress && (!f.type || f.type === 'text') && token && UUID_RE.test(token)) {
        f.addressSuggestUrl = API_BASE + '/api/public/embed/' + encodeURIComponent(token) + '/address-suggest';
      }""", """      if (isAddress && (!f.type || f.type === 'text') && token && UUID_RE.test(token)) {
        f.addressSuggestUrl = API_BASE + '/api/public/embed/' + encodeURIComponent(token) + '/address-suggest';
        // Google Places only on our own domain (hosted /quote page and
        // admin previews): the browser key is restricted to it.
        if (config.googleMapsKey && location.origin === API_BASE) {
          f.addressGoogle = { key: config.googleMapsKey, country: config.addressCountry || null };
        }
      }"""),
])

# ---------------------------------------------------------------- config API
patch('src/pages/api/public/embed/[token]/config.ts', [
    ("""    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,""",
     """    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
    // Public browser key (same one the admin address boxes use). The form
    // only uses it on our own domain, where its referrer restriction holds.
    googleMapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null,
    addressCountry: ({ ZAR: "za", GBP: "gb", USD: "us", AUD: "au", NZD: "nz" } as Record<string, string>)[
      String((company as any).currency || "ZAR").toUpperCase()
    ] || null,"""),
])

# ---------------------------------------------------------------- Photon API: main / secondary lines
patch('src/pages/api/public/embed/[token]/address-suggest.ts', [
    ("""function formatFeature(f: any): string | null {
  const p = f?.properties || {};
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");""",
     """interface SuggestItem { main: string; secondary: string; full: string }

// Two-line suggestion like Google's: "17 Denison Way" / "Edgemead, Cape Town".
// A house number the visitor typed is kept when Photon only matched the street.
function toItem(f: any, typedNumber: string | null): SuggestItem | null {
  const p = f?.properties || {};
  const isStreet = p.osm_key === "highway" || p.type === "street";
  const number = p.housenumber || (isStreet && typedNumber ? typedNumber : null);
  const streetName = isStreet ? p.name : p.street;
  const street = [number, streetName].filter(Boolean).join(" ");
  const place = !isStreet && p.name && p.name !== p.street ? p.name : null;
  const main = place || street;
  if (!main) return null;
  const secondaryParts = [
    place ? street : null,
    p.district || p.locality || null,
    p.city || p.county || null,
    p.postcode || null,
  ].filter(Boolean) as string[];
  const secondary = secondaryParts.filter((x, i) => secondaryParts.indexOf(x) === i && x !== main).join(", ");
  if (!secondary) return null;
  return { main, secondary, full: `${main}, ${secondary}` };
}

function formatFeature(f: any): string | null {
  const p = f?.properties || {};
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");"""),
    ("""  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.at < RESULT_TTL_MS) {
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
    return res.status(200).json({ ok: true, suggestions: cached.suggestions });
  }""", """  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.at < RESULT_TTL_MS) {
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
    return res.status(200).json({ ok: true, suggestions: cached.suggestions, items: cached.items });
  }
  const typedNumber = (q.match(/^(\\d+[a-z]?)\\s+/i) || [])[1] || null;"""),
    ("""const resultCache = new Map<string, { suggestions: string[]; at: number }>();""",
     """const resultCache = new Map<string, { suggestions: string[]; items: SuggestItem[]; at: number }>();"""),
    ("""    const seen = new Set<string>();
    const suggestions: string[] = [];
    for (const feature of Array.isArray(json?.features) ? json.features : []) {
      const label = formatFeature(feature);
      if (label && !seen.has(label)) {
        seen.add(label);
        suggestions.push(label);
      }
    }
    const top = suggestions.slice(0, 6);
    if (top.length > 0) {
      resultCache.set(cacheKey, { suggestions: top, at: Date.now() });""", """    const seen = new Set<string>();
    const suggestions: string[] = [];
    const items: SuggestItem[] = [];
    for (const feature of Array.isArray(json?.features) ? json.features : []) {
      const item = toItem(feature, typedNumber);
      const label = item ? item.full : formatFeature(feature);
      if (label && !seen.has(label)) {
        seen.add(label);
        suggestions.push(label);
        if (item) items.push(item);
      }
    }
    const top = suggestions.slice(0, 6);
    const topItems = items.slice(0, 6);
    if (top.length > 0) {
      resultCache.set(cacheKey, { suggestions: top, items: topItems, at: Date.now() });"""),
    ("""    return res.status(200).json({ ok: true, suggestions: top });""",
     """    return res.status(200).json({ ok: true, suggestions: top, items: topItems });"""),
])

# ---------------------------------------------------------------- hosted page: use wide screens
patch('public/embed/hosted.css', [
    (""".hp-form-inner { width: 100%; max-width: 860px; margin: 0 auto; flex: 1; }""",
     """.hp-form-inner { width: 100%; max-width: 1240px; margin: 0 auto; flex: 1; }"""),
    (""".hp-form { padding: 40px 48px 32px; display: flex; flex-direction: column; }""",
     """.hp-form { padding: 40px clamp(20px, 3vw, 56px) 32px; display: flex; flex-direction: column; }"""),
])
print('ok')
