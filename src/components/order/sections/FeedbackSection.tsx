/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC Wave E: customer feedback for the order.
 *
 * Only mounted when the order has been delivered. Shows the
 * delivery_feedback row (overall + food + timeliness + professionalism
 * ratings on 1-5 stars, free-text comments, follow-up flag and
 * resolution).
 *
 * Empty state ("awaiting customer rating") only shows when delivered
 * + no feedback row yet, so the section is honest about the silent
 * case (customer hasn't rated yet).
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { Star, Loader2, AlertCircle, MessageSquare, CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  orderId: string;
  companyId: string;
  delivered: boolean;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  canSendReviewRequest?: boolean;
}

interface FeedbackRow {
  id: string;
  overall_rating: number | null;
  food_quality_rating: number | null;
  delivery_timeliness_rating: number | null;
  driver_professionalism_rating: number | null;
  comments: string | null;
  requires_follow_up: boolean | null;
  followed_up_at: string | null;
  is_public: boolean | null;
  created_at: string | null;
}

const STARS = [1, 2, 3, 4, 5];

function RatingStars({ value, size = "small" }: { value: number; size?: "small" | "large" }) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-0.5">
      {STARS.map((star) => (
        <Star key={star} className={`${size === "large" ? "h-5 w-5" : "h-3.5 w-3.5"} ${star <= value ? "fill-amber-400 text-amber-700" : "text-slate-400"}`} />
      ))}
    </span>
  );
}

function RatingRow({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5">
      <dt className="font-medium text-slate-800">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2 font-semibold tabular-nums text-slate-900">
        <RatingStars value={value} />
        <span>{value} <span className="font-normal text-slate-600">/ 5</span></span>
      </dd>
    </div>
  );
}

export function FeedbackSection({ orderId, companyId, delivered, defaultOpen, forceOpen, canSendReviewRequest }: Props) {
  const [feedback, setFeedback] = useState<FeedbackRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingReview, setSendingReview] = useState(false);
  const { toast } = useToast();

  const sendReviewRequest = async () => {
    setSendingReview(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/request-review`, {
        method: "POST",
        credentials: "include",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Could not send the review request.");
      toast({
        title: result?.already_reviewed ? "Review already received" : result?.already_sent ? "Review request already sent" : "Review request sent",
        description: result?.already_reviewed
          ? "This order already has a client rating."
          : result?.already_sent
            ? "A review request has already been emailed for this order."
            : "The client received a secure link to rate this order in the portal.",
      });
    } catch (error: any) {
      toast({ title: "Could not send review request", description: error?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSendingReview(false);
    }
  };

  useEffect(() => {
    if (!delivered) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from("delivery_feedback")
          .select("id, overall_rating, food_quality_rating, delivery_timeliness_rating, driver_professionalism_rating, comments, requires_follow_up, followed_up_at, is_public, created_at")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setFeedback(data as FeedbackRow | null);
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadFeedbackSection", orderId, companyId } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, companyId, delivered]);

  // Realtime: rating can land any time after delivery.
  useEffect(() => {
    if (!orderId || !delivered) return;
    const ch = supabase
      .channel(`order-doc-feedback:${orderId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "delivery_feedback", filter: `order_id=eq.${orderId}` },
        async () => {
          const { data } = await (supabase as any)
            .from("delivery_feedback")
            .select("id, overall_rating, food_quality_rating, delivery_timeliness_rating, driver_professionalism_rating, comments, requires_follow_up, followed_up_at, is_public, created_at")
            .eq("order_id", orderId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          setFeedback(data as FeedbackRow | null);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId, delivered]);

  // Don't mount section at all for non-delivered orders.
  if (!delivered) return null;

  const stars = feedback?.overall_rating;
  const summary = loading
    ? "Loading..."
    : !feedback
      ? "Awaiting customer rating"
      : stars != null
        ? `${stars}/5 overall${feedback.requires_follow_up && !feedback.followed_up_at ? " · Follow-up pending" : ""}`
        : "Comments only";

  return (
    <CollapsibleSection
      id="section-feedback"
      title="Customer feedback"
      summary={summary}
      icon={Star}
      accent="amber"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
    >
      {loading ? (
        <p role="status" className="flex items-center gap-2 py-4 text-sm text-slate-600">
          <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" /> Loading feedback…
        </p>
      ) : !feedback ? (
        <div className="min-w-0 space-y-3">
          <div className="rounded-lg bg-slate-50 p-4">
            <h3 className="text-base font-semibold text-slate-950">No rating yet</h3>
            {canSendReviewRequest && (
              <p className="mt-1 text-sm text-slate-600">The customer receives a thank-you and review request when the order is completed.</p>
            )}
          </div>
          {canSendReviewRequest && (
            <Button type="button" variant="outline" onClick={sendReviewRequest} disabled={sendingReview} className="h-auto min-h-[44px] max-w-full whitespace-normal print:hidden">
              {sendingReview ? <Loader2 className="animate-spin" /> : <Mail />}
              {sendingReview ? "Sending…" : "Send thank-you & review request"}
            </Button>
          )}
        </div>
      ) : (
        <div className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
          {stars != null && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4">
              <div>
                <h3 className="text-sm font-medium text-slate-700">Overall rating</h3>
                <p className="mt-0.5 text-2xl font-semibold leading-tight tabular-nums tracking-tight text-slate-950">
                  {stars} <span className="text-base font-normal text-slate-600">/ 5</span>
                </p>
              </div>
              <RatingStars value={stars} size="large" />
            </div>
          )}

          {(feedback.food_quality_rating != null || feedback.delivery_timeliness_rating != null || feedback.driver_professionalism_rating != null) && (
            <dl aria-label="Rating breakdown" className="divide-y divide-slate-200 border-y border-slate-200 text-sm">
              <RatingRow label="Food quality" value={feedback.food_quality_rating} />
              <RatingRow label="Delivery timing" value={feedback.delivery_timeliness_rating} />
              <RatingRow label="Driver professionalism" value={feedback.driver_professionalism_rating} />
            </dl>
          )}

          {feedback.comments && (
            <div>
              <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-950">
                <MessageSquare aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-600" /> Comments
              </h3>
              <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{feedback.comments}</p>
            </div>
          )}

          {feedback.requires_follow_up && (
            feedback.followed_up_at ? (
              <p className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Follow-up resolved on {new Date(feedback.followed_up_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</span>
              </p>
            ) : (
              <p className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-900">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Customer follow-up pending</span>
              </p>
            )
          )}

          {(feedback.created_at || feedback.is_public) && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-slate-200 pt-3 text-sm text-slate-600">
              {feedback.created_at && (
                <span>Submitted <time dateTime={feedback.created_at} className="tabular-nums">{new Date(feedback.created_at).toLocaleString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time></span>
              )}
              {feedback.is_public && <span className="font-medium text-slate-900">Public</span>}
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
