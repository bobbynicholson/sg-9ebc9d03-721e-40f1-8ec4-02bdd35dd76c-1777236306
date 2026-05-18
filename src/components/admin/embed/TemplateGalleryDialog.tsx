/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Template gallery shown when the tenant clicks "+ New form" or "Browse
 * templates". Each card has a live preview iframe loading the template's
 * own demo URL plus a "Use this template" CTA that creates the config row
 * server-side and routes through to the customiser.
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Calculator } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EMBED_TEMPLATE_CATALOG, defaultSlugForTemplate } from "@/lib/embed/templateCatalog";
import type { EmbedTemplateId } from "@/types/embedForms";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  embedToken?: string;
  onCreated: (formId: string) => void;
}

export function TemplateGalleryDialog({ open, onOpenChange, embedToken, onCreated }: Props) {
  const { toast } = useToast();
  const [creatingId, setCreatingId] = useState<string | null>(null);

  async function handleUseTemplate(templateId: EmbedTemplateId) {
    setCreatingId(templateId);
    try {
      const meta = EMBED_TEMPLATE_CATALOG.find((t) => t.id === templateId);
      if (!meta) throw new Error("Template not found");

      const resp = await fetch("/api/admin/embed/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          name: meta.name,
          slug: defaultSlugForTemplate(templateId),
          fields: meta.defaultFields,
          theme: meta.defaultTheme,
          success_message: meta.defaultSuccessMessage,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Failed to create form");
      onCreated(json.form.id);
    } catch (err: any) {
      toast({ title: "Couldn't create form", description: err.message, variant: "destructive" });
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Sparkles className="w-6 h-6 text-purple-500" />
            Pick a template
          </DialogTitle>
          <DialogDescription>
            Each template is a battle-tested layout. Tweak fields, colours and copy after you choose one.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {EMBED_TEMPLATE_CATALOG.map((meta) => {
            // Demo URL always works - the loader falls back to its
            // built-in fallbackConfig when the API rejects the
            // 'preview' literal as a non-UUID. We removed the
            // embedToken gate that was producing broken-image
            // placeholders when the auth context hadn't populated yet
            // (the gate was always-falsy on first render and never
            // recovered cleanly).
            const previewSrc = `/embed/demo.html?template=${encodeURIComponent(meta.id)}&compact=1`;
            const isCreating = creatingId === meta.id;
            return (
              <Card key={meta.id} className="border-0 shadow-md hover:shadow-xl transition-all overflow-hidden">
                <CardContent className="p-0">
                  <div className="relative h-44 bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden">
                    <iframe
                      src={previewSrc}
                      title={meta.name}
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      loading="lazy"
                      sandbox="allow-scripts allow-same-origin"
                      referrerPolicy="no-referrer"
                    />
                    {meta.usesPricingTiers && (
                      <Badge className="absolute top-2 right-2 bg-amber-500 text-white gap-1">
                        <Calculator className="w-3 h-3" /> Live pricing
                      </Badge>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-slate-900">{meta.name}</h3>
                    <p className="text-xs text-slate-500 mb-2">{meta.description}</p>
                    <p className="text-sm text-slate-600 mb-4 line-clamp-2">{meta.blurb}</p>
                    <Button
                      className="w-full gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
                      disabled={isCreating}
                      onClick={() => handleUseTemplate(meta.id)}
                    >
                      {isCreating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                      ) : (
                        "Use this template"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
