/**
 * Welcome email fired immediately after a brand-new catering company
 * signs up. Replaces the silent "you got a generic billing receipt"
 * status quo with a branded greeting + 3 first-step CTAs that mirror
 * the /admin/onboarding checklist.
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

export interface OwnerWelcomeEmailProps {
  ownerFirstName: string;
  companyName: string;
  /** Fully-qualified URL to the tenant's onboarding page. */
  onboardingUrl: string;
  brand?: CompanyBrand;
}

export default function OwnerWelcomeEmail({
  ownerFirstName,
  companyName,
  onboardingUrl,
  brand,
}: OwnerWelcomeEmailProps) {
  const brandColor = brand?.primaryColor || "#7c3aed";
  return (
    <BrandedShell brand={brand} preview={`${companyName} is in. Here's what to do first.`}>
      <Text style={emailHeadingStyle}>Welcome aboard, {ownerFirstName}.</Text>
      <Text style={emailBodyTextStyle}>
        <strong>{companyName}</strong> is now running on CateringMS. Setup takes about 20 minutes
        end-to-end -- we've broken it into a checklist that updates itself as you fill in real data,
        so nothing's wasted.
      </Text>

      <Text style={emailBodyTextStyle}>The three highest-leverage things to do today:</Text>

      <Section style={{ marginBottom: 18 }}>
        <Text style={stepText}>
          <strong>1. Set up your company profile</strong>
          <br />
          Logo, contact, payment details. These end up on every quote and invoice your clients see.
        </Text>
        <Text style={stepText}>
          <strong>2. Invite your team</strong>
          <br />
          Drivers, kitchen, cleaning, shopping. They get a branded invite, set their password, and
          start clocking in. No login needed for staff you'd rather track manually.
        </Text>
        <Text style={stepText}>
          <strong>3. Build your menu + import existing bookings</strong>
          <br />
          So your first quote takes seconds, not an hour.
        </Text>
      </Section>

      <Section style={{ textAlign: "center", margin: "18px 0 24px" }}>
        <Button href={onboardingUrl} style={ctaButtonStyle(brandColor)}>
          Open your setup checklist
        </Button>
      </Section>

      <Text style={emailMutedTextStyle}>
        Reply to this email if anything's broken or unclear. We read every reply.
      </Text>
    </BrandedShell>
  );
}

const stepText: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: "#0f172a",
  margin: "0 0 12px",
};
