import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** Preview the download bytes, so pagination and bank details match the PDF.
 * Fetching a blob also lets attachment responses display inside the viewer.
 */
export function PdfDocumentPreview({ src, label, revision = "" }: {
  src?: string | null;
  label: string;
  revision?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; url?: string; error?: boolean } | null>(null);
  const key = `${src || ""}|${revision}|${attempt}`;
  const current = result?.key === key ? result : null;

  useEffect(() => {
    if (!src) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function load() {
      try {
        const response = await fetch(src!, { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) {
          throw new Error("PDF unavailable");
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ key, url: objectUrl });
      } catch {
        if (!controller.signal.aborted) setResult({ key, error: true });
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, key]);

  if (!src) return <p className="p-4 text-sm text-muted-foreground">The PDF will be available once this invoice has a download link.</p>;
  if (current?.error) return (
    <div className="space-y-3 rounded-md border p-4" role="alert">
      <p className="text-sm">The PDF preview could not load. Try again.</p>
      <Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>Retry preview</Button>
    </div>
  );
  if (!current?.url) return <p className="p-4 text-sm text-muted-foreground" role="status">Preparing PDF preview…</p>;
  return (
    <div className="overflow-hidden rounded-md border bg-muted/30">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3 text-sm">
        <p className="min-w-0 break-words font-medium">{label}</p>
        <a href={current.url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium text-brand-primary underline underline-offset-4">
          Open PDF in new tab
        </a>
      </div>
      <iframe title={`${label} PDF preview`} src={`${current.url}#view=FitH`} className="h-[65dvh] min-h-80 w-full" />
      <p className="border-t p-3 text-xs text-muted-foreground">If your browser cannot display the pages here, use “Open PDF in new tab” or Download PDF.</p>
    </div>
  );
}

export function PdfDocumentPreviewDisclosure(props: { src: string; label: string; revision?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="mb-4 rounded-lg border bg-background" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer p-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Preview saved PDF</summary>
      {open ? <div className="px-4 pb-4"><PdfDocumentPreview {...props} /></div> : null}
    </details>
  );
}
