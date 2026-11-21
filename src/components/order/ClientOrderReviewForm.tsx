import { useState } from "react";
import { CheckCircle2, Loader2, MessageSquareText, Send, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ClientOrderReviewForm({
  orderId,
  eventName,
  primaryColor,
}: {
  orderId: string;
  eventName: string;
  primaryColor: string;
}) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const submit = async () => {
    if (!rating || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/client-tokens/submit-feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, overall_rating: rating, comments }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "We couldn't save your rating.");
      setMessage({
        kind: "success",
        text: result?.already_submitted
          ? "We've already received your rating for this event. Thank you."
          : "Thanks for sharing your feedback. We've sent it to the catering team.",
      });
    } catch (error: any) {
      setMessage({ kind: "error", text: error?.message || "We couldn't save your rating. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="feedback" className="scroll-mt-6 border-0 shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="h-4 w-4" style={{ color: primaryColor }} />
          How was {eventName}?
        </CardTitle>
        <p className="text-sm text-slate-600">Your rating goes directly to the catering team.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {message?.kind === "success" ? (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message.text}</span>
          </div>
        ) : (
          <>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-800">Overall rating</p>
              <div className="flex gap-1" onMouseLeave={() => setHovered(0)}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onMouseEnter={() => setHovered(value)}
                    onFocus={() => setHovered(value)}
                    onBlur={() => setHovered(0)}
                    onClick={() => setRating(value)}
                    aria-label={`Rate ${value} out of 5 stars`}
                    aria-pressed={rating === value}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
                  >
                    <Star className={`h-7 w-7 ${(hovered || rating) >= value ? "fill-amber-400 text-amber-500" : "text-slate-300"}`} />
                  </button>
                ))}
              </div>
            </div>
            <label className="block space-y-2 text-sm font-medium text-slate-800">
              A comment (optional)
              <Textarea
                value={comments}
                onChange={(event) => setComments(event.target.value.slice(0, 2000))}
                maxLength={2000}
                rows={3}
                placeholder="Tell us what went well or what we could improve."
                className="font-normal"
              />
              <span className="block text-right text-xs font-normal text-slate-500">{comments.length}/2000</span>
            </label>
            {message?.kind === "error" && <p role="alert" className="text-sm text-rose-700">{message.text}</p>}
            <Button type="button" onClick={submit} disabled={!rating || busy} style={{ backgroundColor: primaryColor }}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send rating
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
