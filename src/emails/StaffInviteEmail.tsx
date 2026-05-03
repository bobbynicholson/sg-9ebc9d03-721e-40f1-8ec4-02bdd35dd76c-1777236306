/**
 * Branded portal invite -- replaces Supabase's default magic-link template.
 *
 * Role-aware: same shell + CTA, different value-prop bullets per role so
 * the recipient sees what THEIR portal does for them, not a generic blurb.
 * Driver gets earnings + GPS, kitchen gets prep clarity + BCEA-fair shifts,
 * etc. This is the first impression every team member of every catering
 * company on the platform gets, so it has to land.
 */
import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import {
  BrandedShell,
  ctaButtonStyle,
  emailBodyTextStyle,
  emailHeadingStyle,
  emailMutedTextStyle,
  type CompanyBrand,
} from "./BrandedShell";

export type InvitedRole =
  | "driver"
  | "kitchen"
  | "cleaning"
  | "shopping"
  | "admin"
  | "company_admin";

export interface StaffInviteEmailProps {
  recipientFirstName: string;
  inviterName?: string;
  /** The full activation link from auth.admin.generateLink({ type: "invite" }). */
  acceptInviteUrl: string;
  role: InvitedRole;
  brand?: CompanyBrand;
}

interface RoleCopy {
  title: string;
  intro: string;
  bullets: string[];
}

const ROLE_COPY: Record<InvitedRole, RoleCopy> = {
  driver: {
    title: "You've been invited to drive with",
    intro: "Your driver portal puts everything you need on one screen:",
    bullets: [
      "Today's deliveries with optimised stop order + ETAs",
      "Tap-to-confirm pickups, on-route, and delivered -- proof captured automatically",
      "Live earnings dashboard so you always know where you stand",
    ],
  },
  kitchen: {
    title: "You've been invited to the kitchen team at",
    intro: "Your kitchen portal is built for prep without surprises:",
    bullets: [
      "Per-order prep lists with portion targets, no guesswork",
      "Live production board -- mark items ready, no shouting across the kitchen",
      "Shifts and BCEA-fair overtime tracked automatically, fair pay every week",
    ],
  },
  cleaning: {
    title: "You've been invited to the cleaning team at",
    intro: "Your cleaning portal is about equipment in, equipment out, with proof:",
    bullets: [
      "Tasks for today, by area, with verification checkpoints",
      "Damage-report flow so disputes about who broke what stop dead",
      "On-duty board -- tap in, tap out, fair pay with no admin chasing",
    ],
  },
  shopping: {
    title: "You've been invited to the shopping team at",
    intro: "Your shopping portal is demand-driven so you never overspend:",
    bullets: [
      "Live shopping list pulled straight from confirmed orders",
      "Low-stock alerts before you run out, not after",
      "Receipt scanner that links spend back to suppliers + inventory",
    ],
  },
  admin: {
    title: "You've been invited to manage",
    intro: "You'll have admin access to:",
    bullets: [
      "Quotes, orders, clients, the full operations side",
      "Staff management, shift schedules, BCEA-correct payroll",
      "Inventory, equipment, and supplier dashboards",
    ],
  },
  company_admin: {
    title: "You've been invited as an owner of",
    intro: "Owner access gives you full control:",
    bullets: [
      "Everything an admin sees, plus financial dashboards",
      "Subscription, billing, and integrations management",
      "Full visibility into every order, every staff member, every shift",
    ],
  },
};

export default function StaffInviteEmail({
  recipientFirstName,
  inviterName,
  acceptInviteUrl,
  role,
  brand,
}: StaffInviteEmailProps) {
  const brandColor = brand?.primaryColor || "#7c3aed";
  const companyName = brand?.name || "the team";
  const copy = ROLE_COPY[role];

  return (
    <BrandedShell
      brand={brand}
      preview={`${inviterName || "Your team"} invited you to ${companyName}'s ${role} portal.`}
    >
      <Text style={emailHeadingStyle}>
        Hi {recipientFirstName},
      </Text>
      <Text style={emailBodyTextStyle}>
        {copy.title} <strong>{companyName}</strong>
        {inviterName ? ` -- ${inviterName} sent you this invite.` : "."}
      </Text>

      <Text style={emailBodyTextStyle}>{copy.intro}</Text>

      <Section style={{ margin: "0 0 18px" }}>
        {copy.bullets.map((b) => (
          <Text key={b} style={bulletStyle}>
            • {b}
          </Text>
        ))}
      </Section>

      <Section style={{ textAlign: "center", margin: "18px 0 24px" }}>
        <Button href={acceptInviteUrl} style={ctaButtonStyle(brandColor)}>
          Accept invite + set password
        </Button>
      </Section>

      <Text style={emailMutedTextStyle}>
        This link logs you in straight to the portal once you've set a password. It's tied to your
        email, so don't forward it. If you weren't expecting this, just ignore the email -- nothing
        happens until you click.
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
