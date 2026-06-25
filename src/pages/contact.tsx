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
import { btnPress } from "@/components/motion/marketing";

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
      href: "mailto:support@cateringms.com"
    },
    {
      icon: Phone,
      title: "Call Us",
      value: "083 652 5755",
      description: "Mon-Fri, 8am-5pm SAST",
      href: "tel:+27836525755"
    },
    {
      icon: MapPin,
      title: "Visit Us",
      value: "17 Swalle Street, Golden Acre",
      description: "South Africa",
      href: "https://maps.google.com/?q=17+Swalle+Street+Golden+Acre"
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

      <div className="font-body min-h-screen bg-stone-50 text-stone-900">
        {/* ===================== HERO ===================== */}
        <section className="border-b border-stone-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 pb-16 pt-20 md:pb-20 md:pt-28">
            <Stagger className="mx-auto mb-16 max-w-3xl text-center" gap={0.07}>
              <StaggerItem>
                <h1 className="text-balance font-display text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl lg:text-6xl">
                  Get in Touch with Our Team
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-stone-700 sm:text-xl">
                  Have questions about our platform? Need help getting started? Our dedicated support team is ready to assist you.
                </p>
              </StaggerItem>

              <StaggerItem>
                <p className="mt-5 text-sm text-stone-600">
                  Learn more from our <Link href="/blog" className="font-medium text-amber-700 underline-offset-2 hover:underline">comprehensive guides</Link> or explore <Link href="/features" className="font-medium text-amber-700 underline-offset-2 hover:underline">platform features</Link>.
                </p>
              </StaggerItem>
            </Stagger>

            {/* Contact methods - a quiet divided row, not three matching cards.
                The icon sits inline with the label so the three options read as
                one list of channels rather than a uniform card grid. */}
            <Stagger className="mx-auto grid max-w-4xl gap-px overflow-hidden rounded-2xl border border-stone-200 bg-stone-200 sm:grid-cols-3">
              {contactMethods.map((method, index) => (
                <StaggerItem key={index}>
                  <a
                    href={method.href}
                    target={method.href.startsWith("http") ? "_blank" : undefined}
                    rel={method.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="group flex h-full flex-col bg-white p-7 transition-colors duration-200 hover:bg-amber-50/60"
                  >
                    <div className="mb-4 inline-flex items-center gap-2.5 text-amber-700">
                      <method.icon className="h-5 w-5" />
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{method.title}</h3>
                    </div>
                    <p className="break-words text-lg font-semibold text-stone-900">{method.value}</p>
                    <p className="mt-1 text-sm text-stone-600">{method.description}</p>
                    <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700">
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
                <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
                  Send Us a Message
                </h2>
                <p className="mt-4 text-pretty text-lg leading-relaxed text-stone-700">
                  Fill out the form below and our team will get back to you within 24 hours. For urgent matters, please call us directly.
                </p>
              </Reveal>

              {submitted ? (
                <Reveal>
                  <div className="rounded-3xl border border-brand-primary/20 bg-brand-primary/10 p-8 text-center sm:p-12">
                    <CheckCircle className="mx-auto mb-5 h-12 w-12 text-brand-primary" />
                    <h3 className="mb-3 font-display text-2xl font-semibold tracking-tight text-stone-900">Message Sent Successfully!</h3>
                    <p className="mb-6 text-base text-stone-700">
                      Thank you for contacting us. We've received your message and will respond within 24 hours.
                    </p>
                    <Button
                      onClick={() => setSubmitted(false)}
                      className={`h-12 rounded-full bg-brand-primary/90 px-8 text-base font-semibold text-white shadow-sm hover:bg-brand-primary/90 ${btnPress}`}
                    >
                      Send Another Message
                    </Button>
                  </div>
                </Reveal>
              ) : (
                <Reveal>
                  <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
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
                          className="h-11 w-full rounded-lg border border-stone-300 px-3 text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500 sm:h-12"
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
                        className={`h-12 w-full rounded-full bg-amber-600 text-base font-semibold text-white shadow-lg shadow-amber-700/25 hover:bg-amber-700 hover:shadow-xl hover:shadow-amber-700/30 disabled:opacity-60 sm:h-14 sm:text-lg ${btnPress}`}
                      >
                        <Send className="mr-2 h-5 w-5" />
                        {submitting ? "Sending..." : "Send Message"}
                      </Button>

                      <p className="text-center text-xs text-stone-600 sm:text-sm">
                        By submitting this form, you agree to our{" "}
                        <Link href="/privacy" className="font-medium text-amber-700 underline-offset-2 hover:underline">
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
              {/* Support options as a divided list rather than a stack of
                  matching icon-chip cards: a thin amber-led glyph, a hairline
                  between rows, no repeated gradient chips. */}
              <Reveal>
                <h3 className="mb-6 font-display text-2xl font-semibold tracking-tight text-stone-900">Other Ways to Get Help</h3>
                <Stagger className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white" gap={0.06}>
                  {supportOptions.map((option, index) => (
                    <StaggerItem key={index}>
                      <div className="flex items-start gap-4 p-6">
                        <option.icon className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
                        <div className="min-w-0 flex-1">
                          <h4 className="mb-1.5 text-lg font-semibold text-stone-900">{option.title}</h4>
                          <p className="mb-3 text-sm text-stone-600">{option.description}</p>
                          <Link href={option.link} className="group inline-flex items-center gap-2 text-sm font-medium text-amber-700 transition-colors duration-150 hover:text-amber-800">
                            {option.linkText}
                            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                          </Link>
                        </div>
                      </div>
                    </StaggerItem>
                  ))}
                </Stagger>
              </Reveal>

              {/* Business hours: a quiet utility panel - no icon chip, just a
                  small leading glyph beside the label. */}
              <Reveal delay={0.05}>
                <div className="rounded-2xl border border-stone-200 bg-white p-7">
                  <h4 className="mb-3 inline-flex items-center gap-2 text-lg font-semibold text-stone-900">
                    <Clock className="h-5 w-5 text-amber-600" />
                    Business Hours
                  </h4>
                  <div className="space-y-1 text-sm text-stone-700 sm:text-base">
                    <p>Monday to Friday: 8:00am to 5:00pm SAST</p>
                    <p>Saturday to Sunday: Closed</p>
                  </div>
                  <p className="mt-5 text-xs text-stone-600 sm:text-sm">
                    For urgent technical issues outside business hours, please email us and we'll respond as soon as possible.
                  </p>
                </div>
              </Reveal>

              {/* The one deliberately emphasised panel: a solid amber-tinted CTA
                  block. Single accent, no gradient icon chip. */}
              <Reveal delay={0.1}>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-7">
                  <Zap className="h-7 w-7 text-amber-600" />
                  <h4 className="mb-2 mt-4 font-display text-xl font-semibold tracking-tight text-stone-900">Ready to Get Started?</h4>
                  <p className="mb-6 text-sm text-stone-700 sm:text-base">
                    Start your 14-day free trial today. No credit card required. Full access to all features.
                  </p>

                  <div className="flex flex-col gap-3">
                    <Link href="/company-signup" className="block">
                      <Button className={`h-12 w-full rounded-full bg-amber-600 text-base font-semibold text-white shadow-lg shadow-amber-700/25 hover:bg-amber-700 ${btnPress}`}>
                        Start Free Trial
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </Button>
                    </Link>
                    <Link href="/pricing" className="block">
                      <Button variant="outline" className={`h-12 w-full rounded-full border-stone-300 bg-white text-base font-semibold text-stone-800 hover:border-stone-400 hover:bg-stone-50 ${btnPress}`}>
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
        <section className="border-t border-stone-200 bg-white py-20 md:py-28">
          <Reveal className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
              Frequently Asked Questions
            </h2>
            <p className="mt-4 text-lg text-stone-700">
              Find quick answers to common questions in our help center.
            </p>
            <p className="mt-3 text-base text-stone-600">
              Visit our <Link href="/blog" className="font-medium text-amber-700 underline-offset-2 hover:underline">blog for detailed guides</Link> on getting started and maximizing your results.
            </p>

            <Link href="/blog" className="mt-8 inline-block w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className={`h-12 w-full rounded-full border-stone-300 bg-white px-8 font-semibold text-stone-800 hover:border-stone-400 hover:bg-stone-50 sm:w-auto ${btnPress}`}
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
