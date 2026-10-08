p = 'src/components/admin/embed/SnippetDialog.tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)


rep('''/**
 * Snippet generator dialog. Shows the embed HTML, three install guides
 * (WordPress / Wix / Custom), a "send to my web developer" compose drawer
 * mirroring the QuoteComposeDrawer pattern, and a Preview Live link that
 * opens the demo URL in a new tab.
 */''', '''/**
 * Snippet generator dialog. Two ways to publish a form:
 *   1. Shareable link - a hosted page (/embed/form.html) that works on its
 *      own: paste it as a website button/menu link, WhatsApp, QR code.
 *   2. Website snippet - two lines of HTML that render the form inline.
 * Both submit to the same public API and create real leads. Also has
 * install guides, a "send to my web developer" compose drawer and a
 * preview that renders the saved form without submitting.
 */''')

rep('''function buildSnippet(token: string, slug: string, host: string) {''', '''export function buildFormLink(token: string, slug: string, host: string, opts: { preview?: boolean } = {}) {
  const qs = new URLSearchParams({ token, slug });
  if (opts.preview) qs.set("preview", "1");
  return `${host}/embed/form.html?${qs.toString()}`;
}

function buildSnippet(token: string, slug: string, host: string) {''')

rep('''  const [copied, setCopied] = useState(false);
  const [composeOpen''', '''  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [composeOpen''')

rep('''  // Preview link includes &template= so the demo page loads the same
  // template the operator is about to embed (helpers.js previously
  // defaulted to quick-card when template was missing - the preview
  // would not match what the visitor would see).
  const previewHref = form && currentToken
    ? `/embed/demo.html?token=${currentToken}&slug=${encodeURIComponent(form.slug)}&template=${encodeURIComponent(form.template_id)}`
    : "#";''', '''  // Public link visitors use. Same page as the preview, minus preview=1.
  const shareLink = form && currentToken ? buildFormLink(currentToken, form.slug, host) : "";
  // Preview renders the SAVED form (real fields, brand, template) but
  // never submits. The old demo.html link showed placeholder fields and
  // developer controls, which looked broken in a new tab.
  const previewHref = form && currentToken
    ? buildFormLink(currentToken, form.slug, host, { preview: true })
    : "#";''')

rep('''  async function copy() {''', '''  async function copyLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setLinkCopied(true);
      toast({ title: "Link copied", description: "Paste it on your website, WhatsApp, social bio or a QR code." });
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Select and copy manually.", variant: "destructive" });
    }
  }

  async function copy() {''')

rep('''              <Code2 className="w-5 h-5 text-blue-600" />
              Embed snippet for {form.name}
            </DialogTitle>
            <DialogDescription>
              Paste this two-line snippet anywhere in your site's HTML. Mobile-responsive, loads async, no page-speed impact.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* The snippet */}''', '''              <Code2 className="w-5 h-5 text-blue-600" />
              Publish {form.name}
            </DialogTitle>
            <DialogDescription>
              Use the link or the snippet. Every submission arrives in Leads and notifies your team.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Option 1: hosted link */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900">1. Shareable link</h4>
              <p className="text-xs text-slate-500 mt-0.5 mb-2">
                A ready-made form page. Link to it from a &quot;Get a quote&quot; button on any website, or share it on WhatsApp, social media, email or a QR code.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  readOnly
                  value={shareLink || "Generating..."}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                  aria-label="Shareable form link"
                />
                <div className="flex gap-2">
                  <Button onClick={copyLink} disabled={!shareLink} className="gap-2 bg-brand-primary hover:bg-brand-primary/90">
                    <Copy className="w-4 h-4" /> {linkCopied ? "Copied!" : "Copy link"}
                  </Button>
                  <Button variant="outline" asChild className="gap-2">
                    <a href={shareLink || "#"} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" /> Open
                    </a>
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-amber-700 mt-1.5">
                Opening the link yourself shows the live form: a test submission there creates a real lead. Use Preview to check it without creating one.
              </p>
            </div>

            {/* Option 2: the snippet */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900">2. Website snippet</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Shows the form inside one of your own web pages. Paste these lines into a Custom HTML / Embed block. Mobile-friendly and loads in the background.
              </p>
            </div>''')

rep('''                <a href={previewHref} target="_blank" rel="noopener noreferrer">
                  <Eye className="w-4 h-4" /> Preview live
                </a>''', '''                <a href={previewHref} target="_blank" rel="noopener noreferrer">
                  <Eye className="w-4 h-4" /> Preview (no lead created)
                </a>''')

# developer email: include link + snippet
rep('''        <DevComposeDrawer
          form={form}
          snippet={snippet}''', '''        <DevComposeDrawer
          form={form}
          snippet={snippet}
          shareLink={shareLink}''')
rep('''function DevComposeDrawer({
  form, snippet, companyName, previewHref, onClose,
}: {
  form: Form;
  snippet: string;''', '''function DevComposeDrawer({
  form, snippet, shareLink, companyName, previewHref, onClose,
}: {
  form: Form;
  snippet: string;
  shareLink: string;''')
rep('''You can preview exactly what visitors will see here:
${typeof window !== "undefined" ? window.location.origin : ""}${previewHref}
''', '''If a full form on the page is not possible, link a "Get a quote" button to this hosted form instead:
${shareLink}

You can preview exactly what visitors will see here (preview submissions are not saved):
${previewHref}
''')

open(p, 'w', encoding='utf-8').write(s)
print('ok')
