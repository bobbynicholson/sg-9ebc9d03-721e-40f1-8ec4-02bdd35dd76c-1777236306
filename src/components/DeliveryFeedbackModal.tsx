import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, ThumbsUp, Send, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DeliveryFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderDetails: {
    client_name: string;
    venue_address: string;
    driver_name?: string;
    delivery_time: string;
  };
  onSubmit: (feedback: FeedbackData) => Promise<void>;
}

export interface FeedbackData {
  order_id: string;
  food_quality_rating: number;
  delivery_speed_rating: number;
  driver_service_rating: number;
  overall_rating: number;
  comments: string;
  would_recommend: boolean;
  photo_url?: string;
}

export function DeliveryFeedbackModal({
  isOpen,
  onClose,
  orderId,
  orderDetails,
  onSubmit,
}: DeliveryFeedbackModalProps) {
  const { toast } = useToast();
  const [foodRating, setFoodRating] = useState(0);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [driverRating, setDriverRating] = useState(0);
  const [comments, setComments] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [hoveredStars, setHoveredStars] = useState<{ [key: string]: number }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const calculateOverallRating = () => {
    const ratings = [foodRating, deliveryRating, driverRating].filter(r => r > 0);
    if (ratings.length === 0) return 0;
    return Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
  };

  const handleSubmit = async () => {
    if (foodRating === 0 && deliveryRating === 0 && driverRating === 0) {
      toast({
        title: "Rating Required",
        description: "Please rate at least one aspect of your delivery.",
        variant: "destructive",
      });
      return;
    }

    if (wouldRecommend === null) {
      toast({
        title: "Recommendation Required",
        description: "Please let us know if you would recommend us.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const feedbackData: FeedbackData = {
        order_id: orderId,
        food_quality_rating: foodRating,
        delivery_speed_rating: deliveryRating,
        driver_service_rating: driverRating,
        overall_rating: calculateOverallRating(),
        comments: comments.trim(),
        would_recommend: wouldRecommend,
      };

      await onSubmit(feedbackData);
      setSubmitted(true);
      
      toast({
        title: "Thank You! 🎉",
        description: "Your feedback helps us improve our service.",
      });

      // Auto-close after 3 seconds
      setTimeout(() => {
        onClose();
        resetForm();
      }, 3000);
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFoodRating(0);
    setDeliveryRating(0);
    setDriverRating(0);
    setComments("");
    setWouldRecommend(null);
    setSubmitted(false);
  };

  const StarRating = ({
    rating,
    onRatingChange,
    label,
    category,
  }: {
    rating: number;
    onRatingChange: (rating: number) => void;
    label: string;
    category: string;
  }) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onRatingChange(star)}
            onMouseEnter={() => setHoveredStars({ ...hoveredStars, [category]: star })}
            onMouseLeave={() => setHoveredStars({ ...hoveredStars, [category]: 0 })}
            className="transition-transform hover:scale-110 focus:outline-none"
          >
            <Star
              className={`w-8 h-8 ${
                star <= (hoveredStars[category] || rating)
                  ? "fill-amber-400 text-amber-400"
                  : "text-slate-300"
              }`}
            />
          </button>
        ))}
        {rating > 0 && (
          <span className="ml-2 text-sm text-slate-600 self-center">
            {rating === 5 && "Excellent!"}
            {rating === 4 && "Great"}
            {rating === 3 && "Good"}
            {rating === 2 && "Fair"}
            {rating === 1 && "Poor"}
          </span>
        )}
      </div>
    </div>
  );

  if (submitted) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-8">
            <div className="mb-4 flex justify-center">
              <div className="bg-emerald-100 rounded-full p-4">
                <ThumbsUp className="w-12 h-12 text-emerald-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold mb-2">Thank You!</h3>
            <p className="text-slate-600">
              Your feedback helps us serve you better. We appreciate your time!
            </p>
            <div className="mt-6">
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-6 h-6 ${
                      star <= calculateOverallRating()
                        ? "fill-amber-400 text-amber-400"
                        : "text-slate-300"
                    }`}
                  />
                ))}
              </div>
              <p className="text-sm text-slate-500 mt-2">Overall Rating: {calculateOverallRating()}/5</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">How was your delivery?</DialogTitle>
          <DialogDescription>
            We'd love to hear about your experience with {orderDetails.client_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Order Info Card */}
          <div className="bg-slate-50 rounded-lg p-4 border">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Delivery Address</p>
                <p className="font-medium">{orderDetails.venue_address}</p>
              </div>
              {orderDetails.driver_name && (
                <div>
                  <p className="text-slate-500">Driver</p>
                  <p className="font-medium">{orderDetails.driver_name}</p>
                </div>
              )}
            </div>
          </div>

          {/* Rating Categories */}
          <div className="space-y-6">
            <StarRating
              rating={foodRating}
              onRatingChange={setFoodRating}
              label="🍽️ Food Quality"
              category="food"
            />
            <StarRating
              rating={deliveryRating}
              onRatingChange={setDeliveryRating}
              label="⚡ Delivery Speed"
              category="delivery"
            />
            <StarRating
              rating={driverRating}
              onRatingChange={setDriverRating}
              label="🚗 Driver Service"
              category="driver"
            />
          </div>

          {/* Would Recommend */}
          <div className="space-y-2">
            <Label>Would you recommend us to others?</Label>
            <div className="flex gap-3">
              <Button
                type="button"
                variant={wouldRecommend === true ? "default" : "outline"}
                onClick={() => setWouldRecommend(true)}
                className="flex-1"
              >
                <ThumbsUp className="w-4 h-4 mr-2" />
                Yes, definitely!
              </Button>
              <Button
                type="button"
                variant={wouldRecommend === false ? "default" : "outline"}
                onClick={() => setWouldRecommend(false)}
                className="flex-1"
              >
                <X className="w-4 h-4 mr-2" />
                Not really
              </Button>
            </div>
          </div>

          {/* Comments */}
          <div className="space-y-2">
            <Label htmlFor="comments">Additional Comments (Optional)</Label>
            <Textarea
              id="comments"
              placeholder="Tell us more about your experience..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-slate-500 text-right">{comments.length}/500</p>
          </div>

          {/* Overall Rating Display */}
          {calculateOverallRating() > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-emerald-900">Your Overall Rating</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-5 h-5 ${
                          star <= calculateOverallRating()
                            ? "fill-amber-400 text-amber-400"
                            : "text-slate-300"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-lg font-bold text-emerald-900">
                    {calculateOverallRating()}/5
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="flex-1"
          >
            Maybe Later
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || (foodRating === 0 && deliveryRating === 0 && driverRating === 0)}
            className="flex-1"
          >
            {submitting ? (
              <>Submitting...</>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Submit Feedback
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}