/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Snippet generator dialog. Shows the embed HTML, three install guides
 * (WordPress / Wix / Custom), a "send to my web developer" compose drawer
 * mirroring the QuoteComposeDrawer pattern, and a Preview Live link that
 * opens the demo URL in a new tab.
 */

import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, ExternalLink, Mail, Send, Eye, Code2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { composeEmail } from "@/lib/composeEmail";

interface Form {
  id: string;
  name: string;
  slug: string;
  template_id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: Form | null;
  embedToken?: string;
  companyName?: string;
}

function buildSnippet(token: string, slug: string) {
  return `<!-- ${slug} -- powered by CateringMS -->
<div data-embed-form data-token="${token}" data-slug="${slug}"></div>
<script async src="https://cateringms.com/embed/loader.js"></script>`;
}

export function SnippetDialog({ open, onOpenChange, form, embedToken, companyName }: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const snippet = useMemo(() => {
    if (!form || !embedToken) return "";
    return buildSnippet(embedToken, form.slug);
  }, [form, embedToken]);

  const previewHref = form && embedToken
    ? `/embed/demo.html?token=${embedToken}&slug=${encodeURIComponent(form.slug)}`
    : "#";

  async function copy() {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast({ title: "Snippet copied", description: "Paste it anywhere on your marketing site." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Select and copy manually.", variant: "destructive" });
    }
  }

  if (!form) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Code2 className="w-5 h-5 text-indigo-600" />
              Embed snippet for {form.name}
            </DialogTitle>
            <DialogDescription>
              Paste this two-line snippet anywhere in your site's HTML. Mobile-responsive, loads async, no page-speed impact.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* The snippet */}
            <Card className="border-0 shadow-sm bg-slate-900 text-slate-100">
              <CardContent className="p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
                  <code>{snippet || "Generating..."}</code>
                </pre>
              </CardContent>
            </Card>
            <div className="flex flex-wrap gap-2">
              <Button onClick={copy} className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600">
                <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy snippet"}
              </Button>
              <Button variant="outline" asChild className="gap-2">
                <a href={previewHref} target="_blank" rel="noopener noreferrer">
                  <Eye className="w-4 h-4" /> Preview live
                </a>
              </Button>
              <Button variant="outline" onClick={() => setComposeOpen(true)} className="gap-2">
                <Send className="w-4 h-4" /> Send to my web developer
              </Button>
            </div>

            {/* Install guides */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">Install guides</h4>
              <Accordion type="single" collapsible className="border border-slate-200 rounded-lg">
                <AccordionItem value="wp">
                  <AccordionTrigger className="px-4 text-sm font-medium">WordPress / Elementor</AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 text-sm text-slate-700 space-y-2">
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>Edit the page where you want the form.</li>
                      <li>Add an <span className="font-mono bg-slate-100 px-1 rounded">HTML</span> block (Gutenberg) or <span className="font-mono bg-slate-100 px-1 rounded">HTML widget</span> (Elementor).</li>
                      <li>Paste the snippet above into the block.</li>
                      <li>Update the page. The form appears wherever you placed the block.</li>
                    </ol>
                    <p className="text-xs text-slate-500">Tip: don't wrap the snippet in <code>&lt;p&gt;</code> tags -- WordPress sometimes does this automatically. Use a Custom HTML block, not the visual editor.</p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="wix">
                  <AccordionTrigger className="px-4 text-sm font-medium">Wix / Squarespace</AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 text-sm text-slate-700 space-y-2">
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>In the Wix / Squarespace editor, drag in an <span className="font-medium">Embed Code</span> or <span className="font-medium">Code Block</span>.</li>
                      <li>Paste the snippet above.</li>
                      <li>Resize the embed container to roughly 600px tall on desktop -- it auto-shrinks on mobile.</li>
                      <li>Publish the page.</li>
                    </ol>
                    <p className="text-xs text-slate-500">Squarespace requires a Business plan for code blocks. Wix supports them on every paid plan.</p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="custom">
                  <AccordionTrigger className="px-4 text-sm font-medium">Custom HTML / Webflow / React</AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 text-sm text-slate-700 space-y-2">
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>Drop the <code>&lt;div data-embed-form&gt;</code> markup wherever you want the form to render.</li>
                      <li>Include the <code>&lt;script async&gt;</code> tag once per page (the loader is idempotent if it appears twice).</li>
                      <li>For React / Next.js, render the markup with <code>dangerouslySetInnerHTML</code> or a <code>useEffect</code> that injects the script tag.</li>
                      <li>For Webflow, use an Embed element on the canvas. The snippet works inside the published HTML without a custom CMS field.</li>
                    </ol>
                    <p className="text-xs text-slate-500">The loader is hosted on our CDN and auto-detects every embed div on the page. No extra config required.</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={composeOpen} onOpenChange={setComposeOpen}>
        <SheetContent side="right" className="w-full sm:w-[520px] overflow-y-auto">
          <DevComposeDrawer
            form={form}
            snippet={snippet}
            companyName={companyName}
            previewHref={previewHref}
            onClose={() => setComposeOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

function DevComposeDrawer({
  form, snippet, companyName, previewHref, onClose,
}: {
  form: Form;
  snippet: string;
  companyName?: string;
  previewHref: string;
  onClose: () => void;
}) {
  const initialSubject = `Add a quote-request form to our website`;
  const initialBody = `Hi,

I'd like to add an embeddable quote-request form to our website. Could you drop the snippet below into ${form.name === "Default" ? "the relevant page" : `the page where this form should live ("${form.name}")`}?

The snippet:

${snippet}

Steps:
1. Open the page where you want the form to appear.
2. Add a Custom HTML block (or your CMS's equivalent).
3. Paste the snippet above into that block.
4. Publish.

You can preview exactly what visitors will see here:
${typeof window !== "undefined" ? window.location.origin : ""}${previewHref}

If anything looks off after you paste it, let me know and I can fix it on my side without redeploying.

Thanks${companyName ? `,\n${companyName}` : ""}`;

  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [copied, setCopied] = useState(false);

  const payload = { to: "", subject, body };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Send className="w-5 h-5 text-emerald-600" />
          Send install instructions
        </SheetTitle>
        <SheetDescription>
          Pre-filled email with the snippet and step-by-step install instructions for your developer.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 mt-4">
        <div>
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">To</label>
          <Input
            placeholder="developer@example.com"
            value={payload.to}
            onChange={(e) => { (payload as any).to = e.target.value; }}
            className="mt-1"
            type="email"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Subject</label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
          <Button
            variant="default"
            onClick={() => {
              window.open(composeEmail.gmailUrl({ to: (payload as any).to || "", subject, body }), "_blank", "noopener");
            }}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <ExternalLink className="w-4 h-4" /> Open in Gmail
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              window.open(composeEmail.outlookUrl({ to: (payload as any).to || "", subject, body }), "_blank", "noopener");
            }}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Open in Outlook
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = composeEmail.mailto({ to: (payload as any).to || "", subject, body });
            }}
            className="gap-2"
          >
            <Mail className="w-4 h-4" /> Default mail app
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const ok = await composeEmail.copyToClipboard({ to: (payload as any).to || "", subject, body });
              if (ok) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
            className="gap-2"
          >
            <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy"}
          </Button>
        </div>

        <Button variant="ghost" onClick={onClose} className="w-full">Close</Button>
      </div>
    </>
  );
}
