import Head from "next/head";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  AlertTriangle
} from "lucide-react";

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

      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        <Header />

        <main>
          {/* Hero Section */}
          <section className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 text-white py-20">
            <div className="container mx-auto px-4 relative z-10">
              <div className="max-w-4xl mx-auto text-center">
                <Badge className="mb-6 bg-green-500 text-white border-0 px-4 py-2">
                  <ShieldCheck className="w-4 h-4 mr-2 inline" />
                  Enterprise-Grade Security
                </Badge>
                
                <h1 className="text-4xl md:text-6xl font-bold mb-6">
                  Your Data Security is Our Top Priority
                </h1>
                
                <p className="text-xl md:text-2xl mb-8 text-purple-100">
                  Bank-level encryption, GDPR compliance, and enterprise infrastructure protecting your catering business data 24/7
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button 
                    size="lg" 
                    className="bg-white text-purple-600 hover:bg-gray-100"
                    asChild
                  >
                    <Link href="/company-signup">
                      Start Free Trial
                    </Link>
                  </Button>
                  
                  <Button 
                    size="lg" 
                    variant="outline" 
                    className="border-white text-white hover:bg-white/10"
                    asChild
                  >
                    <Link href="/contact">
                      Contact Security Team
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Trust Indicators */}
          <section className="py-12 bg-white border-b">
            <div className="container mx-auto px-4">
              <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
                {complianceStandards.map((standard, index) => (
                  <div key={index} className="text-center">
                    <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-purple-100 flex items-center justify-center">
                      <ShieldCheck className="w-10 h-10 text-purple-600" />
                    </div>
                    <p className="font-bold text-gray-900">{standard.name}</p>
                    <p className="text-sm text-gray-600 max-w-[150px]">{standard.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Security Features Grid */}
          <section className="py-20 bg-gray-50">
            <div className="container mx-auto px-4">
              <div className="max-w-3xl mx-auto text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Comprehensive Security Measures
                </h2>
                <p className="text-xl text-gray-600">
                  Multiple layers of protection ensure your business and client data remains secure
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
                {securityFeatures.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <Card key={index} className="border-2 hover:border-purple-600 transition-colors hover:shadow-lg">
                      <CardContent className="pt-6">
                        <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center mb-4">
                          <Icon className="w-7 h-7 text-purple-600" />
                        </div>
                        <h3 className="font-bold text-lg mb-2 text-gray-900">{feature.title}</h3>
                        <p className="text-gray-600 text-sm">{feature.description}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Data Protection Details */}
          <section className="py-20 bg-white">
            <div className="container mx-auto px-4">
              <div className="max-w-5xl mx-auto">
                <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">
                  How We Protect Your Data
                </h2>

                <div className="space-y-8">
                  {[
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
                  ].map((section, index) => (
                    <Card key={index} className="border-2">
                      <CardContent className="pt-6">
                        <h3 className="text-2xl font-bold mb-4 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                            <CheckCircle2 className="w-6 h-6 text-purple-600" />
                          </div>
                          {section.title}
                        </h3>
                        <ul className="space-y-3 ml-13">
                          {section.items.map((item, itemIndex) => (
                            <li key={itemIndex} className="flex items-start gap-3">
                              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                              <span className="text-gray-700">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Incident Response */}
          <section className="py-20 bg-gradient-to-br from-orange-50 to-red-50">
            <div className="container mx-auto px-4">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-start gap-4 mb-8">
                  <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-8 h-8 text-orange-600" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold mb-4">Security Incident Response</h2>
                    <p className="text-lg text-gray-700">
                      In the unlikely event of a security incident, we have a comprehensive response plan
                    </p>
                  </div>
                </div>

                <Card className="border-2 border-orange-200">
                  <CardContent className="pt-6">
                    <ol className="space-y-4">
                      {[
                        "Immediate containment and assessment of the incident",
                        "Notification to affected users within 72 hours (GDPR requirement)",
                        "Full investigation with detailed incident report",
                        "Implementation of corrective measures to prevent recurrence",
                        "Transparent communication throughout the process"
                      ].map((step, index) => (
                        <li key={index} className="flex items-start gap-4">
                          <div className="w-8 h-8 rounded-full bg-orange-600 text-white flex items-center justify-center flex-shrink-0 font-bold">
                            {index + 1}
                          </div>
                          <span className="text-gray-700 pt-1">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* Trust CTA */}
          <section className="py-20 bg-gradient-to-br from-purple-600 to-indigo-700 text-white">
            <div className="container mx-auto px-4 text-center">
              <div className="max-w-3xl mx-auto">
                <Eye className="w-16 h-16 mx-auto mb-6 opacity-90" />
                <h2 className="text-3xl md:text-4xl font-bold mb-6">
                  Transparency is Our Policy
                </h2>
                <p className="text-xl mb-8 text-purple-100">
                  We believe security through transparency builds trust. Have questions about our security measures? Our team is here to help.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button 
                    size="lg" 
                    className="bg-white text-purple-600 hover:bg-gray-100"
                    asChild
                  >
                    <Link href="/contact">
                      Contact Security Team
                    </Link>
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline"
                    className="border-white text-white hover:bg-white/10"
                    asChild
                  >
                    <Link href="/privacy">
                      View Privacy Policy
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
