/**
 * Shared layout for every transactional email we send.
 *
 * Takes brand props (company name, primary colour, logo URL) so the same
 * shell renders correctly whether it's a Spit Braai Delivery driver
 * invite or any other tenant's email. Falls back to neutral CateringMS
 * branding when no tenant brand is supplied (used for platform-level
 * emails like signup welcome where there's no tenant context yet, or
 * very early in signup before the company row exists).
 */
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

export interface CompanyBrand {
  name: string;
  /** Hex like "#7c3aed". Drives header gradient + button + accents. */
  primaryColor?: string;
  logoUrl?: string;
  /** Fallback contact line in the footer. */
  supportEmail?: string;
}

export interface BrandedShellProps {
  brand?: CompanyBrand;
  /** Inbox preview text (the snippet shown next to subject in mailbox lists). */
  preview: string;
  children: React.ReactNode;
}

// Read once at module load. Server-side render (via @react-email/render
// inside API routes) means we have access to process.env here; the
// fallback chain handles local dev / preview where these aren't set.
const PLATFORM_NAME =
  (typeof process !== "undefined" && process.env.PLATFORM_BRAND_NAME) || "CateringMS";
const PLATFORM_SUPPORT =
  (typeof process !== "undefined" && process.env.PLATFORM_SUPPORT_EMAIL) ||
  "support@cateringms.co.za";

const DEFAULT_BRAND: Required<Pick<CompanyBrand, "name" | "primaryColor" | "supportEmail">> = {
  name: PLATFORM_NAME,
  primaryColor: "#7c3aed",
  supportEmail: PLATFORM_SUPPORT,
};

export function BrandedShell({ brand, preview, children }: BrandedShellProps) {
  const name = brand?.name || DEFAULT_BRAND.name;
  const color = brand?.primaryColor || DEFAULT_BRAND.primaryColor;
  const support = brand?.supportEmail || DEFAULT_BRAND.supportEmail;
  const logo = brand?.logoUrl;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={{ ...headerStyle, backgroundColor: color }}>
            {logo ? (
              <Img src={logo} alt={name} height={36} style={{ display: "block" }} />
            ) : (
              <Heading as="h1" style={headerHeading}>
                {name}
              </Heading>
            )}
          </Section>
          <Section style={contentStyle}>{children}</Section>
          <Hr style={hrStyle} />
          <Section style={footerStyle}>
            <Text style={footerText}>
              Sent by <strong>{name}</strong>. If something looks off, reply to this email or contact us at{" "}
              <Link href={`mailto:${support}`} style={{ color }}>
                {support}
              </Link>
              .
            </Text>
            <Text style={footerSmall}>
              Powered by {PLATFORM_NAME} - run your catering business without the chaos.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
  margin: 0,
  padding: 0,
};

const containerStyle: React.CSSProperties = {
  margin: 0,
  maxWidth: 560,
  width: "100%",
  backgroundColor: "#ffffff",
  borderRadius: 12,
  overflow: "hidden",
  boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
};

const headerStyle: React.CSSProperties = {
  padding: "24px 28px",
  color: "#ffffff",
};

const headerHeading: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  color: "#ffffff",
  fontWeight: 700,
};

const contentStyle: React.CSSProperties = {
  padding: "28px",
  color: "#0f172a",
};

const hrStyle: React.CSSProperties = {
  borderColor: "#e2e8f0",
  margin: 0,
};

const footerStyle: React.CSSProperties = {
  padding: "18px 28px 28px",
  textAlign: "center",
};

const footerText: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "#475569",
  lineHeight: 1.5,
};

const footerSmall: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: 12,
  color: "#94a3b8",
};

/** Style helper for primary CTA buttons used inside email content. */
export function ctaButtonStyle(brandColor: string | undefined): React.CSSProperties {
  return {
    backgroundColor: brandColor || DEFAULT_BRAND.primaryColor,
    color: "#ffffff",
    padding: "12px 24px",
    borderRadius: 8,
    textDecoration: "none",
    display: "inline-block",
    fontWeight: 600,
    fontSize: 15,
  };
}

export const emailHeadingStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: "#0f172a",
  margin: "0 0 12px",
};

export const emailBodyTextStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.55,
  color: "#0f172a",
  margin: "0 0 14px",
};

export const emailMutedTextStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.5,
  color: "#475569",
  margin: "0 0 14px",
};
