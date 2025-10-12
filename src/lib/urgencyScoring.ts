/**
 * Urgency Scoring System for Catering Operations
 * Calculates urgency scores (0-100) based on multiple factors
 */

export interface UrgencyFactors {
  hoursUntilEvent: number;
  paymentStatus: "none" | "deposit" | "full";
  currentStatus: string;
  guestCount: number;
  equipmentShortage: boolean;
  driverAvailable: boolean;
  kitchenCapacityPercent: number;
  isVIPClient: boolean;
  hasSpecialRequirements: boolean;
}

export interface UrgencyScore {
  total: number;
  level: "critical" | "high" | "medium" | "normal";
  color: string;
  label: string;
  breakdown: {
    timeScore: number;
    paymentScore: number;
    complexityScore: number;
    statusScore: number;
  };
  recommendations: string[];
}

/**
 * Calculate time-based urgency (0-40 points)
 * Time until event is the most critical factor
 */
function calculateTimeScore(hoursUntilEvent: number): number {
  if (hoursUntilEvent < 0) return 40; // Event passed
  if (hoursUntilEvent <= 6) return 40; // Within 6 hours - CRITICAL
  if (hoursUntilEvent <= 12) return 38; // Within 12 hours
  if (hoursUntilEvent <= 24) return 35; // Within 1 day
  if (hoursUntilEvent <= 48) return 30; // Within 2 days
  if (hoursUntilEvent <= 72) return 25; // Within 3 days
  if (hoursUntilEvent <= 120) return 20; // Within 5 days
  if (hoursUntilEvent <= 168) return 15; // Within 1 week
  if (hoursUntilEvent <= 336) return 10; // Within 2 weeks
  return 5; // More than 2 weeks
}

/**
 * Calculate payment-based urgency (0-25 points)
 * Payment delays increase urgency
 */
function calculatePaymentScore(
  paymentStatus: "none" | "deposit" | "full",
  hoursUntilEvent: number
): number {
  if (paymentStatus === "full") return 0; // Fully paid - no urgency

  const daysUntilEvent = hoursUntilEvent / 24;

  if (paymentStatus === "none") {
    if (daysUntilEvent <= 3) return 25; // No payment within 3 days - CRITICAL
    if (daysUntilEvent <= 7) return 20; // No payment within 1 week - HIGH
    if (daysUntilEvent <= 14) return 15; // No payment within 2 weeks
    return 10; // No payment but event is far
  }

  if (paymentStatus === "deposit") {
    if (daysUntilEvent <= 7) return 15; // Balance due within 1 week
    if (daysUntilEvent <= 14) return 10; // Balance due within 2 weeks
    return 5; // Deposit paid, balance not urgent yet
  }

  return 0;
}

/**
 * Calculate complexity-based urgency (0-15 points)
 * Larger, more complex orders need earlier attention
 */
function calculateComplexityScore(factors: UrgencyFactors): number {
  let score = 0;

  if (factors.guestCount >= 300) score += 8;
  else if (factors.guestCount >= 200) score += 6;
  else if (factors.guestCount >= 100) score += 4;
  else if (factors.guestCount >= 50) score += 2;

  if (factors.equipmentShortage) score += 4;
  if (factors.hasSpecialRequirements) score += 3;

  return Math.min(score, 15);
}

/**
 * Calculate status-based urgency (0-20 points)
 * Orders behind schedule get higher urgency
 */
function calculateStatusScore(
  currentStatus: string,
  hoursUntilEvent: number,
  factors: UrgencyFactors
): number {
  const daysUntilEvent = hoursUntilEvent / 24;
  let score = 0;

  if (currentStatus === "pending" && daysUntilEvent <= 7) {
    score += 20; // Still pending within 1 week - CRITICAL
  } else if (currentStatus === "pending" && daysUntilEvent <= 14) {
    score += 15; // Still pending within 2 weeks - HIGH
  } else if (currentStatus === "confirmed" && daysUntilEvent <= 3) {
    score += 15; // Confirmed but not in kitchen within 3 days
  } else if (currentStatus === "confirmed" && daysUntilEvent <= 5) {
    score += 10; // Confirmed but not in kitchen within 5 days
  } else if (currentStatus === "preparing" && daysUntilEvent <= 1) {
    score += 10; // In kitchen but not ready within 1 day
  } else if (currentStatus === "ready" && daysUntilEvent <= 0.5) {
    score += 12; // Ready but no driver within 12 hours
  }

  if (!factors.driverAvailable && daysUntilEvent <= 2) {
    score += 8; // No driver available within 2 days
  }

  if (factors.kitchenCapacityPercent > 90 && daysUntilEvent <= 3) {
    score += 5; // Kitchen at capacity with event soon
  }

  return Math.min(score, 20);
}

/**
 * Generate actionable recommendations based on urgency factors
 */
