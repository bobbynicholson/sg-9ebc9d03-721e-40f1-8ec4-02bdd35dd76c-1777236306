/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RequestEditsDialog
 *
 * Tiny dialog the client opens to push a quote back to the catering
 * team for revision. Used on the dashboard pending-quotes hero band
 * and on /client-portal/quotes - same UI both places.
 *
 * On submit:
 *   - POST /api/quotes/request-edits with { quote_id, request_text }
 *   - That route flips quotes.status to 'revised', appends the note
 *     to quotes.notes with a timestamp, and notifies admin.
 *   - We toast and call onSuccess so the caller can refresh its list
 *     and show the quote as "changes requested" without a full reload.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RequestEditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string | null;
  quoteNumber: string | null;
  onSuccess?: () => void;
}

export function RequestEditsDialog({
  open,
  onOpenChange,
  quoteId,
  quoteNumber,
  onSuccess,
}: RequestEditsDialogProps) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleClose = (next: boolean) => {
    if (submitting) return;
    if (!next) setText("");
    onOpenChange(next);
  };

  const submit = async () => {
    if (!quoteId) return;
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      toast({
        title: "Add a bit more detail",
        description: "Tell the team what you'd like changed.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/quotes/request-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: quoteId, request_text: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not send your request");
      toast({
        title: "Sent to the team",
        description: "They'll revise the quote and send the new version through.",
      });
      setText("");
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast({
        title: "Couldn't send your request",
        description: e?.message || "Try again or contact the team directly.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request changes</DialogTitle>
          <DialogDescription>
            What would you like changed on{" "}
            <span className="font-mono text-slate-700">
              {quoteNumber || "this quote"}
            </span>
            ? The team will revise and send the new version through.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            rows={5}
            placeholder="e.g. Could we swap the chicken option for vegetarian? And the date moved to the 14th if possible."
            className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm resize-none"
            disabled={submitting}
          />
          <p className="text-[11px] text-slate-500">
            Be specific - it saves a back-and-forth. {1000 - text.length} characters left.
          </p>
        </div>
        <div className="flex gap-2 mt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => handleClose(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={submit}
            disabled={submitting || text.trim().length < 3}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" /> Send request
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
