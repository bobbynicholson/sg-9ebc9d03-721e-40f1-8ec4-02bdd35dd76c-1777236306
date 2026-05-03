/**
 * Welcome email for staff added to a catering company WITHOUT a portal
 * login. Many kitchen / cleaning / shopping team members are clocked
 * in by the manager on a shared tablet and never log in themselves.
 * Without this email they get nothing -- so they have no clue what
 * the company is now using to track their shifts and pay.
 *
 * Role-aware: explains specifically what THEIR clock-in / shift / pay
 * flow looks like. No CTA -- it's informational, no portal to log into.
 */
import { Section, Text } from "@react-email/components";
import * as React from "react";
import {
  BrandedShell,
  emailBodyTextStyle,
  emailHeadingStyle,
  emailMutedTextStyle,
  type CompanyBrand,
} from "./BrandedShell";

export type NonLoginRole = "kitchen" | "cleaning" | "driver" | "shopping" | "service" | "office";

export interface NonLoginStaffWelcomeEmailProps {
  recipientFirstName: string;
  role: NonLoginRole;
  brand?: CompanyBrand;
  /** The admin who added them, for the sign-off line. Optional. */
  adderName?: string;
}

interface RoleCopy {
  whatItIs: string;
  bullets: string[];
}

const ROLE_COPY: Record<NonLoginRole, RoleCopy> = {
  kitchen: {
    whatItIs: "kitchen team member",
    bullets: [
      "Your shifts get clocked in/out on the kitchen tablet -- no app needed",
      "BCEA-correct overtime is calculated automatically; you'll always get the higher rate when it applies",
      "Shopping for what you cook is driven by confirmed orders, so you'll have what you need on prep day",
    ],
  },
  cleaning: {
    whatItIs: "cleaning team member",
    bullets: [
      "Tap-in / tap-out happens on the shared tablet at the start and end of each clean",
      "Equipment is verified IN and OUT -- if anything's broken on arrival it gets flagged before you start, so disputes about damage stop dead",
      "Your hours and pay roll up automatically; nothing slips through the cracks",
    ],
  },
  driver: {
    whatItIs: "driver",
    bullets: [
      "Routes and pickups are sent to you via WhatsApp / phone the night before",
      "Earnings are tracked per delivery so you always know where you stand",
      "Proof of delivery is captured on the manager's device when you drop off",
    ],
  },
  shopping: {
    whatItIs: "shopping team member",
    bullets: [
      "Today's shopping list is built straight from confirmed orders -- no overspending, no guesswork",
      "Receipts get scanned into the system so suppliers + costs stay tracked",
      "Low-stock alerts flag what to top up before the next event",
    ],
  },
  service: {
    whatItIs: "service team member",
    bullets: [
      "Event briefs (timing, dress code, venue layout) come through to you per booking",
      "Tap-in on the day so your hours roll up automatically into pay",
      "Every event has a contact person -- you'll know who to ask if anything's unclear",
    ],
  },
  office: {
    whatItIs: "office team member",
    bullets: [
      "You're on the system so the team knows you're part of operations",
      "Hours can be tracked manually or via tap-in, depending on what suits the role",
      "Anything you handle (admin, invoicing, comms) flows through the same dashboard the operations team uses",
    ],
  },
};

export default function NonLoginStaffWelcomeEmail({
  recipientFirstName,
  role,
  brand,
  adderName,
}: NonLoginStaffWelcomeEmailProps) {
  const companyName = brand?.name || "the team";
  const copy = ROLE_COPY[role];
  return (
    <BrandedShell
      brand={brand}
      preview={`You're now on the books at ${companyName}. Here's how it works.`}
    >
      <Text style={emailHeadingStyle}>You're on the books, {recipientFirstName}.</Text>
      <Text style={emailBodyTextStyle}>
        Welcome to <strong>{companyName}</strong>. You've been added as a {copy.whatItIs}, so here's
        the short version of how the system works for you:
      </Text>

      <Section style={{ margin: "0 0 18px" }}>
        {copy.bullets.map((b) => (
          <Text key={b} style={bulletStyle}>
            • {b}
          </Text>
        ))}
      </Section>

      <Text style={emailBodyTextStyle}>
        You don't need to log in or set up an app. Your manager handles tap-in on the shared device.
        If anything ever feels off about your hours or shifts, ask{" "}
        {adderName ? <strong>{adderName}</strong> : "your manager"} to check the system -- it's all
        recorded, so it's quick to put right.
      </Text>

      <Text style={emailMutedTextStyle}>
        Reply to this email if you have questions. We read every reply.
      </Text>
    </BrandedShell>
  );
}

const bulletStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: "#0f172a",
  margin: "0 0 8px",
  paddingLeft: 6,
};
