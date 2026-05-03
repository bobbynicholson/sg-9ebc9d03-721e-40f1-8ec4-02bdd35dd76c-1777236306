import { useState } from "react";
import Link from "next/link";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  // Honeypot field -- bots fill every input; humans never see it
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
      gradient: "from-purple-500 to-pink-500"
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
        <title>Contact Us - CateringMS Catering Management Software</title>
        <meta name="description" content="Get in touch with CateringMS support team. Email, phone, or visit us. We're here to help you succeed with your catering business. Response within 24 hours guaranteed." />
        <meta name="keywords" content="contact cateringms, catering software support, get help, customer service" />
        <link rel="canonical" href="https://cateringms.com/contact" />
        
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </Head>

      <Header />

      <div className="min-h-screen bg-white">
        <div className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-white to-pink-50">
          <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))] bg-[size:40px_40px]" />
          
          <div className="relative container mx-auto px-4 py-12 sm:py-16 md:py-24 max-w-7xl">
            <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
              <Badge className="mb-4 sm:mb-6 px-4 py-2 bg-purple-100 text-purple-700 border-purple-200 text-sm shadow-sm">
                <MessageSquare className="w-4 h-4 mr-2 inline" />
                We're Here to Help
              </Badge>
              <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 bg-clip-text text-transparent leading-tight">
                Get in Touch with Our Team
              </h1>
              <p className="text-lg sm:text-xl text-slate-700 mb-3 sm:mb-4 leading-relaxed">
                Have questions about our platform? Need help getting started? Our dedicated support team is ready to assist you.
              </p>
              <p className="text-sm sm:text-base text-slate-600">
                Learn more from our <Link href="/blog" className="text-purple-600 hover:text-purple-700 underline">comprehensive guides</Link> or explore <Link href="/features" className="text-purple-600 hover:text-purple-700 underline">platform features</Link>.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-12 sm:mb-16">
              {contactMethods.map((method, index) => (
                <a
                  key={index}
                  href={method.href}
                  target={method.href.startsWith("http") ? "_blank" : undefined}
                  rel={method.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="block group"
                >
                  <Card className="border-0 shadow-lg hover:shadow-2xl transition-all duration-300 group-hover:scale-105 overflow-hidden h-full">
                    <CardContent className="pt-6 sm:pt-8 pb-6 sm:pb-8">
                      <div className={`inline-flex p-3 sm:p-4 bg-gradient-to-br ${method.gradient} rounded-2xl shadow-lg mb-3 sm:mb-4 group-hover:scale-110 transition-transform`}>
                        <method.icon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">{method.title}</h3>
                      <p className="text-base sm:text-lg font-semibold text-purple-600 mb-2 break-words">{method.value}</p>
                      <p className="text-xs sm:text-sm text-slate-600">{method.description}</p>
                      <div className="mt-3 sm:mt-4 flex items-center gap-2 text-purple-600 font-medium text-sm">
                        <span>Contact Now</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-12 sm:py-16 max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12">
            <div>
              <div className="mb-6 sm:mb-8">
                <Badge className="mb-3 sm:mb-4 px-4 py-2 bg-green-100 text-green-700 border-green-200 text-sm">
                  <Clock className="w-4 h-4 mr-2 inline" />
                  24-Hour Response Time
                </Badge>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-3 sm:mb-4">
                  Send Us a Message
                </h2>
                <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
                  Fill out the form below and our team will get back to you within 24 hours. For urgent matters, please call us directly.
                </p>
              </div>

              {submitted ? (
                <Card className="border-2 border-green-500 bg-green-50">
                  <CardContent className="pt-8 sm:pt-12 pb-8 sm:pb-12 text-center">
                    <div className="inline-flex p-3 sm:p-4 bg-green-500 rounded-full mb-4 sm:mb-6">
                      <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 sm:mb-3">Message Sent Successfully!</h3>
                    <p className="text-sm sm:text-base text-slate-700 mb-4 sm:mb-6">
                      Thank you for contacting us. We've received your message and will respond within 24 hours.
                    </p>
                    <Button 
                      onClick={() => setSubmitted(false)} 
                      className="w-full sm:w-auto bg-green-600 hover:bg-green-700 h-11 sm:h-12 px-6 sm:px-8 text-sm sm:text-base"
                    >
                      Send Another Message
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                  <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-sm sm:text-base">Full Name *</Label>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="John Smith"
                        required
                        className="h-11 sm:h-12 text-base"
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
                        className="h-11 sm:h-12 text-base"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-sm sm:text-base">Phone Number</Label>
                      <Input
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="082 123 4567"
                        className="h-11 sm:h-12 text-base"
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
                        className="h-11 sm:h-12 text-base"
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
                      className="w-full h-11 sm:h-12 px-3 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
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

                  {/* Honeypot -- hidden from real users, bots fill it. */}
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
                    <p className="text-sm text-rose-600 text-center" role="alert">
                      {submitError}
                    </p>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    disabled={submitting}
                    className="w-full h-12 sm:h-14 text-base sm:text-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    <Send className="w-5 h-5 mr-2" />
                    {submitting ? "Sending..." : "Send Message"}
                  </Button>

                  <p className="text-xs sm:text-sm text-slate-500 text-center">
                    By submitting this form, you agree to our{" "}
                    <Link href="/privacy" className="text-purple-600 hover:text-purple-700 underline">
                      Privacy Policy
                    </Link>
                  </p>
                </form>
              )}
            </div>

            <div className="space-y-6 sm:space-y-8">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6">Other Ways to Get Help</h3>
                <div className="space-y-3 sm:space-y-4">
                  {supportOptions.map((option, index) => (
                    <Card key={index} className="border-2 border-slate-200 hover:border-purple-300 hover:shadow-lg transition-all group">
                      <CardContent className="pt-4 sm:pt-6 pb-4 sm:pb-6">
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="p-2.5 sm:p-3 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0">
                            <option.icon className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-base sm:text-lg font-bold text-slate-900 mb-1 sm:mb-2">{option.title}</h4>
                            <p className="text-sm sm:text-base text-slate-600 mb-2 sm:mb-3">{option.description}</p>
                            <Link href={option.link} className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 font-medium text-sm">
                              {option.linkText}
                              <ArrowRight className="w-4 h-4" />
                            </Link>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <Card className="border-0 bg-gradient-to-br from-purple-50 to-pink-50">
                <CardContent className="pt-6 sm:pt-8 pb-6 sm:pb-8">
                  <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
                    <div className="p-2.5 sm:p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex-shrink-0">
                      <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="text-base sm:text-lg font-bold text-slate-900 mb-2">Business Hours</h4>
                      <div className="space-y-1 text-sm sm:text-base text-slate-700">
                        <p>Monday to Friday: 8:00am to 5:00pm SAST</p>
                        <p>Saturday to Sunday: Closed</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600">
                    For urgent technical issues outside business hours, please email us and we'll respond as soon as possible.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 bg-gradient-to-br from-blue-50 to-cyan-50">
                <CardContent className="pt-6 sm:pt-8 pb-6 sm:pb-8">
                  <Zap className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600 mb-3 sm:mb-4" />
                  <h4 className="text-lg sm:text-xl font-bold text-slate-900 mb-2 sm:mb-3">Ready to Get Started?</h4>
                  <p className="text-sm sm:text-base text-slate-700 mb-4 sm:mb-6">
                    Start your 14-day free trial today. No credit card required. Full access to all features.
                  </p>
                  
                  <div className="flex flex-col gap-3">
                    <Link href="/company-signup" className="block">
                      <Button className="w-full h-11 sm:h-12 bg-gradient-to-r from-purple-600 to-pink-600 text-sm sm:text-base hover:opacity-90 transition-opacity">
                        Start Free Trial
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                    <Link href="/pricing" className="block">
                      <Button variant="outline" className="w-full h-11 sm:h-12 border-2 border-purple-300 text-sm sm:text-base hover:bg-purple-50 transition-colors">
                        View Pricing Plans
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 py-12 sm:py-16">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4 sm:mb-6">Frequently Asked Questions</h2>
            <p className="text-base sm:text-lg text-slate-600 mb-3 sm:mb-4">
              Find quick answers to common questions in our help center
            </p>
            <p className="text-sm sm:text-base text-slate-500 mb-6 sm:mb-8">
              Visit our <Link href="/blog" className="text-purple-600 hover:text-purple-700 underline">blog for detailed guides</Link> on getting started and maximizing your results.
            </p>
            
            <Link href="/blog" className="inline-block w-full sm:w-auto">
              <Button 
                size="lg" 
                variant="outline" 
                className="w-full sm:w-auto border-2 border-purple-300 hover:bg-purple-50 h-11 sm:h-12 px-6 sm:px-8 text-sm sm:text-base transition-colors"
              >
                <Book className="w-5 h-5 mr-2" />
                Visit Help Center
              </Button>
            </Link>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
