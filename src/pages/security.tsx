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
import { EASE, cardBase, btnPress, iconChip, Eyebrow } from "@/components/motion/marketing";

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

      <div className="min-h-screen bg-white text-slate-900">
        <main>
          {/* ===================== HERO ===================== */}
          <section className="relative overflow-hidden border-b border-slate-100 bg-white">
            {/* Soft brand glow + faint grid, masked so it fades into the page. */}
            <div className="pointer-events-none absolute inset-x-0 -top-40 h-[560px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.12),transparent)]" />
            <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]" />

            <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-28">
              <Stagger className="mx-auto max-w-3xl text-center" gap={0.07}>
                <StaggerItem className="mb-6 flex justify-center">
                  <Eyebrow icon={ShieldCheck} className="border-emerald-200 bg-emerald-50 text-emerald-600">
                    Enterprise-Grade Security
                  </Eyebrow>
                </StaggerItem>

                <StaggerItem>
                  <h1 className="text-balance text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                    Your Data Security is Our{" "}
                    <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
                      Top Priority
                    </span>
                  </h1>
                </StaggerItem>

                <StaggerItem>
                  <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-slate-600 sm:text-xl">
                    Bank-level encryption, GDPR compliance, and enterprise infrastructure protecting your catering business data 24/7
                  </p>
                </StaggerItem>

                <StaggerItem className="mx-auto mt-8 flex max-w-md flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
                  <Button
                    size="lg"
                    className={`h-12 w-full rounded-full bg-gradient-to-b from-violet-600 to-violet-700 px-8 text-base font-semibold text-white shadow-lg shadow-violet-600/20 hover:from-violet-600 hover:to-violet-800 hover:shadow-xl hover:shadow-violet-600/30 sm:w-auto ${btnPress}`}
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
                    className={`h-12 w-full rounded-full border-slate-300 bg-white px-8 text-base font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 sm:w-auto ${btnPress}`}
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
          <section className="border-b border-slate-100 bg-white py-16">
            <div className="mx-auto max-w-7xl px-4">
              <Stagger className="flex flex-wrap justify-center gap-8 md:gap-12" gap={0.06}>
                {complianceStandards.map((standard, index) => (
                  <StaggerItem key={index}>
                    <div className="group flex flex-col items-center text-center">
                      <div className={`${iconChip} mb-3 h-20 w-20 bg-gradient-to-br from-violet-100 to-fuchsia-100`}>
                        <ShieldCheck className="h-10 w-10 text-violet-600" />
                      </div>
                      <p className="font-semibold text-slate-900">{standard.name}</p>
                      <p className="mt-1 max-w-[150px] text-sm text-slate-600">{standard.description}</p>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </section>

          {/* ===================== SECURITY FEATURES ===================== */}
          <section className="bg-slate-50 py-20 md:py-28">
            <div className="mx-auto max-w-7xl px-4">
              <Reveal className="mx-auto mb-16 max-w-3xl text-center">
                <Eyebrow icon={Shield} className="border-violet-200 bg-violet-50 text-violet-700">
                  Defence in depth
                </Eyebrow>
                <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
                  Comprehensive Security Measures
                </h2>
                <p className="mt-4 text-balance text-lg text-slate-600">
                  Multiple layers of protection ensure your business and client data remains secure
                </p>
              </Reveal>

              <Stagger className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {securityFeatures.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <StaggerItem key={index}>
                      <div className={`${cardBase} flex h-full flex-col p-7`}>
                        <div className={`${iconChip} mb-5 h-14 w-14 bg-gradient-to-br from-violet-500 to-fuchsia-500`}>
                          <Icon className="h-7 w-7 text-white" />
                        </div>
                        <h3 className="mb-2 text-lg font-semibold text-slate-900">{feature.title}</h3>
                        <p className="text-sm leading-relaxed text-slate-600">{feature.description}</p>
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
              <Reveal className="mb-16 text-center">
                <Eyebrow icon={Lock} className="border-emerald-200 bg-emerald-50 text-emerald-600">
                  Under the hood
                </Eyebrow>
                <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
                  How We Protect Your Data
                </h2>
              </Reveal>

              <Stagger className="space-y-6">
                {protectionSections.map((section, index) => (
                  <StaggerItem key={index}>
                    <div className={`${cardBase} p-8`}>
                      <h3 className="mb-5 flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-900">
                        <span className={`${iconChip} h-10 w-10 bg-gradient-to-br from-violet-100 to-fuchsia-100`}>
                          <CheckCircle2 className="h-6 w-6 text-violet-600" />
                        </span>
                        {section.title}
                      </h3>
                      <ul className="space-y-3 pl-1">
                        {section.items.map((item, itemIndex) => (
                          <li key={itemIndex} className="flex items-start gap-3">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
                            <span className="text-slate-600">{item}</span>
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
          <section className="bg-slate-50 py-20 md:py-28">
            <div className="mx-auto max-w-4xl px-4">
              <Reveal className="mb-10">
                <div className="flex items-start gap-4">
                  <div className={`${iconChip} h-16 w-16 shrink-0 bg-gradient-to-br from-orange-100 to-amber-100`}>
                    <AlertTriangle className="h-8 w-8 text-orange-600" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Security Incident Response</h2>
                    <p className="mt-3 text-lg text-slate-600">
                      In the unlikely event of a security incident, we have a comprehensive response plan
                    </p>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={0.05}>
                <div className="rounded-2xl border border-orange-200 bg-white p-8 shadow-sm">
                  <Stagger className="space-y-4" gap={0.05}>
                    {incidentSteps.map((step, index) => (
                      <StaggerItem key={index}>
                        <div className="flex items-start gap-4">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-600 font-bold text-white">
                            {index + 1}
                          </div>
                          <span className="pt-1 text-slate-600">{step}</span>
                        </div>
                      </StaggerItem>
                    ))}
                  </Stagger>
                </div>
              </Reveal>
            </div>
          </section>

          {/* ===================== TRUST CTA (dark) ===================== */}
          <section className="px-4 py-20 md:py-24">
            <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 px-6 py-16 text-center shadow-2xl shadow-violet-600/20 sm:px-12 md:py-20">
              <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)]" />
              <div className="relative mx-auto max-w-3xl">
                <Eye className="mx-auto mb-6 h-16 w-16 text-white/90" />
                <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
                  Transparency is Our Policy
                </h2>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-violet-50 sm:text-xl">
                  We believe security through transparency builds trust. Have questions about our security measures? Our team is here to help.
                </p>

                <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                  <Button
                    size="lg"
                    className={`h-12 w-full rounded-full bg-white px-9 text-base font-semibold text-violet-700 shadow-xl hover:bg-violet-50 sm:w-auto ${btnPress}`}
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
                    className={`h-12 w-full rounded-full border-white/60 bg-transparent px-9 text-base font-semibold text-white hover:border-white hover:bg-white/10 sm:w-auto ${btnPress}`}
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
