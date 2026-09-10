/**
 * Review-before-send composer dialog.
 *
 * Used by both invoice and quote sends. Caller passes pre-resolved
 * subject + body (merge tags already substituted) and an onSend
 * callback that takes the final values. The dialog handles the rest:
 * To/Cc/Bcc edit fields, attachment toggle, send button, and
 * inline structured-error display so the operator never loses their
 * edits if a send fails.
 *
 * The dialog deliberately does NOT close on error - the operator
 * reads the diagnosis, clicks the Fix link, and comes back with the
 * draft still intact. It only closes on a successful send.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Paperclip, Send } from "lucide-react";

export interface SendEmailDialogPayload {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  /** True when the PDF attachment should be included on the send. */
  attachPdf: boolean;
}

export interface SendEmailDialogError {
  message: string;
  /** Optional deep link to where the operator fixes the issue. */
  fix_link?: string;
  /** Set when the failure is the platform's responsibility (no fix
   *  link) - shows "Retry" instead of "Fix this". */
  retryable?: boolean;
}

export interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  title: string;
  description?: string;

  /** Pre-populated, merge-tag-substituted defaults. */
  defaultTo: string;
  defaultSubject: string;
  defaultBody: string;
  defaultCc?: string;
  defaultBcc?: string;
  /** Optional quick-fill address for local testing or operator speed. */
  testRecipient?: string;

  /** Filename of the PDF that will be attached on send. */
  attachmentFilename?: string;
  attachmentSizeLabel?: string;

  /** What the primary button says. */
  sendLabel?: string;

  /** Optional content rendered between the dialog header and the To
   *  field. Used by QuoteSendDialog to inject the second-quote picker. */
  extraTopContent?: React.ReactNode;

  /** Optional deep-link to the editable template behind this email, plus
   *  a human label for it. When set, the footer shows an "Edit this
   *  template" link so the operator can change the default wording for
   *  EVERY send instead of re-editing the composer each time. */
  templateEditHref?: string;
  templateEditLabel?: string;

  /**
   * Caller does the actual fetch. Returns success or a structured
   * error so the dialog can render the Fix link inline.
   */
  onSend: (
    payload: SendEmailDialogPayload,
  ) => Promise<{ success: true } | { success: false; error: SendEmailDialogError }>;

  /** Fired after a successful send so the parent can refresh state. */
  onSent?: () => void;
}

export function SendEmailDialog(props: SendEmailDialogProps) {
  const router = useRouter();
  const [to, setTo] = useState(props.defaultTo);
  const [cc, setCc] = useState(props.defaultCc || "");
  const [bcc, setBcc] = useState(props.defaultBcc || "");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState(props.defaultSubject);
  const [body, setBody] = useState(props.defaultBody);
  const [attachPdf, setAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);
  const [inlineError, setInlineError] = useState<SendEmailDialogError | null>(null);

  // Re-prime fields whenever the dialog re-opens with a different
  // record. Without this, switching from one invoice to another would
  // keep the previous draft on screen.
  useEffect(() => {
    if (props.open) {
      setTo(props.defaultTo);
      setCc(props.defaultCc || "");
      setBcc(props.defaultBcc || "");
      setSubject(props.defaultSubject);
      setBody(props.defaultBody);
      setAttachPdf(true);
      setInlineError(null);
      setShowCcBcc(!!(props.defaultCc || props.defaultBcc));
    }
  }, [
    props.open,
    props.defaultTo,
    props.defaultSubject,
    props.defaultBody,
    props.defaultCc,
    props.defaultBcc,
  ]);

  const handleSend = async () => {
    if (!to.trim()) {
      setInlineError({ message: "Add a recipient before sending." });
      return;
    }
    setSending(true);
    setInlineError(null);
    try {
      const result = await props.onSend({
        to: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject,
        body,
        attachPdf,
      });
      if (result.success === true) {
        props.onSent?.();
        props.onOpenChange(false);
      } else {
        setInlineError(result.error);
      }
    } catch (err: any) {
      setInlineError({ message: err?.message || "Send failed unexpectedly." });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          {props.description ? (
            <DialogDescription>{props.description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {props.extraTopContent && (
          <div className="mb-2">{props.extraTopContent}</div>
        )}

        <div className="space-y-4">
          {/* Recipient block */}
          <div className="space-y-2">
            <Label htmlFor="send-to">To</Label>
            <Input
              id="send-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="client@example.com"
            />
            {props.testRecipient ? (
              <button
                type="button"
                className="text-xs text-blue-700 hover:text-blue-900 underline"
                onClick={() => setTo(props.testRecipient || "")}
              >
                Use test email ({props.testRecipient})
              </button>
            ) : null}
            <button
              type="button"
              className="text-xs text-slate-600 hover:text-slate-900 underline"
              onClick={() => setShowCcBcc((s) => !s)}
            >
              {showCcBcc ? "Hide Cc and Bcc" : "Add Cc or Bcc"}
            </button>
          </div>

          {showCcBcc && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="send-cc">Cc</Label>
                <Input
                  id="send-cc"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="optional@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="send-bcc">Bcc</Label>
                <Input
                  id="send-bcc"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="optional@example.com"
                />
              </div>
            </div>
          )}

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="send-subject">Subject</Label>
            <Input
              id="send-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="send-body">Message</Label>
            <Textarea
              id="send-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-slate-500">
              Merge tags have been replaced with the actual values. Edit freely - the
              client receives exactly what you see here.
            </p>
            {props.templateEditHref && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                Want this wording on <strong>every</strong> send? Edit the{" "}
                <Link
                  href={props.templateEditHref}
                  className="text-blue-700 font-medium underline hover:text-blue-800"
                >
                  {props.templateEditLabel || "email template"}
                </Link>
                {" "}- one-off tweaks here don&apos;t change the default.
              </p>
            )}
          </div>

          {/* Attachment */}
          {props.attachmentFilename && (
            <div className="border rounded-md p-3 bg-slate-50">
              <Label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={attachPdf}
                  onCheckedChange={(v) => setAttachPdf(v === true)}
                />
                <Paperclip className="h-4 w-4 text-slate-600" />
                <span className="text-sm">
                  Attach {props.attachmentFilename}
                  {props.attachmentSizeLabel ? (
                    <span className="text-slate-500 ml-1">({props.attachmentSizeLabel})</span>
                  ) : null}
                </span>
              </Label>
            </div>
          )}

          {/* Inline error - shown without closing the dialog so the
              operator can read the diagnosis, click Fix, and come back
              to their unsaved draft. */}
          {inlineError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Couldn't send the email</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{inlineError.message}</p>
                {inlineError.fix_link && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(inlineError.fix_link as string)}
                  >
                    Fix this
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending..." : props.sendLabel || "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
