import { ExternalLink, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeWhatsAppFailure } from "@/lib/whatsapp/failureReason";
import { cn } from "@/lib/utils";

export function WhatsAppFailureNotice({
  reason,
  className,
  state = "failed",
}: {
  reason: string | null | undefined;
  className?: string;
  state?: "failed" | "retrying";
}) {
  const failure = describeWhatsAppFailure(reason);
  const retrying = state === "retrying";

  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border p-4",
        retrying
          ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
          : "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <TriangleAlert className={cn("mt-0.5 h-5 w-5 shrink-0", retrying ? "text-amber-700 dark:text-amber-300" : "text-rose-700 dark:text-rose-300")} aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            {retrying && <p className="mb-1 text-xs font-semibold uppercase tracking-wide">Last attempt failed · automatic retry queued</p>}
            <h3 className="text-sm font-semibold">{failure.title}</h3>
            <p className="mt-1 break-words text-sm leading-relaxed">{failure.explanation}</p>
          </div>
          <p className="break-words text-sm leading-relaxed"><strong>Next step:</strong> {failure.nextStep}{retrying ? " CateringMS will retry automatically; check Activity for the result." : ""}</p>
          {failure.code && <p className="text-xs">Meta error code: <code className="font-semibold">{failure.code}</code></p>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {failure.actionHref && failure.actionLabel && (
              <Button asChild size="sm" variant="outline" className="gap-1.5 border-rose-300 bg-white text-rose-950 hover:bg-rose-100 dark:border-rose-800 dark:bg-slate-950 dark:text-rose-100 dark:hover:bg-rose-950">
                <a href={failure.actionHref} target="_blank" rel="noopener noreferrer">
                  {failure.actionLabel}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </Button>
            )}
            {failure.detail && (
              <details className="min-w-0 text-xs text-rose-800 dark:text-rose-200">
                <summary className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">Show provider response details</summary>
                <p className="mt-1 max-w-2xl break-words">{failure.detail}</p>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
