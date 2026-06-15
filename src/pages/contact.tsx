import { useState } from "react";
import Link from "next/link";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  Send,
  MessageSquare,
  CheckCircle,
  ArrowRight,
  Headphones,
  Book,
  Users,
  Zap
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, cardBase, btnPress, iconChip, Eyebrow } from "@/components/motion/marketing";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    message: "",
    subject: "general"
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Honeypot field - bots fill every input; humans never see it
  // because it's hidden. If it's non-empty when we POST, the API
  // treats the request as spam.
  const [website, setWebsite] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const resp = await fetch("/api/contact-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, website }),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j?.error || "Could not send your message.");
      }
      setSubmitted(true);
      setFormData({ name: "", email: "", phone: "", company: "", message: "", subject: "general" });
      setWebsite("");
    } catch (err: any) {
      setSubmitError(err?.message || "Could not send your message. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const contactMethods = [
    {
      icon: Mail,
      title: "Email Us",
      value: "support@cateringms.com",
      description: "Get a response within 24 hours",
      href: "mailto:support@cateringms.com",
      gradient: "from-blue-500 to-cyan-500"
    },
    {
      icon: Phone,
      title: "Call Us",
      value: "083 652 5755",
      description: "Mon-Fri, 8am-5pm SAST",
      href: "tel:+27836525755",
      gradient: "from-green-500 to-emerald-500"
    },
    {
      icon: MapPin,
      title: "Visit Us",
      value: "17 Swalle Street, Golden Acre",
      description: "South Africa",
      href: "https://maps.google.com/?q=17+Swalle+Street+Golden+Acre",
      gradient: "from-violet-500 to-fuchsia-500"
    }
  ];

  const supportOptions = [
    {
      icon: Book,
      title: "Documentation",
      description: "Browse our comprehensive guides and tutorials",
      link: "/blog",
      linkText: "View Guides"
    },
    {
      icon: Headphones,
      title: "Live Support",
      description: "Chat with our support team in real-time",
      link: "/auth/login",
      linkText: "Start Chat"
    },
    {
      icon: Users,
      title: "Community",
      description: "Connect with other catering professionals",
      link: "/blog",
      linkText: "Join Community"
    }
  ];

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "CateringMS",
    "legalName": "CateringMS (A product of Skylight Digital)",
    "url": "https://cateringms.com",
    "contactPoint": [
      {
        "@type": "ContactPoint",
        "telephone": "+27-83-652-5755",
        "contactType": "customer support",
        "areaServed": "ZA",
        "availableLanguage": ["English", "Afrikaans"],
        "hoursAvailable": {
          "@type": "OpeningHoursSpecification",
          "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          "opens": "08:00",
          "closes": "17:00"
        }
      },
      {
        "@type": "ContactPoint",
        "email": "support@cateringms.com",
        "contactType": "customer support"
      }
    ],
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "17 Swalle Street",
      "addressLocality": "Golden Acre",
      "addressCountry": "ZA"
    }
  };

  return (
    <>
      <Head>
        <title>Contact us - CateringMS</title>
        <meta name="description" content="Get in touch with CateringMS support team. Email, phone, or visit us. We're here to help you succeed with your catering business. Response within 24 hours guaranteed." />
        <meta name="keywords" content="contact cateringms, catering software support, get help, customer service" />
        <link rel="canonical" href="https://cateringms.com/contact" />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </Head>

      <Header />

      <div className="min-h-screen bg-white text-slate-900">
        {/* ===================== HERO ===================== */}
        <section className="relative overflow-hidden border-b border-slate-100 bg-white">
          {/* Soft brand glow + faint grid, masked so it fades into the page. */}
          <div className="pointer-events-none absolute inset-x-0 -top-40 h-[560px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.12),transparent)]" />
          <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]" />

          <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-28">
            <Stagger className="mx-auto mb-14 max-w-3xl text-center" gap={0.07}>
              <StaggerItem className="mb-6 flex justify-center">
                <Eyebrow icon={MessageSquare} className="border-violet-200 bg-violet-50 text-violet-700">
                  We're Here to Help
                </Eyebrow>
              </StaggerItem>

              <StaggerItem>
                <h1 className="text-balance text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                  Get in Touch with Our{" "}
                  <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
                    Team
                  </span>
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-slate-600 sm:text-xl">
                  Have questions about our platform? Need help getting started? Our dedicated support team is ready to assist you.
                </p>
              </StaggerItem>

              <StaggerItem>
                <p className="mt-5 text-sm text-slate-500">
                  Learn more from our <Link href="/blog" className="font-medium text-violet-600 underline-offset-2 hover:underline">comprehensive guides</Link> or explore <Link href="/features" className="font-medium text-violet-600 underline-offset-2 hover:underline">platform features</Link>.
                </p>
              </StaggerItem>
            </Stagger>

            {/* Contact methods */}
            <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {contactMethods.map((method, index) => (
                <StaggerItem key={index}>
                  <a
                    href={method.href}
                    target={method.href.startsWith("http") ? "_blank" : undefined}
                    rel={method.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className={`${cardBase} block h-full p-7`}
                  >
                    <div className={`${iconChip} mb-5 h-14 w-14 bg-gradient-to-br ${method.gradient}`}>
                      <method.icon className="h-7 w-7 text-white" />
                    </div>
                    <h3 className="mb-2 text-xl font-semibold text-slate-900">{method.title}</h3>
                    <p className="mb-2 break-words text-lg font-semibold text-violet-600">{method.value}</p>
                    <p className="text-sm text-slate-600">{method.description}</p>
                    <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-violet-600">
                      <span>Contact Now</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </div>
                  </a>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ===================== FORM + SIDEBAR ===================== */}
        <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="grid gap-8 sm:gap-12 lg:grid-cols-2">
            {/* Form column */}
            <div>
              <Reveal className="mb-8">
                <Eyebrow icon={Clock} className="border-emerald-200 bg-emerald-50 text-emerald-600">
                  24-Hour Response Time
                </Eyebrow>
                <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                  Send Us a Message
                </h2>
                <p className="mt-4 text-lg leading-relaxed text-slate-600">
                  Fill out the form below and our team will get back to you within 24 hours. For urgent matters, please call us directly.
                </p>
              </Reveal>

              {submitted ? (
                <Reveal>
                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center sm:p-12">
                    <div className={`${iconChip} mx-auto mb-6 h-16 w-16 bg-gradient-to-br from-emerald-500 to-green-600`}>
                      <CheckCircle className="h-9 w-9 text-white" />
                    </div>
                    <h3 className="mb-3 text-2xl font-bold tracking-tight text-slate-900">Message Sent Successfully!</h3>
                    <p className="mb-6 text-base text-slate-700">
                      Thank you for contacting us. We've received your message and will respond within 24 hours.
                    </p>
                    <Button
                      onClick={() => setSubmitted(false)}
                      className={`h-12 rounded-full bg-gradient-to-b from-emerald-600 to-emerald-700 px-8 text-base font-semibold text-white shadow-lg shadow-emerald-600/20 hover:from-emerald-600 hover:to-emerald-800 ${btnPress}`}
                    >
                      Send Another Message
                    </Button>
                  </div>
                </Reveal>
              ) : (
                <Reveal>
                  <div className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8`}>
                    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="name" className="text-sm sm:text-base">Full Name *</Label>
                          <Input
                            id="name"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="John Smith"
                            required
                            className="h-11 text-base sm:h-12"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email" className="text-sm sm:text-base">Email Address *</Label>
                          <Input
                            id="email"
                            name="email"
                            type="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="john@example.com"
                            required
                            className="h-11 text-base sm:h-12"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="phone" className="text-sm sm:text-base">Phone Number</Label>
                          <Input
                            id="phone"
                            name="phone"
                            value={formData.phone}
                            onChange={handleChange}
                            placeholder="082 123 4567"
                            className="h-11 text-base sm:h-12"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="company" className="text-sm sm:text-base">Company Name</Label>
                          <Input
                            id="company"
                            name="company"
                            value={formData.company}
                            onChange={handleChange}
                            placeholder="Your Catering Business"
                            className="h-11 text-base sm:h-12"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="subject" className="text-sm sm:text-base">Subject *</Label>
                        <select
                          id="subject"
                          name="subject"
                          value={formData.subject}
                          onChange={handleChange}
                          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-violet-500 sm:h-12"
                          required
                        >
                          <option value="general">General Inquiry</option>
                          <option value="sales">Sales Question</option>
                          <option value="support">Technical Support</option>
                          <option value="demo">Request a Demo</option>
                          <option value="pricing">Pricing Information</option>
                          <option value="partnership">Partnership Opportunities</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="message" className="text-sm sm:text-base">Message *</Label>
                        <Textarea
                          id="message"
                          name="message"
                          value={formData.message}
                          onChange={handleChange}
                          placeholder="Tell us how we can help you..."
                          rows={6}
                          required
                          className="resize-none text-base"
                        />
                      </div>

                      {/* Honeypot - hidden from real users, bots fill it. */}
                      <input
                        type="text"
                        name="website"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        tabIndex={-1}
                        autoComplete="off"
                        aria-hidden="true"
                        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
                      />

                      {submitError && (
                        <p className="text-center text-sm text-rose-600" role="alert">
                          {submitError}
                        </p>
                      )}

                      <Button
                        type="submit"
                        size="lg"
                        disabled={submitting}
                        className={`h-12 w-full rounded-full bg-gradient-to-b from-violet-600 to-violet-700 text-base font-semibold text-white shadow-lg shadow-violet-600/20 hover:from-violet-600 hover:to-violet-800 hover:shadow-xl hover:shadow-violet-600/30 disabled:opacity-60 sm:h-14 sm:text-lg ${btnPress}`}
                      >
                        <Send className="mr-2 h-5 w-5" />
                        {submitting ? "Sending..." : "Send Message"}
                      </Button>

                      <p className="text-center text-xs text-slate-500 sm:text-sm">
                        By submitting this form, you agree to our{" "}
                        <Link href="/privacy" className="font-medium text-violet-600 underline-offset-2 hover:underline">
                          Privacy Policy
                        </Link>
                      </p>
                    </form>
                  </div>
                </Reveal>
              )}
            </div>

            {/* Sidebar column */}
            <div className="space-y-8">
              <Reveal>
                <h3 className="mb-6 text-2xl font-bold tracking-tight text-slate-900">Other Ways to Get Help</h3>
                <Stagger className="space-y-4" gap={0.06}>
                  {supportOptions.map((option, index) => (
                    <StaggerItem key={index}>
                      <div className={`${cardBase} p-6`}>
                        <div className="flex items-start gap-4">
                          <div className={`${iconChip} h-12 w-12 shrink-0 bg-gradient-to-br from-violet-100 to-fuchsia-100`}>
                            <option.icon className="h-6 w-6 text-violet-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="mb-1.5 text-lg font-semibold text-slate-900">{option.title}</h4>
                            <p className="mb-3 text-sm text-slate-600">{option.description}</p>
                            <Link href={option.link} className="group inline-flex items-center gap-2 text-sm font-medium text-violet-600 transition-colors duration-150 hover:text-violet-700">
                              {option.linkText}
                              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    </StaggerItem>
                  ))}
                </Stagger>
              </Reveal>

              <Reveal delay={0.05}>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-7">
                  <div className="mb-5 flex items-start gap-4">
                    <div className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-sm`}>
                      <Clock className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h4 className="mb-2 text-lg font-semibold text-slate-900">Business Hours</h4>
                      <div className="space-y-1 text-sm text-slate-700 sm:text-base">
                        <p>Monday to Friday: 8:00am to 5:00pm SAST</p>
                        <p>Saturday to Sunday: Closed</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 sm:text-sm">
                    For urgent technical issues outside business hours, please email us and we'll respond as soon as possible.
                  </p>
                </div>
              </Reveal>

              <Reveal delay={0.1}>
                <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-7">
                  <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-sm`}>
                    <Zap className="h-6 w-6 text-white" />
                  </div>
                  <h4 className="mt-4 mb-2 text-xl font-bold tracking-tight text-slate-900">Ready to Get Started?</h4>
                  <p className="mb-6 text-sm text-slate-700 sm:text-base">
                    Start your 14-day free trial today. No credit card required. Full access to all features.
                  </p>

                  <div className="flex flex-col gap-3">
                    <Link href="/company-signup" className="block">
                      <Button className={`h-12 w-full rounded-full bg-gradient-to-b from-violet-600 to-violet-700 text-base font-semibold text-white shadow-lg shadow-violet-600/20 hover:from-violet-600 hover:to-violet-800 ${btnPress}`}>
                        Start Free Trial
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </Button>
                    </Link>
                    <Link href="/pricing" className="block">
                      <Button variant="outline" className={`h-12 w-full rounded-full border-slate-300 bg-white text-base font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 ${btnPress}`}>
                        View Pricing Plans
                      </Button>
                    </Link>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ===================== FAQ CTA ===================== */}
        <section className="bg-slate-50 py-20 md:py-28">
          <Reveal className="mx-auto max-w-4xl px-4 text-center">
            <Eyebrow icon={Book} className="border-blue-200 bg-blue-50 text-blue-600">
              Help Center
            </Eyebrow>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Frequently Asked Questions
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Find quick answers to common questions in our help center
            </p>
            <p className="mt-3 text-base text-slate-500">
              Visit our <Link href="/blog" className="font-medium text-violet-600 underline-offset-2 hover:underline">blog for detailed guides</Link> on getting started and maximizing your results.
            </p>

            <Link href="/blog" className="mt-8 inline-block w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className={`h-12 w-full rounded-full border-slate-300 bg-white px-8 font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 sm:w-auto ${btnPress}`}
              >
                <Book className="mr-2 h-5 w-5" />
                Visit Help Center
              </Button>
            </Link>
          </Reveal>
        </section>

        <Footer />
      </div>
    </>
  );
}
