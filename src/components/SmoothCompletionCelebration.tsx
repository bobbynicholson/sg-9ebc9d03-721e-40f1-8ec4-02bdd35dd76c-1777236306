import { useState } from "react";
import { CheckCircle, Sparkles, Star, PartyPopper } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Confetti from "react-confetti";

interface SmoothCompletionCelebrationProps {
  isOpen: boolean;
  onClose: () => void;
  orderNumber: string;
  clientName: string;
  customMessage?: string;
  userRole: "admin" | "staff" | "client" | "driver" | "kitchen";
}

export function SmoothCompletionCelebration({
  isOpen,
  onClose,
  orderNumber,
  clientName,
  customMessage,
  userRole,
}: SmoothCompletionCelebrationProps) {
  const [showConfetti, setShowConfetti] = useState(true);

  const roleMessages = {
    admin: {
      title: "🎉 Perfect Execution!",
      message: customMessage || `Order ${orderNumber} for ${clientName} completed flawlessly! No issues, no delays, no complaints. This is what excellence looks like!`,
      subtitle: "Your team delivered outstanding service from start to finish.",
    },
    staff: {
      title: "⭐ Fantastic Work!",
      message: customMessage || `Great job! Order ${orderNumber} completed without a single hitch. You're helping build an exceptional reputation!`,
      subtitle: "Keep up the outstanding work!",
    },
    client: {
      title: "✨ Thank You!",
      message: customMessage || `Your event was a success! We hope everything exceeded your expectations. Thank you for choosing us!`,
      subtitle: "We'd love to hear about your experience.",
    },
    driver: {
      title: "🚀 Excellent Delivery!",
      message: customMessage || `Perfect! Order ${orderNumber} delivered on time with no issues. You're a star performer!`,
      subtitle: "Your professionalism makes all the difference.",
    },
    kitchen: {
      title: "👨‍🍳 Chef's Kiss!",
      message: customMessage || `Impeccable! Order ${orderNumber} prepared and executed perfectly. The client was delighted!`,
      subtitle: "Your culinary skills shine through!",
    },
  };

  const content = roleMessages[userRole];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {showConfetti && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={false}
          numberOfPieces={500}
          gravity={0.3}
          onConfettiComplete={() => setShowConfetti(false)}
        />
      )}
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center animate-bounce">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
              <div className="absolute -top-2 -right-2">
                <Sparkles className="w-8 h-8 text-yellow-400 animate-spin" />
              </div>
            </div>
          </div>

          <DialogTitle className="text-center text-2xl">
            {content.title}
          </DialogTitle>

          <DialogDescription className="text-center space-y-4 pt-4">
            <p className="text-lg text-gray-900 font-medium">
              {content.message}
            </p>

            <p className="text-sm text-gray-600 italic">
              {content.subtitle}
            </p>

            {/* Star Rating Visualization */}
            <div className="flex justify-center gap-2 py-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className="w-8 h-8 text-yellow-400 fill-yellow-400 animate-pulse"
                  style={{ animationDelay: `${star * 0.1}s` }}
                />
              ))}
            </div>

            {/* Celebration Emoji */}
            <div className="text-6xl animate-bounce">
              🎊
            </div>

            <Button
              onClick={onClose}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
              size="lg"
            >
              <PartyPopper className="w-5 h-5 mr-2" />
              Awesome, Thanks!
            </Button>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
