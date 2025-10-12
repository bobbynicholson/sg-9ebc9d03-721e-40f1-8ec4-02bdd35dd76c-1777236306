import Link from "next/link";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Terms of Service - CaterOS",
    "description": "Terms of Service for CaterOS Catering Management Platform. Review our subscription terms, billing policies, cancellation procedures, and user responsibilities.",
    "url": "https://cateros.co.za/terms",
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
          "name": "Terms of Service",
          "item": "https://cateros.co.za/terms"
        }
      ]
    }
  };

  return (
    <>
      <Head>
        <title>Terms of Service - CaterOS Catering Management Platform</title>
        <meta name="description" content="Terms of Service for CaterOS. Review our subscription terms, billing policies, cancellation procedures, and user responsibilities for our catering management platform." />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://cateros.co.za/terms" />
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
              <CardTitle className="text-3xl">Terms of Service</CardTitle>
              <p className="text-slate-600">Last updated: {new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</p>
            </CardHeader>
            <CardContent className="prose prose-slate max-w-none space-y-6">
              <section>
                <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
                <p className="text-slate-700 leading-relaxed">
                  By accessing and using the Catering Management Platform (the "Service"), you accept and agree to be bound by the terms and provisions of this agreement. If you do not agree to these terms, please do not use the Service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
                <p className="text-slate-700 leading-relaxed mb-3">
                  The Catering Management Platform provides a comprehensive software solution for catering businesses, including but not limited to:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li>Lead and quote management</li>
                  <li>Order processing and calendar booking</li>
                  <li>Inventory and equipment tracking</li>
                  <li>Team coordination and driver management</li>
                  <li>Client portal and communication tools</li>
                  <li>Email automation and after-sales engagement</li>
                  <li>Multi-region support for scaling operations</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">3. Subscription Plans and Billing</h2>
                <h3 className="text-xl font-semibold mt-4 mb-2">3.1 Free Trial</h3>
                <p className="text-slate-700 leading-relaxed">
                  All new subscriptions include a 14-day free trial period. During the trial, you have full access to all features of your chosen plan. No payment is required to start your trial.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">3.2 Billing Cycle</h3>
                <p className="text-slate-700 leading-relaxed">
                  After your free trial ends, your subscription will automatically begin and your payment method will be charged according to your chosen billing cycle (monthly or annual). Subscriptions automatically renew unless cancelled before the renewal date.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">3.3 Payment Processing</h3>
                <p className="text-slate-700 leading-relaxed">
                  All payments are processed securely through PayFast, a PCI-DSS compliant payment gateway. We do not store your credit card information on our servers. By providing your payment information, you authorize us to charge your payment method for all subscription fees.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">3.4 Price Changes</h3>
                <p className="text-slate-700 leading-relaxed">
                  We reserve the right to change our subscription prices with 30 days advance notice. Price changes will not affect your current billing cycle but will apply to subsequent renewals.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">4. Cancellation and Refunds</h2>
                <h3 className="text-xl font-semibold mt-4 mb-2">4.1 Cancellation Policy</h3>
                <p className="text-slate-700 leading-relaxed">
                  You may cancel your subscription at any time. Cancellations can be made through your account settings or by contacting our support team. Upon cancellation, you will continue to have access to the Service until the end of your current paid billing period.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">4.2 Refund Policy</h3>
                <p className="text-slate-700 leading-relaxed">
                  If you cancel within 14 days of your first paid subscription charge (after the trial), we offer a full refund. After this period, we do not provide refunds for partial subscription periods. This is standard practice for SaaS subscriptions.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">4.3 Trial Cancellation</h3>
                <p className="text-slate-700 leading-relaxed">
                  You may cancel your subscription during the free trial at any time without being charged. Simply cancel before the trial end date shown in your account.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">5. User Accounts and Security</h2>
                <h3 className="text-xl font-semibold mt-4 mb-2">5.1 Account Registration</h3>
                <p className="text-slate-700 leading-relaxed">
                  To use the Service, you must create an account with accurate and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">5.2 Account Security</h3>
                <p className="text-slate-700 leading-relaxed">
                  You agree to immediately notify us of any unauthorized use of your account or any other breach of security. We will not be liable for any loss or damage arising from your failure to comply with these security obligations.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">5.3 Account Termination</h3>
                <p className="text-slate-700 leading-relaxed">
                  We reserve the right to suspend or terminate your account if you violate these Terms of Service or engage in fraudulent, abusive, or illegal activities.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">6. Data and Privacy</h2>
                <h3 className="text-xl font-semibold mt-4 mb-2">6.1 Your Data</h3>
                <p className="text-slate-700 leading-relaxed">
                  You retain all rights to the data you input into the Service. We do not claim ownership of your business data, customer information, or content. You grant us a limited license to use your data solely to provide and improve the Service.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">6.2 Data Security</h3>
                <p className="text-slate-700 leading-relaxed">
                  We implement industry-standard security measures to protect your data. However, no internet transmission is completely secure, and we cannot guarantee absolute security.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">6.3 Data Backup and Export</h3>
                <p className="text-slate-700 leading-relaxed">
                  We regularly backup all data. You can export your data at any time through your account settings. Upon account cancellation, we retain your data for 30 days before permanent deletion.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">6.4 Privacy Policy</h3>
                <p className="text-slate-700 leading-relaxed">
                  Our collection and use of personal information is governed by our Privacy Policy. By using the Service, you consent to the practices described in the Privacy Policy.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">7. Acceptable Use</h2>
                <p className="text-slate-700 leading-relaxed mb-3">You agree not to:</p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li>Use the Service for any illegal or unauthorized purpose</li>
                  <li>Violate any laws in your jurisdiction</li>
                  <li>Interfere with or disrupt the Service or servers</li>
                  <li>Attempt to gain unauthorized access to any part of the Service</li>
                  <li>Use the Service to transmit malware, spam, or harmful content</li>
                  <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
                  <li>Resell or redistribute the Service without written permission</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">8. Service Availability</h2>
                <h3 className="text-xl font-semibold mt-4 mb-2">8.1 Uptime</h3>
                <p className="text-slate-700 leading-relaxed">
                  We strive to maintain 99.5% uptime but do not guarantee uninterrupted access. We may perform maintenance that temporarily affects availability, and will provide advance notice when possible.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">8.2 Service Modifications</h3>
                <p className="text-slate-700 leading-relaxed">
                  We reserve the right to modify, suspend, or discontinue any part of the Service with reasonable notice. We will not be liable for any modification, suspension, or discontinuation of the Service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">9. Intellectual Property</h2>
                <p className="text-slate-700 leading-relaxed">
                  The Service, including all software, features, functionality, and content, is owned by us and is protected by copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works without our explicit written permission.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">10. Limitation of Liability</h2>
                <p className="text-slate-700 leading-relaxed">
                  To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities, arising from your use of the Service. Our total liability shall not exceed the amount you paid for the Service in the 12 months preceding the claim.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">11. Indemnification</h2>
                <p className="text-slate-700 leading-relaxed">
                  You agree to indemnify and hold us harmless from any claims, damages, liabilities, and expenses (including legal fees) arising from your use of the Service, your violation of these Terms, or your violation of any rights of another party.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">12. Governing Law</h2>
                <p className="text-slate-700 leading-relaxed">
                  These Terms shall be governed by and construed in accordance with the laws of South Africa. Any disputes arising from these Terms or the Service shall be subject to the exclusive jurisdiction of the courts of South Africa.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">13. Changes to Terms</h2>
                <p className="text-slate-700 leading-relaxed">
                  We reserve the right to modify these Terms at any time. We will notify you of material changes via email or through the Service. Your continued use of the Service after such notification constitutes acceptance of the modified Terms.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">14. Contact Information</h2>
                <p className="text-slate-700 leading-relaxed">
                  If you have any questions about these Terms of Service, please contact us:
                </p>
                <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                  <p className="text-slate-700"><strong>Email:</strong> support@cateringplatform.co.za</p>
                  <p className="text-slate-700"><strong>Phone:</strong> +27 (0)82 123 4567</p>
                  <p className="text-slate-700"><strong>Address:</strong> Cape Town, South Africa</p>
                </div>
              </section>

              <section className="mt-8 pt-6 border-t">
                <p className="text-sm text-slate-600">
                  By using the Catering Management Platform, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
                </p>
              </section>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
