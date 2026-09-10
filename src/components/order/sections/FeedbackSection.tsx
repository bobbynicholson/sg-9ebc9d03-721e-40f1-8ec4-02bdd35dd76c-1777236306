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
import { Star, Loader2, AlertCircle, MessageSquare, CheckCircle2 } from "lucide-react";

interface Props {
  orderId: string;
  companyId: string;
  delivered: boolean;
  defaultOpen?: boolean;
  forceOpen?: boolean;
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

function RatingRow({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-slate-700 min-w-[10rem] text-xs uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-0.5">
        {STARS.map((s) => (
          <Star
            key={s}
            className={`w-3.5 h-3.5 ${s <= value ? "fill-amber-400 text-amber-500" : "text-slate-300"}`}
          />
        ))}
      </div>
      <span className="text-xs tabular-nums text-slate-500">{value}/5</span>
    </div>
  );
}

export function FeedbackSection({ orderId, companyId, delivered, defaultOpen, forceOpen }: Props) {
  const [feedback, setFeedback] = useState<FeedbackRow | null>(null);
  const [loading, setLoading] = useState(true);

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
        ? `${"★".repeat(Math.round(stars))}${"☆".repeat(5 - Math.round(stars))} - ${stars}/5${feedback.requires_follow_up && !feedback.followed_up_at ? " · Follow-up pending" : ""}`
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
        <div className="flex items-center justify-center py-6 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading feedback...
        </div>
      ) : !feedback ? (
        <div className="flex items-start gap-2 p-3 rounded-md bg-slate-50 border border-slate-200">
          <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-700">No rating yet</p>
            <p className="text-xs text-slate-500 mt-0.5">The customer hasn't left feedback. Rating prompts fire automatically post-event.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Headline overall rating */}
          {feedback.overall_rating != null && (
            <div className="p-3 rounded-md bg-amber-50 border border-amber-200">
              <p className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold mb-1">Overall rating</p>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {STARS.map((s) => (
                    <Star
                      key={s}
                      className={`w-5 h-5 ${s <= feedback.overall_rating! ? "fill-amber-400 text-amber-500" : "text-slate-300"}`}
                    />
                  ))}
                </div>
                <span className="text-lg font-bold text-amber-900 tabular-nums">{feedback.overall_rating}/5</span>
              </div>
            </div>
          )}

          {/* Sub-ratings */}
          <div className="space-y-1.5">
            <RatingRow label="Food quality" value={feedback.food_quality_rating} />
            <RatingRow label="Delivery timing" value={feedback.delivery_timeliness_rating} />
            <RatingRow label="Driver" value={feedback.driver_professionalism_rating} />
          </div>

          {/* Comments */}
          {feedback.comments && (
            <div className="p-3 rounded-md bg-white border border-slate-200">
              <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-1 inline-flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                Comments
              </p>
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{feedback.comments}</p>
            </div>
          )}

          {/* Follow-up state */}
          {feedback.requires_follow_up && (
            feedback.followed_up_at ? (
              <div className="flex items-center gap-2 text-xs text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded p-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Follow-up resolved on {new Date(feedback.followed_up_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-300 rounded p-2 font-medium">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Customer flagged for follow-up. Not yet resolved.</span>
              </div>
            )
          )}

          {feedback.created_at && (
            <p className="text-[10px] text-slate-400 text-right tabular-nums">
              Submitted {new Date(feedback.created_at).toLocaleString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              {feedback.is_public && <span className="ml-2 text-brand-primary">· Public</span>}
            </p>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
