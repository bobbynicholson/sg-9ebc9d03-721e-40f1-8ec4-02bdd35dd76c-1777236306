import Link from "next/link";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Privacy Policy - CaterOS",
    "description": "Privacy Policy for CaterOS Catering Management Platform. Learn how we collect, use, protect, and manage your personal information in compliance with POPIA.",
    "url": "https://cateros.co.za/privacy",
    "inLanguage": "en-ZA",
    "isPartOf": {
      "@type": "WebSite",
      "name": "CaterOS",
      "url": "https://cateros.co.za"
    },
    "publisher": {
      "@type": "Organization",
      "name": "CaterOS",
      "description": "A product of Skylight Digital",
      "url": "https://cateros.co.za",
      "logo": {
        "@type": "ImageObject",
        "url": "https://cateros.co.za/logo.png"
      },
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "17 Swalle Street",
        "addressLocality": "Golden Acre",
        "addressCountry": "ZA"
      },
      "telephone": "+27836525755",
      "contactPoint": {
        "@type": "ContactPoint",
        "telephone": "+27836525755",
        "contactType": "customer service",
        "areaServed": "ZA",
        "availableLanguage": ["en"]
      }
    },
    "datePublished": "2025-10-12",
    "dateModified": new Date().toISOString().split('T')[0],
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://cateros.co.za"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Privacy Policy",
          "item": "https://cateros.co.za/privacy"
        }
      ]
    }
  };

  return (
    <>
      <Head>
        <title>Privacy Policy - CaterOS Catering Management Platform</title>
        <meta name="description" content="Privacy Policy for CaterOS. Learn how we collect, use, protect, and manage your personal information in compliance with POPIA and international data protection laws." />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://cateros.co.za/privacy" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Link href="/pricing">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Pricing
            </Button>
          </Link>

          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="text-3xl">Privacy Policy</CardTitle>
              <p className="text-slate-600">Last updated: {new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</p>
            </CardHeader>
            <CardContent className="prose prose-slate max-w-none space-y-6">
              <section>
                <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
                <p className="text-slate-700 leading-relaxed">
                  Welcome to the Catering Management Platform. We are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your data when you use our Service.
                </p>
                <p className="text-slate-700 leading-relaxed mt-3">
                  By using our Service, you consent to the data practices described in this policy. If you do not agree with our policies and practices, please do not use the Service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
                <h3 className="text-xl font-semibold mt-4 mb-2">2.1 Information You Provide</h3>
                <p className="text-slate-700 leading-relaxed mb-3">We collect information that you voluntarily provide when you:</p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li>Create an account (name, email, company name, phone number)</li>
                  <li>Subscribe to a plan (billing information processed by PayFast)</li>
                  <li>Use the Service (business data, customer information, orders, inventory)</li>
                  <li>Contact our support team (correspondence, feedback)</li>
                  <li>Participate in surveys or promotions</li>
                </ul>

                <h3 className="text-xl font-semibold mt-4 mb-2">2.2 Automatically Collected Information</h3>
                <p className="text-slate-700 leading-relaxed mb-3">When you use the Service, we automatically collect:</p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li>Device information (browser type, operating system, IP address)</li>
                  <li>Usage data (pages visited, features used, time spent)</li>
                  <li>Log data (access times, error logs, performance metrics)</li>
                  <li>Location data (if you enable GPS tracking features for drivers)</li>
                </ul>

                <h3 className="text-xl font-semibold mt-4 mb-2">2.3 Cookies and Tracking Technologies</h3>
                <p className="text-slate-700 leading-relaxed">
                  We use cookies and similar tracking technologies to enhance your experience, analyze usage patterns, and improve the Service. You can control cookie settings through your browser preferences.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
                <p className="text-slate-700 leading-relaxed mb-3">We use the collected information for the following purposes:</p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li><strong>Service Delivery:</strong> To provide, operate, and maintain the Service</li>
                  <li><strong>Account Management:</strong> To manage your account and subscription</li>
                  <li><strong>Communication:</strong> To send you notifications, updates, and support messages</li>
                  <li><strong>Payment Processing:</strong> To process subscription payments through PayFast</li>
                  <li><strong>Improvement:</strong> To analyze usage and improve features and functionality</li>
                  <li><strong>Security:</strong> To detect, prevent, and address technical issues and fraud</li>
                  <li><strong>Legal Compliance:</strong> To comply with legal obligations and enforce our Terms</li>
                  <li><strong>Marketing:</strong> To send promotional content (you can opt-out anytime)</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">4. How We Share Your Information</h2>
                <p className="text-slate-700 leading-relaxed mb-3">We do not sell your personal information. We may share your information in the following circumstances:</p>

                <h3 className="text-xl font-semibold mt-4 mb-2">4.1 Service Providers</h3>
                <p className="text-slate-700 leading-relaxed">
                  We work with third-party service providers who perform services on our behalf, including:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700 mt-2">
                  <li><strong>PayFast:</strong> Payment processing and subscription management</li>
                  <li><strong>Email Services:</strong> Transactional and marketing email delivery</li>
                  <li><strong>Hosting Providers:</strong> Cloud infrastructure and data storage</li>
                  <li><strong>Analytics:</strong> Usage analytics and performance monitoring</li>
                </ul>

                <h3 className="text-xl font-semibold mt-4 mb-2">4.2 Legal Requirements</h3>
                <p className="text-slate-700 leading-relaxed">
                  We may disclose your information if required by law, court order, or to protect our rights, property, or safety, or that of our users or the public.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">4.3 Business Transfers</h3>
                <p className="text-slate-700 leading-relaxed">
                  If we are involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will notify you of any such change.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">4.4 With Your Consent</h3>
                <p className="text-slate-700 leading-relaxed">
                  We may share your information with third parties when you give us explicit consent to do so.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">5. Data Security</h2>
                <p className="text-slate-700 leading-relaxed mb-3">We implement industry-standard security measures to protect your information, including:</p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li>Encryption of data in transit (HTTPS/TLS)</li>
                  <li>Encryption of sensitive data at rest</li>
                  <li>Regular security audits and vulnerability assessments</li>
                  <li>Access controls and authentication requirements</li>
                  <li>Regular backups and disaster recovery procedures</li>
                </ul>
                <p className="text-slate-700 leading-relaxed mt-3">
                  However, no internet transmission or electronic storage is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">6. Data Retention</h2>
                <p className="text-slate-700 leading-relaxed">
                  We retain your personal information for as long as necessary to provide the Service and fulfill the purposes outlined in this Privacy Policy. When you cancel your account, we retain your data for 30 days to allow for account recovery. After this period, we permanently delete your data, except where required by law to retain it longer.
                </p>
                <p className="text-slate-700 leading-relaxed mt-3">
                  You can request deletion of your data at any time by contacting our support team. We will process your request within 30 days, subject to legal obligations.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">7. Your Privacy Rights</h2>
                <p className="text-slate-700 leading-relaxed mb-3">Depending on your location, you may have the following rights:</p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li><strong>Access:</strong> Request a copy of your personal information</li>
                  <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data</li>
                  <li><strong>Deletion:</strong> Request deletion of your personal information</li>
                  <li><strong>Restriction:</strong> Request restriction of processing of your data</li>
                  <li><strong>Portability:</strong> Request transfer of your data to another service</li>
                  <li><strong>Objection:</strong> Object to processing of your data for marketing purposes</li>
                  <li><strong>Withdrawal:</strong> Withdraw consent where processing is based on consent</li>
                </ul>
                <p className="text-slate-700 leading-relaxed mt-3">
                  To exercise any of these rights, please contact us at privacy@cateringplatform.co.za. We will respond to your request within 30 days.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">8. Children's Privacy</h2>
                <p className="text-slate-700 leading-relaxed">
                  The Service is not intended for children under 18 years of age. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately, and we will delete such information.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">9. International Data Transfers</h2>
                <p className="text-slate-700 leading-relaxed">
                  Your information may be transferred to and processed in countries other than South Africa. These countries may have different data protection laws. By using the Service, you consent to such transfers. We ensure appropriate safeguards are in place to protect your information in accordance with this Privacy Policy.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">10. Third-Party Links</h2>
                <p className="text-slate-700 leading-relaxed">
                  The Service may contain links to third-party websites or services. We are not responsible for the privacy practices of these third parties. We encourage you to review their privacy policies before providing any information.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">11. Marketing Communications</h2>
                <p className="text-slate-700 leading-relaxed">
                  We may send you marketing emails about new features, promotions, and updates. You can opt out of marketing communications at any time by clicking the unsubscribe link in our emails or by adjusting your account settings. Note that you cannot opt out of transactional emails related to your account or subscription.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">12. POPIA Compliance (South Africa)</h2>
                <p className="text-slate-700 leading-relaxed">
                  We comply with the Protection of Personal Information Act (POPIA) of South Africa. We process your information lawfully, transparently, and for specific purposes. You have the right to file a complaint with the Information Regulator if you believe we have violated your privacy rights.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">13. Changes to This Privacy Policy</h2>
                <p className="text-slate-700 leading-relaxed">
                  We may update this Privacy Policy from time to time. We will notify you of material changes by email or through a prominent notice on the Service. The "Last updated" date at the top of this policy indicates when it was last revised. Your continued use of the Service after such notification constitutes acceptance of the updated Privacy Policy.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">14. Contact Us</h2>
                <p className="text-slate-700 leading-relaxed mb-4">
                  If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
                </p>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-slate-700"><strong>Email:</strong> privacy@cateringplatform.co.za</p>
                  <p className="text-slate-700"><strong>Support:</strong> support@cateringplatform.co.za</p>
                  <p className="text-slate-700"><strong>Phone:</strong> +27 (0)82 123 4567</p>
                  <p className="text-slate-700"><strong>Address:</strong> Cape Town, South Africa</p>
                </div>
              </section>

              <section className="mt-8 pt-6 border-t">
                <p className="text-sm text-slate-600">
                  By using the Catering Management Platform, you acknowledge that you have read, understood, and agree to this Privacy Policy.
                </p>
              </section>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
