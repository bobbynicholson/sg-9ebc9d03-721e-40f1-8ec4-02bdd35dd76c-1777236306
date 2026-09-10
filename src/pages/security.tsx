import Head from "next/head";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Lock,
  Key,
  Database,
  Eye,
  CheckCircle2,
  Server,
  FileCheck,
  ShieldCheck,
  Fingerprint,
  AlertTriangle,
  ArrowRight
} from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, btnPress } from "@/components/motion/marketing";

export default function SecurityPage() {
  const securityFeatures = [
    {
      icon: Shield,
      title: "Bank-Level Encryption",
      description: "AES-256 encryption at rest and TLS 1.3 in transit. Your data is protected with military-grade security."
    },
    {
      icon: Lock,
      title: "Row-Level Security",
      description: "Users can only access their own data. Even our database administrators cannot view your client information without authorization."
    },
    {
      icon: Key,
      title: "Secure Authentication",
      description: "OAuth 2.0 integration with Google, bcrypt password hashing, and JWT-based sessions ensure only authorized access."
    },
    {
      icon: Database,
      title: "Automated Backups",
      description: "Daily encrypted backups with point-in-time recovery. Your data is safe even in worst-case scenarios."
    },
    {
      icon: Server,
      title: "Enterprise Infrastructure",
      description: "Hosted on AWS with SOC 2 Type II certification. 99.9% uptime guaranteed with automatic DDoS protection."
    },
    {
      icon: FileCheck,
      title: "GDPR & POPIA Compliant",
      description: "Full compliance with international data protection regulations. You and your clients maintain complete data ownership."
    },
    {
      icon: ShieldCheck,
      title: "PCI-DSS Compliant Payments",
      description: "We never store credit card details. All payments processed through certified gateways (PayFast, Stripe)."
    },
    {
      icon: Fingerprint,
      title: "Audit Logging",
      description: "Complete audit trail of all system activities. Track who accessed what and when for full transparency."
    }
  ];

  const complianceStandards = [
    { name: "GDPR", description: "EU General Data Protection Regulation" },
    { name: "POPIA", description: "Protection of Personal Information Act (South Africa)" },
    { name: "PCI-DSS", description: "Payment Card Industry Data Security Standard" },
    { name: "SOC 2", description: "Service Organization Control 2 Type II" }
  ];

  const protectionSections = [
    {
      title: "Encryption Everywhere",
      items: [
        "All data encrypted at rest using AES-256 encryption",
        "TLS 1.3 encryption for all data in transit",
        "Encrypted backups stored in multiple geographic locations",
        "End-to-end encryption for sensitive client information"
      ]
    },
    {
      title: "Access Control",
      items: [
        "Role-based access control (RBAC) for team members",
        "Row-level security prevents unauthorized data access",
        "Multi-factor authentication available for admin accounts",
        "Automatic session timeouts and forced re-authentication"
      ]
    },
    {
      title: "Infrastructure Security",
      items: [
        "Hosted on AWS with SOC 2 Type II certification",
        "Automatic DDoS protection and traffic filtering",
        "Regular third-party security audits and penetration testing",
        "24/7 monitoring with automated threat detection"
      ]
    },
    {
      title: "Your Data Rights",
      items: [
        "You own your data - we never sell or share it",
        "Export your data anytime in standard formats",
        "Request complete account deletion within 30 days",
        "Transparent privacy policy with no hidden clauses"
      ]
    }
  ];

  const incidentSteps = [
    "Immediate containment and assessment of the incident",
    "Notification to affected users within 72 hours (GDPR requirement)",
    "Full investigation with detailed incident report",
    "Implementation of corrective measures to prevent recurrence",
    "Transparent communication throughout the process"
  ];

  return (
    <>
      <Head>
        <title>Security & Data Protection | CateringMS - Enterprise-Grade Security</title>
        <meta
          name="description"
          content="CateringMS uses bank-level encryption, GDPR compliance, and enterprise infrastructure to protect your catering business data. Learn about our comprehensive security measures."
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://cateringms.com/security" />
      </Head>

      <Header />

      <div className="font-body min-h-screen bg-white text-stone-900">
        <main>
          {/* ===================== HERO ===================== */}
          <section className="border-b border-stone-200 bg-stone-50">
            <div className="mx-auto max-w-7xl px-4 py-20 md:py-28">
              <Stagger className="mx-auto max-w-3xl text-center" gap={0.07}>
                <StaggerItem className="mb-7 flex justify-center">
                  <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700">
                    <ShieldCheck className="h-8 w-8" />
                  </span>
                </StaggerItem>

                <StaggerItem>
                  <h1 className="text-balance font-display text-4xl font-semibold leading-[1.08] tracking-tight text-stone-900 sm:text-5xl lg:text-6xl">
                    Your data security is our top priority
                  </h1>
                </StaggerItem>

                <StaggerItem>
                  <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-stone-700 sm:text-xl">
                    Bank-level encryption, GDPR compliance, and enterprise infrastructure protecting your catering business data 24/7
                  </p>
                </StaggerItem>

                <StaggerItem className="mx-auto mt-9 flex max-w-md flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
                  <Button
                    size="lg"
                    className={`group h-12 w-full rounded-full bg-gradient-to-b from-amber-500 to-amber-600 px-8 text-base font-semibold text-white shadow-lg shadow-amber-700/25 hover:from-amber-500 hover:to-amber-700 hover:shadow-xl hover:shadow-amber-700/30 sm:w-auto ${btnPress}`}
                    asChild
                  >
                    <Link href="/company-signup">
                      Start Free Trial
                      <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  </Button>

                  <Button
                    size="lg"
                    variant="outline"
                    className={`h-12 w-full rounded-full border-stone-300 bg-white px-8 text-base font-semibold text-stone-800 hover:border-stone-400 hover:bg-stone-50 sm:w-auto ${btnPress}`}
                    asChild
                  >
                    <Link href="/contact">
                      Contact Security Team
                    </Link>
                  </Button>
                </StaggerItem>
              </Stagger>
            </div>
          </section>

          {/* ===================== TRUST INDICATORS ===================== */}
          {/* Hairline-divided row, not chip cards: compliance marks read as a
              credential strip rather than four identical tiles. */}
          <section className="border-b border-stone-200 bg-white py-14">
            <div className="mx-auto max-w-6xl px-4">
              <Stagger className="grid divide-stone-200 sm:grid-cols-2 sm:divide-x lg:grid-cols-4" gap={0.06}>
                {complianceStandards.map((standard, index) => (
                  <StaggerItem key={index}>
                    <div className="flex h-full flex-col items-center px-6 py-4 text-center">
                      <p className="font-display text-xl font-semibold text-stone-900">{standard.name}</p>
                      <p className="mt-2 max-w-[18ch] text-sm leading-relaxed text-stone-600">{standard.description}</p>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </section>

          {/* ===================== SECURITY FEATURES ===================== */}
          <section className="bg-stone-50 py-20 md:py-28">
            <div className="mx-auto max-w-7xl px-4">
              <Reveal className="mx-auto mb-14 max-w-2xl text-center">
                <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-[2.75rem] md:leading-[1.1]">
                  Comprehensive Security Measures
                </h2>
                <p className="mt-4 text-pretty text-lg leading-relaxed text-stone-700">
                  Multiple layers of protection ensure your business and client data remains secure
                </p>
              </Reveal>

              {/* Icon-led tiles with a hairline top rule and a quiet amber glyph.
                  No filled gradient chips, so the grid reads as a list of
                  measures rather than eight identical badges. */}
              <Stagger className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
                {securityFeatures.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <StaggerItem key={index}>
                      <div className="group flex h-full flex-col border-t border-stone-200 pt-5">
                        <Icon className={`h-7 w-7 text-amber-600 transition-transform duration-300 ${EASE} group-hover:-translate-y-0.5`} />
                        <h3 className="mb-2 mt-4 font-display text-lg font-semibold text-stone-900">{feature.title}</h3>
                        <p className="text-sm leading-relaxed text-stone-600">{feature.description}</p>
                      </div>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            </div>
          </section>

          {/* ===================== DATA PROTECTION DETAILS ===================== */}
          <section className="bg-white py-20 md:py-28">
            <div className="mx-auto max-w-5xl px-4">
              <Reveal className="mb-14">
                <h2 className="max-w-2xl text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-[2.75rem] md:leading-[1.1]">
                  How We Protect Your Data
                </h2>
              </Reveal>

              {/* Two-column editorial list. Each cluster leads with a numbered
                  display heading; emphasis comes from type, not a card box. */}
              <Stagger className="grid gap-x-12 gap-y-12 md:grid-cols-2">
                {protectionSections.map((section, index) => (
                  <StaggerItem key={index}>
                    <div className="border-t-2 border-amber-200 pt-6">
                      <h3 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
                        {section.title}
                      </h3>
                      <ul className="mt-5 space-y-3">
                        {section.items.map((item, itemIndex) => (
                          <li key={itemIndex} className="flex items-start gap-3">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                            <span className="leading-relaxed text-stone-700">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </section>

          {/* ===================== INCIDENT RESPONSE ===================== */}
          <section className="bg-stone-50 py-20 md:py-28">
            <div className="mx-auto max-w-4xl px-4">
              <Reveal className="mb-10">
                <div className="flex items-start gap-4">
                  <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-300 bg-amber-50 text-amber-700">
                    <AlertTriangle className="h-7 w-7" />
                  </span>
                  <div>
                    <h2 className="font-display text-3xl font-semibold tracking-tight text-stone-900">Security Incident Response</h2>
                    <p className="mt-3 text-lg leading-relaxed text-stone-700">
                      In the unlikely event of a security incident, we have a comprehensive response plan
                    </p>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={0.05}>
                <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
                  <Stagger className="space-y-5" gap={0.05}>
                    {incidentSteps.map((step, index) => (
                      <StaggerItem key={index}>
                        <div className="flex items-start gap-4">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-600 font-display text-sm font-semibold text-white">
                            {index + 1}
                          </div>
                          <span className="pt-1 leading-relaxed text-stone-700">{step}</span>
                        </div>
                      </StaggerItem>
                    ))}
                  </Stagger>
                </div>
              </Reveal>
            </div>
          </section>

          {/* ===================== TRUST CTA (warm solid) ===================== */}
          <section className="px-4 py-20 md:py-24">
            <Reveal className="mx-auto max-w-6xl rounded-3xl bg-stone-900 px-6 py-16 text-center shadow-2xl shadow-stone-900/20 sm:px-12 md:py-20">
              <div className="mx-auto max-w-3xl">
                <Eye className="mx-auto mb-6 h-14 w-14 text-amber-400" />
                <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
                  Transparency is Our Policy
                </h2>
                <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-stone-300 sm:text-xl">
                  We believe security through transparency builds trust. Have questions about our security measures? Our team is here to help.
                </p>

                <div className="mx-auto mt-9 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                  <Button
                    size="lg"
                    className={`group h-12 w-full rounded-full bg-amber-500 px-9 text-base font-semibold text-stone-950 shadow-xl hover:bg-amber-400 sm:w-auto ${btnPress}`}
                    asChild
                  >
                    <Link href="/contact">
                      Contact Security Team
                      <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className={`h-12 w-full rounded-full border-white/40 bg-transparent px-9 text-base font-semibold text-white hover:border-white hover:bg-white/10 sm:w-auto ${btnPress}`}
                    asChild
                  >
                    <Link href="/privacy">
                      View Privacy Policy
                    </Link>
                  </Button>
                </div>
              </div>
            </Reveal>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
