p = 'public/embed/helpers.js'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)


rep("""    '.cms-form{background:var(--brand-bg,#fff);border-radius:var(--brand-radius,16px);color:var(--brand-text,#0F172A);font-family:var(--brand-font,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif);box-shadow:0 1px 3px rgba(15,23,42,.04),0 4px 16px rgba(15,23,42,.06)}',
    '.cms-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}',
    '.cms-label{font-size:14px;font-weight:600;color:var(--brand-text,#0F172A)}',
    '.cms-help{font-size:12px;color:#6B7280}',
    '.cms-input,.cms-select,.cms-textarea{font:inherit;color:inherit;width:100%;padding:11px 13px;border:1px solid #D1D5DB;border-radius:calc(var(--brand-radius,12px) - 4px);background:#fff;transition:border-color .18s ease,box-shadow .18s ease,background-color .18s ease;min-height:44px}',
    '.cms-input:hover,.cms-select:hover,.cms-textarea:hover{border-color:#9CA3AF}',""",
"""    '.cms-form{position:relative;overflow:hidden;background:var(--brand-bg,#fff);border-radius:20px;color:var(--brand-text,#0F172A);font-family:var(--brand-font,"Inter",system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif);box-shadow:0 1px 2px rgba(15,23,42,.05),0 12px 32px -8px rgba(15,23,42,.14);border:1px solid #E8ECF2}',
    /* Brand accent strip across the top of every form card. */
    '.cms-form::before{content:"";position:absolute;left:0;right:0;top:0;height:5px;background:linear-gradient(90deg,var(--brand-primary,#0F172A),var(--brand-secondary,#F59E0B))}',
    '.cms-title{font-size:22px!important;font-weight:800!important;letter-spacing:-.02em;line-height:1.25;margin:0 0 6px!important}',
    '.cms-sub{color:#64748B!important;font-size:14.5px!important;margin:0 0 20px!important}',
    '.cms-field{display:flex;flex-direction:column;gap:7px;margin-bottom:16px}',
    '.cms-label{font-size:13.5px;font-weight:600;color:#334155;letter-spacing:.005em}',
    '.cms-help{font-size:12.5px;color:#64748B;margin-top:-3px}',
    '.cms-input,.cms-select,.cms-textarea{font:inherit;font-size:15px;color:inherit;width:100%;padding:12px 14px;border:1.5px solid #E2E8F0;border-radius:calc(var(--brand-radius,12px) - 2px);background:#F8FAFC;transition:border-color .18s ease,box-shadow .18s ease,background-color .18s ease;min-height:48px}',
    '.cms-input::placeholder,.cms-textarea::placeholder{color:#94A3B8}',
    '.cms-select{appearance:none;-webkit-appearance:none;padding-right:40px;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%2364748B%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M4 6l4 4 4-4%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center}',
    '.cms-input:hover,.cms-select:hover,.cms-textarea:hover{border-color:#CBD5E1;background-color:#fff}',""")

rep("""    '.cms-input:focus,.cms-select:focus,.cms-textarea:focus{outline:none;border-color:var(--brand-primary,#0F172A);box-shadow:0 0 0 4px color-mix(in srgb,var(--brand-primary,#0F172A) 22%,transparent)}',""",
"""    '.cms-input:focus,.cms-select:focus,.cms-textarea:focus{outline:none;background-color:#fff;border-color:var(--brand-primary,#0F172A);box-shadow:0 0 0 4px color-mix(in srgb,var(--brand-primary,#0F172A) 16%,transparent)}',""")

rep("""    '.cms-btn{font:inherit;cursor:pointer;border:none;border-radius:calc(var(--brand-radius,12px) - 2px);padding:13px 22px;font-weight:600;background:var(--brand-primary,#0F172A);color:#fff;min-height:48px;""",
"""    '.cms-btn{font:inherit;font-size:15.5px;cursor:pointer;border:none;border-radius:calc(var(--brand-radius,12px) - 2px);padding:14px 24px;font-weight:700;letter-spacing:.01em;background:linear-gradient(135deg,var(--brand-primary,#0F172A),color-mix(in srgb,var(--brand-primary,#0F172A) 78%,#000));color:#fff;min-height:52px;""")

# radio / checkbox options as selectable cards
rep("""    '.cms-radio-option,.cms-checkbox-option{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #E5E7EB;border-radius:calc(var(--brand-radius,12px) - 4px);cursor:pointer;transition:border-color .15s,background-color .15s}',""",
"""    '.cms-radio-option,.cms-checkbox-option{display:flex;align-items:center;gap:12px;padding:13px 14px;border:1.5px solid #E2E8F0;background:#fff;border-radius:calc(var(--brand-radius,12px) - 2px);cursor:pointer;transition:border-color .15s,background-color .15s,box-shadow .15s}',
    '.cms-radio-option:has(input:checked),.cms-checkbox-option:has(input:checked){border-color:var(--brand-primary,#0F172A);background:color-mix(in srgb,var(--brand-primary,#0F172A) 6%,#fff);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand-primary,#0F172A) 10%,transparent)}',
    '.cms-radio-option:has(input:checked) .cms-radio-label{font-weight:600}',""")

rep("""    '.cms-radio-label,.cms-checkbox-label{font-size:14px;color:var(--brand-text,#0F172A)}',""",
"""    '.cms-radio-label,.cms-checkbox-label{font-size:14.5px;color:var(--brand-text,#0F172A)}',
    /* Shared layout pieces for the redesigned templates. */
    '.cms-head{display:flex;align-items:center;gap:12px;margin-bottom:18px}',
    '.cms-head img{max-height:40px;max-width:120px;width:auto;height:auto;border-radius:8px}',
    '.cms-head-badge{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;font-weight:800;font-size:16px;color:#fff;background:linear-gradient(135deg,var(--brand-primary,#0F172A),var(--brand-secondary,#F59E0B));flex-shrink:0}',
    '.cms-head-name{font-size:14px;font-weight:700;color:#0F172A;line-height:1.2}',
    '.cms-head-tag{font-size:12px;color:#64748B}',
    '.cms-section{margin:22px 0 12px;padding-top:18px;border-top:1px dashed #E2E8F0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--brand-primary,#0F172A)}',
    '.cms-trust{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 16px;margin-top:14px;font-size:12.5px;color:#64748B}',
    '.cms-trust span::before{content:"\\\\2713";margin-right:5px;color:var(--brand-primary,#16A34A);font-weight:700}',""")

# shared header builder + trust line, exported
rep("""  // Public API exposed to templates only via the helpers param.""",
"""  // Brand header used by the redesigned templates: logo (or an initial
  // badge in the brand colours) + company name + a short tagline.
  function buildHeader(brand, tagline) {
    var b = brand || {};
    var head = el('div', { class: 'cms-head' });
    if (b.logoUrl) {
      head.appendChild(el('img', { src: b.logoUrl, alt: b.companyName || '' }));
    } else if (b.companyName) {
      head.appendChild(el('span', { class: 'cms-head-badge', 'aria-hidden': 'true', text: String(b.companyName).trim().charAt(0).toUpperCase() }));
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

  // Public API exposed to templates only via the helpers param.""")
rep("""    appendRemainingFields: appendRemainingFields,""", """    appendRemainingFields: appendRemainingFields,
    buildHeader: buildHeader,
    buildTrustLine: buildTrustLine,""")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
