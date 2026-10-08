p = 'public/embed/loader.js'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)


rep("""  function fetchConfig(token, slug) {
    var key = token + '::' + (slug || 'default');
    if (configCache[key]) return Promise.resolve(configCache[key]);
    var url = API_BASE + '/api/public/embed/' + encodeURIComponent(token) + '/config?slug=' + encodeURIComponent(slug || 'default');""",
"""  function fetchConfig(token, slug, preview) {
    var key = token + '::' + (slug || 'default') + (preview ? '::preview' : '');
    if (configCache[key]) return Promise.resolve(configCache[key]);
    // preview=1 tells the API not to count an admin preview as a view.
    var url = API_BASE + '/api/public/embed/' + encodeURIComponent(token) + '/config?slug=' + encodeURIComponent(slug || 'default') + (preview ? '&preview=1' : '');""")

rep("""      if (!r.ok) throw new Error('Config request failed (' + r.status + ')');""",
"""      if (r.status === 404) throw new Error('This form is paused or no longer exists.');
      if (!r.ok) throw new Error('Config request failed (' + r.status + ')');""")

rep("""  function mount(hostEl) {
    if (hostEl.__cmsMounted) return;
    hostEl.__cmsMounted = true;

    var token = hostEl.getAttribute('data-token');
    var slug = hostEl.getAttribute('data-slug') || 'default';
    var templateOverride = hostEl.getAttribute('data-template') || null;
    var demoMode = hostEl.getAttribute('data-demo') === 'true';""",
"""  // A 'tier' field saved without options (the default pricing form)
  // takes its choices from the company's pricing tiers.
  function prepareFields(config) {
    var tiers = Array.isArray(config.tiers) ? config.tiers : [];
    (config.fields || []).forEach(function (f) {
      if (!f) return;
      var hasOptions = Array.isArray(f.options) && f.options.length > 0;
      if ((f.type === 'tier' || f.id === 'tier') && !hasOptions && tiers.length > 0) {
        f.options = tiers.map(function (t) {
          return { value: String(t.id), label: String(t.name || t.id) };
        });
      }
    });
    return config;
  }

  // Admin editor drafts arrive in the DB row shape; translate to the
  // public config shape the templates read.
  function mergeDraft(base, draft) {
    var next = Object.assign({}, base);
    if (Array.isArray(draft.fields)) {
      var draftIds = {};
      draft.fields.forEach(function (f) { if (f && f.id) draftIds[f.id] = true; });
      // Keep the server-added live catalogue fields (menu, equipment,
      // request type) that the draft never contains.
      var serverOnly = (base.fields || []).filter(function (f) {
        return f && !draftIds[f.id] &&
          (f.id === 'menu_item_ids' || f.id === 'equipment_item_ids' || f.id === 'request_type');
      });
      next.fields = JSON.parse(JSON.stringify(draft.fields)).concat(serverOnly);
    }
    if (draft.theme && typeof draft.theme === 'object') next.theme = draft.theme;
    if (draft.template_id) next.template = draft.template_id;
    if (typeof draft.success_message === 'string') next.successMessage = draft.success_message || base.successMessage;
    return next;
  }

  function mount(hostEl) {
    if (hostEl.__cmsMounted) return;
    hostEl.__cmsMounted = true;

    var token = hostEl.getAttribute('data-token');
    var slug = hostEl.getAttribute('data-slug') || 'default';
    var templateOverride = hostEl.getAttribute('data-template') || null;
    // Preview mode: the REAL saved config is rendered (unlike demo mode's
    // placeholder fields) but nothing is ever submitted. Used by the
    // admin editor, form cards and the "Preview" links.
    var previewMode = hostEl.getAttribute('data-preview') === 'true';
    var demoMode = hostEl.getAttribute('data-demo') === 'true' || previewMode;""")

rep("""    var configReq = demoMode
      ? Promise.resolve(fallbackConfig(slug, templateOverride, demoOpts))
      : fetchConfig(token, slug);

    Promise.all([configReq, getHelpers()]).then(function (results) {
      var config = results[0];
      var helpers = results[1];
      if (templateOverride) config.template = templateOverride;
      var templateId = config.template || 'quick-card';
""",
"""    var configReq = previewMode
      ? fetchConfig(token, slug, true)
      : demoMode
        ? Promise.resolve(fallbackConfig(slug, templateOverride, demoOpts))
        : fetchConfig(token, slug);

    var baseConfig = null;
    var helpersRef = null;

    function renderConfig(rawConfig) {
      var config = prepareFields(JSON.parse(JSON.stringify(rawConfig)));
      var helpers = helpersRef;
      if (templateOverride && !previewMode) config.template = templateOverride;
      var templateId = config.template || 'quick-card';
""")

rep("""          submit: function (payload, turnstileToken, honeypot) {
            if (demoMode) {
              return Promise.resolve({ ok: true, message: '[demo] form submission was skipped' });
            }""",
"""          submit: function (payload, turnstileToken, honeypot) {
            if (demoMode) {
              return Promise.resolve({
                ok: true,
                message: previewMode
                  ? 'Preview only: everything checked out, but no lead was created. Visitors using your shared link or website snippet will create real leads.'
                  : '[demo] form submission was skipped'
              });
            }""")

rep("""        tpl.render(shadow, config, config.brand || {}, renderHelpers);
      });
    }).catch(function (err) {""",
"""        tpl.render(shadow, config, config.brand || {}, renderHelpers);
      });
    }

    // The admin editor posts unsaved edits so the preview shows them
    // before Save. Same-origin only: a third-party page can never
    // re-skin a tenant's form this way.
    function listenForDrafts() {
      window.addEventListener('message', function (ev) {
        if (ev.origin !== window.location.origin) return;
        var data = ev.data;
        if (!data || data.type !== 'embed-draft' || !data.config) return;
        renderConfig(mergeDraft(baseConfig, data.config)).catch(function () { /* keep last render */ });
      });
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'embed-preview-ready', slug: slug }, window.location.origin);
        }
      } catch (e) { /* ignore */ }
    }

    Promise.all([configReq, getHelpers()]).then(function (results) {
      baseConfig = results[0];
      helpersRef = results[1];
      if (previewMode) listenForDrafts();
      return renderConfig(baseConfig);
    }).catch(function (err) {""")

open(p, 'w', encoding='utf-8').write(s)
print('patched')
