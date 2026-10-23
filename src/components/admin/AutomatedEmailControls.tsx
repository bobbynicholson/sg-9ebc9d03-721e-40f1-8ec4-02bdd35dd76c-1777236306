import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Search } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutomatedEmailInfoChip } from "./AutomatedEmailInfoChip";
import { AUTOMATED_EMAIL_SECTIONS, automatedEmailControlId, automatedEmailCategoryId, automatedEmailNavigationRef } from "@/lib/email/automatedEmailSections";
import { AUTOMATED_EMAIL_TEMPLATES, resolveEmailDeliveryMode, type EmailDeliveryMode } from "@/lib/email/automatedEmailTemplates";
import { getTemplateDefinition } from "@/lib/messageTemplates/registry";
import { useTenantHref } from "@/lib/tenantUrl";

interface Props {
  preferences: unknown;
  onModeChange: (templateKey: string, mode: EmailDeliveryMode) => void;
}

export function AutomatedEmailControls({ preferences, onModeChange }: Props) {
  const router = useRouter();
  const { withSlug } = useTenantHref();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  useEffect(() => {
    let frame: number;
    const revealTarget = () => {
      let id = window.location.hash.slice(1);
      try { id = decodeURIComponent(id); } catch { /* Ignore malformed URL encoding. */ }
      const section = AUTOMATED_EMAIL_SECTIONS.find((category) => automatedEmailCategoryId(category.id) === id ||
        category.templates.some((template) => automatedEmailControlId(template.key) === id));
      if (!section) { setHighlightedKey(null); return; }
      const template = section.templates.find((email) => automatedEmailControlId(email.key) === id);
      setSearch("");
      setOpenSections((current) => current.includes(section.id) ? current : [...current, section.id]);
      setHighlightedKey(template?.key || null);
      // The outer Automation card may also be closed on a direct chatbot link.
      rootRef.current?.dispatchEvent(new CustomEvent("ui:expand-section", { bubbles: true }));
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const target = document.getElementById(id);
        target?.scrollIntoView({ block: "center", behavior: "smooth" });
        if (template) (target?.querySelector<HTMLElement>('[role="switch"]') || target)?.focus({ preventScroll: true });
      });
    };
    revealTarget();
    window.addEventListener("hashchange", revealTarget);
    return () => { window.removeEventListener("hashchange", revealTarget); window.cancelAnimationFrame(frame); };
  }, [router.asPath]);
  const updateSearch = (value: string) => {
    setSearch(value);
    setOpenSections(value.trim() ? AUTOMATED_EMAIL_SECTIONS.map((section) => section.id) : []);
  };
  const query = search.trim().toLocaleLowerCase();
  const sections = AUTOMATED_EMAIL_SECTIONS.map((section) => ({
    ...section,
    templates: section.templates.filter((template) =>
      `${template.label} ${template.category} ${template.group}`.toLocaleLowerCase().includes(query)),
  })).filter((section) => section.templates.length > 0);
  const resultCount = sections.reduce((count, section) => count + section.templates.length, 0);

  return (
    <div ref={rootRef} id="each-automatic-email" data-chat-section="admin.email-settings.each-email" data-chat-section-label="Each automatic email" className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Automatic emails by category</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Open a section to choose which emails are sent. Each email follows the main switch unless you change it here.
          </p>
        </div>
        <Badge variant="outline" className="w-fit shrink-0 border-slate-200 bg-slate-50 text-slate-600">
          {AUTOMATED_EMAIL_TEMPLATES.length} emails
        </Badge>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <label htmlFor={searchId} className="sr-only">Search automatic emails</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <Input id={searchId} type="search" value={search} onChange={(event) => updateSearch(event.target.value)}
            placeholder="Search emails, e.g. invoice or delivery" className="pl-9" />
        </div>
        {search && <Button type="button" variant="ghost" size="sm" onClick={() => updateSearch("")}>Clear</Button>}
      </div>
      <p role="status" className="mt-2 text-xs text-slate-600">
        {query ? `${resultCount} of ${AUTOMATED_EMAIL_TEMPLATES.length} emails match your search` : "Choose a category below. You can open more than one at a time."}
      </p>

      {sections.length > 0 ? (
        <Accordion type="multiple" value={openSections}
          onValueChange={setOpenSections} className="mt-3 border-t border-slate-200">
          {sections.map((section) => {
            const automatic = section.templates.filter((template) => template.controllable && resolveEmailDeliveryMode(preferences, template.key) === "automatic").length;
            const off = section.templates.filter((template) => template.controllable && resolveEmailDeliveryMode(preferences, template.key) === "off").length;
            const alwaysSent = section.templates.filter((template) => !template.controllable).length;
            const modes = [automatic ? `${automatic} automatic` : "", off ? `${off} off` : "", alwaysSent ? `${alwaysSent} always sent` : ""].filter(Boolean).join(" · ");
            return (
              <AccordionItem key={section.id} value={section.id} id={automatedEmailCategoryId(section.id)}
                data-chat-section={`admin.email-settings.category.${section.id}`} data-chat-section-label={section.title}
                className="scroll-mt-24 border-slate-200 last:border-b-0">
                <AccordionTrigger className="gap-3 rounded-md px-1 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-slate-900">{section.title}</span>
                      <span className="text-xs font-normal text-slate-500">{section.templates.length} emails</span>
                    </span>
                    <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">{section.description}</span>
                    <span className="mt-1 block text-xs font-normal text-slate-500">{modes}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-2">
                  <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
                    {section.templates.map((template) => {
                      const mode = resolveEmailDeliveryMode(preferences, template.key);
                      return (
                        <div key={template.key} id={automatedEmailControlId(template.key)} tabIndex={-1}
                          data-chat-section={automatedEmailNavigationRef(template.key)} data-chat-section-label={template.label}
                          className={`flex scroll-mt-24 items-start gap-3 border-t border-slate-100 py-3 ${highlightedKey === template.key ? "rounded-md bg-brand-primary/5 px-2 ring-1 ring-inset ring-brand-primary/40" : ""}`}>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold leading-5 text-slate-900">{template.label}</p>
                            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{template.category === "staff" ? "Staff" : "Client"} · {template.group}</p>
                            <div className="flex flex-wrap items-center gap-x-3">
                              <AutomatedEmailInfoChip templateKey={template.key} label={template.label} />
                              {getTemplateDefinition(template.key) && (
                                <Link href={withSlug(`/admin/email-templates?tab=templates&template=${encodeURIComponent(template.key)}`)}
                                  aria-label={`Edit the ${template.label} template`}
                                  className="mt-1.5 rounded-sm text-xs font-medium text-brand-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
                                  Edit template
                                </Link>
                              )}
                            </div>
                          </div>
                          {template.controllable ? (
                            <Button type="button" size="sm" role="switch" aria-label={template.label} aria-checked={mode === "automatic"}
                              variant={mode === "off" ? "default" : "outline"} className="min-h-9 shrink-0 text-xs"
                              title={mode === "off" ? "Not sent. Click to send it automatically." : "Sent automatically. Click to turn it off."}
                              onClick={() => onModeChange(template.key, mode === "automatic" ? "off" : "automatic")}>
                              {mode === "off" ? "Off" : "Automatic"}
                            </Button>
                          ) : (
                            <Badge variant="outline" className="min-h-9 shrink-0 border-slate-200 bg-slate-50 text-[11px] text-slate-600" title="Sign-in links and invitations are always sent so people can access their account.">
                              Always sent
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      ) : (
        <div className="mt-4 border-t border-slate-200 py-6 text-center">
          <p className="text-sm font-medium text-slate-900">No emails match your search</p>
          <p className="mt-1 text-xs text-slate-600">Try a different word, such as booking, invoice or staff.</p>
        </div>
      )}
    </div>
  );
}