function generateRecommendations(
  factors: UrgencyFactors,
  score: UrgencyScore
): string[] {
  const recommendations: string[] = [];
  const daysUntilEvent = factors.hoursUntilEvent / 24;

  if (score.total >= 90) {
    recommendations.push("🚨 URGENT: Immediate action required");
  }

  if (factors.paymentStatus === "none" && daysUntilEvent <= 7) {
    recommendations.push("💰 Contact client urgently for payment");
  } else if (factors.paymentStatus === "deposit" && daysUntilEvent <= 7) {
    recommendations.push("💳 Follow up on balance payment immediately");
  }

  if (factors.currentStatus === "pending" && daysUntilEvent <= 7) {
    recommendations.push("📧 Send urgent payment reminder to client");
  }

  if (factors.currentStatus === "confirmed" && daysUntilEvent <= 3) {
    recommendations.push("👨‍🍳 Assign to kitchen team ASAP");
  }

  if (factors.currentStatus === "preparing" && daysUntilEvent <= 1) {
    recommendations.push("🚚 Assign delivery driver immediately");
  }

  if (factors.equipmentShortage) {
    recommendations.push("⚠️ Resolve equipment shortage before event");
  }

  if (!factors.driverAvailable && daysUntilEvent <= 2) {
    recommendations.push("🚗 Secure driver for this delivery");
  }

  if (factors.kitchenCapacityPercent > 90) {
    recommendations.push("⏰ Kitchen at capacity - prioritize scheduling");
  }

  if (factors.isVIPClient) {
    recommendations.push("⭐ VIP client - ensure white-glove service");
  }

  if (factors.hasSpecialRequirements) {
    recommendations.push("📋 Review special requirements with team");
  }

  if (factors.guestCount >= 200 && daysUntilEvent <= 5) {
    recommendations.push("👥 Large event - coordinate all departments");
  }

  if (recommendations.length === 0) {
    recommendations.push("✅ On track - continue monitoring");
  }

  return recommendations;
}

/**
 * Calculate comprehensive urgency score
 */
export function calculateUrgencyScore(factors: UrgencyFactors): UrgencyScore {
  const timeScore = calculateTimeScore(factors.hoursUntilEvent);
  const paymentScore = calculatePaymentScore(
    factors.paymentStatus,
    factors.hoursUntilEvent
  );
  const complexityScore = calculateComplexityScore(factors);
  const statusScore = calculateStatusScore(
    factors.currentStatus,
    factors.hoursUntilEvent,
    factors
  );

  const total = timeScore + paymentScore + complexityScore + statusScore;

  const score: UrgencyScore = {
    total,
    level: total >= 90 ? "critical" : total >= 70 ? "high" : total >= 50 ? "medium" : "normal",
    color:
      total >= 90
        ? "red"
        : total >= 70
        ? "orange"
        : total >= 50
        ? "yellow"
        : "green",
    label:
      total >= 90
        ? "Critical"
        : total >= 70
        ? "High Priority"
        : total >= 50
        ? "Medium Priority"
        : "Normal",
    breakdown: {
      timeScore,
      paymentScore,
      complexityScore,
      statusScore,
    },
    recommendations: [],
  };

  score.recommendations = generateRecommendations(factors, score);

  return score;
}

/**
 * Get urgency level color classes for Tailwind
 */
export function getUrgencyColorClasses(level: string): {
  bg: string;
  text: string;
  border: string;
  badge: string;
} {
  switch (level) {
    case "critical":
      return {
        bg: "bg-red-50",
        text: "text-red-900",
        border: "border-red-500",
        badge: "bg-red-600 text-white",
      };
    case "high":
      return {
        bg: "bg-orange-50",
        text: "text-orange-900",
        border: "border-orange-500",
        badge: "bg-orange-600 text-white",
      };
    case "medium":
      return {
        bg: "bg-yellow-50",
        text: "text-yellow-900",
        border: "border-yellow-500",
        badge: "bg-yellow-600 text-white",
      };
    default:
      return {
        bg: "bg-green-50",
        text: "text-green-900",
        border: "border-green-500",
        badge: "bg-green-600 text-white",
      };
  }
}

/**
 * Sort orders by urgency score (highest first)
 */
export function sortByUrgency<T extends { urgencyScore?: UrgencyScore }>(
  orders: T[]
): T[] {
  return [...orders].sort((a, b) => {
    const scoreA = a.urgencyScore?.total || 0;
    const scoreB = b.urgencyScore?.total || 0;
    return scoreB - scoreA;
  });
}

/**
 * Get urgency indicator emoji
 */
export function getUrgencyEmoji(level: string): string {
  switch (level) {
    case "critical":
      return "🚨";
    case "high":
      return "⚠️";
    case "medium":
      return "⚡";
    default:
      return "✅";
  }
}
