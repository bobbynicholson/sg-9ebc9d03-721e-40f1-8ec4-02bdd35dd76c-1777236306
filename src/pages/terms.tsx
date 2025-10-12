import Link from "next/link";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Terms of Service - CateringMS",
    "description": "Terms of Service for CateringMS Catering Management Platform. Review our subscription terms, billing policies, cancellation procedures, and user responsibilities.",
    "url": "https://cateringms.com/terms",
    "inLanguage": "en-ZA",
    "isPartOf": {
      "@type": "WebSite",
      "name": "CateringMS",
      "url": "https://cateringms.com"
    },
    "publisher": {
      "@type": "Organization",
      "name": "CateringMS",
      "description": "A product of Skylight Digital",
      "url": "https://cateringms.com",
      "logo": {
        "@type": "ImageObject",
        "url": "https://cateringms.com/logo.png"
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
          "item": "https://cateringms.com"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Terms of Service",
          "item": "https://cateringms.com/terms"
        }
      ]
    }
  };

  return (
    <>
      <Head>
        <title>Terms of Service - CateringMS Catering Management Platform</title>
        <meta name="description" content="Terms of Service for CateringMS. Review our subscription terms, billing policies, cancellation procedures, and user responsibilities for our catering management platform." />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://cateringms.com/terms" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Link href="/">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>

          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="text-3xl">Terms of Service</CardTitle>
              <p className="text-slate-600">Last updated: {new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</p>
              <p className="text-sm text-slate-600 mt-2">
                For more information about our platform, visit our <Link href="/features" className="text-purple-600 hover:text-purple-700 underline">features page</Link> or read <Link href="/blog" className="text-purple-600 hover:text-purple-700 underline">success stories on our blog</Link>.
              </p>
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
                  The Catering Management Platform provides a comprehensive software solution for catering businesses. Learn more about <Link href="/features" className="text-purple-600 hover:text-purple-700 underline">all our features</Link>, including but not limited to:
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
                  All new subscriptions include a 14-day free trial period. During the trial, you have full access to all features of your chosen plan. No payment is required to start your trial. View our <Link href="/pricing" className="text-purple-600 hover:text-purple-700 underline">pricing plans</Link> to get started.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">3.2 Billing Cycle</h3>
                <p className="text-slate-700 leading-relaxed">
                  After your free trial ends, your subscription will automatically begin and your payment method will be charged according to your chosen billing cycle (monthly or annual). Subscriptions automatically renew unless cancelled before the renewal date.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">3.3 Payment Processing</h3>
                <p className="text-slate-700 leading-relaxed">
                  All payments are processed securely through PayFast, a PCI-DSS compliant payment gateway. We do not store your credit card information on our servers. By providing your payment information, you authorize us to charge your payment method for all subscription fees.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">3.4 Price Changes and Currency Policy</h3>
                <div className="space-y-4">
                  <p className="text-slate-700 leading-relaxed">
                    <strong>General Price Changes:</strong> We reserve the right to change our subscription prices with 30 days advance notice. Price changes will not affect your current billing cycle but will apply to subsequent renewals.
                  </p>
                  
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-slate-900 font-semibold mb-2">USD-Pegged Pricing Policy</p>
                    <p className="text-slate-700 leading-relaxed mb-3">
                      All CateringMS subscription pricing is displayed in South African Rand (ZAR) but is fundamentally pegged to United States Dollar (USD) exchange rates. This policy protects both our business and our customers from extreme currency volatility.
                    </p>
                    
                    <p className="text-slate-700 leading-relaxed mb-3">
                      <strong>Currency Adjustment Threshold:</strong> In the event that the ZAR/USD exchange rate fluctuates by more than 15% over a rolling 90-day period compared to our established baseline rate, CateringMS reserves the right to adjust ZAR pricing to maintain USD equivalency.
                    </p>
                    
                    <p className="text-slate-700 leading-relaxed mb-3">
                      <strong>Notice Period:</strong> Any pricing adjustments made under this currency policy will be communicated to all active subscribers at least 30 days in advance of implementation. The notice will include:
                    </p>
                    <ul className="list-disc pl-6 space-y-1 text-slate-700 mb-3">
                      <li>The current ZAR pricing</li>
                      <li>The new ZAR pricing</li>
                      <li>The effective date of the change</li>
                      <li>Explanation of the exchange rate movement that triggered the adjustment</li>
                    </ul>
                    
                    <p className="text-slate-700 leading-relaxed mb-3">
                      <strong>Customer Rights:</strong> If you do not wish to continue your subscription at the adjusted rate, you may cancel your subscription before the effective date of the price change without penalty. You will retain access to the Service until the end of your current paid billing period.
                    </p>
                    
                    <p className="text-slate-700 leading-relaxed">
                      <strong>Multi-Currency Display:</strong> While pricing is shown in USD, GBP, and EUR for reference purposes on our website, all payments are processed exclusively in ZAR. The displayed USD, GBP, and EUR amounts are approximations only and do not constitute binding prices in those currencies.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">4. Subscription Management and Automation</h2>
                
                <h3 className="text-xl font-semibold mt-4 mb-2">4.1 Automated Subscription Processes</h3>
                <p className="text-slate-700 leading-relaxed mb-3">
                  Our billing system is fully automated to ensure seamless service continuity:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li><strong>Automatic Renewal:</strong> Your subscription automatically renews on your billing date unless you cancel beforehand</li>
                  <li><strong>Payment Processing:</strong> Charges are automatically processed through your saved payment method</li>
                  <li><strong>Email Notifications:</strong> You will receive automated emails for all billing events (successful payments, failed payments, upcoming renewals)</li>
                  <li><strong>Usage Tracking:</strong> Your account automatically tracks active clients and quarterly orders against your plan limits</li>
                  <li><strong>Limit Notifications:</strong> You will receive automated alerts when approaching 80% and 90% of your plan limits</li>
                </ul>

                <h3 className="text-xl font-semibold mt-4 mb-2">4.2 Subscription Dashboard</h3>
                <p className="text-slate-700 leading-relaxed mb-3">
                  You have complete control over your subscription through your dedicated Subscription Dashboard, accessible at any time through your account settings. The dashboard provides:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li><strong>Current Plan Details:</strong> View your active plan, pricing, and billing cycle</li>
                  <li><strong>Usage Metrics:</strong> Real-time tracking of your active clients and quarterly orders</li>
                  <li><strong>Billing History:</strong> Complete history of all payments with downloadable invoices</li>
                  <li><strong>Next Billing Date:</strong> Clear visibility of when your next payment will be processed</li>
                  <li><strong>Plan Management:</strong> Upgrade, downgrade, or modify your subscription at any time</li>
                  <li><strong>Cancellation Options:</strong> Self-service cancellation with immediate or end-of-period options</li>
                  <li><strong>Account Deletion:</strong> Request complete account deletion with 30-day grace period</li>
                </ul>

                <h3 className="text-xl font-semibold mt-4 mb-2">4.3 Usage-Based Billing Triggers</h3>
                <p className="text-slate-700 leading-relaxed mb-3">
                  Your subscription plan is based on <strong>whichever limit is reached first</strong>:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li><strong>Active Clients:</strong> The number of unique clients with orders in the current quarter</li>
                  <li><strong>Orders per Quarter:</strong> Total orders processed in the current calendar quarter</li>
                </ul>
                <p className="text-slate-700 leading-relaxed mt-3">
                  When you approach or exceed your plan limits, you will receive automated notifications recommending an upgrade to ensure uninterrupted service. Exceeding limits does not result in service termination but may require a plan upgrade for continued optimal performance.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">4.4 Payment Failure Protocol</h3>
                <p className="text-slate-700 leading-relaxed mb-3">
                  If a payment fails, the following automated process occurs:
                </p>
                <ol className="list-decimal pl-6 space-y-2 text-slate-700">
                  <li>Immediate email notification of payment failure with reason (if provided by payment processor)</li>
                  <li>Your account enters a "Past Due" status with full access maintained</li>
                  <li>Automatic retry after 3 days</li>
                  <li>If second attempt fails, another retry after 7 days with second notification</li>
                  <li>If third attempt fails, account moves to "Suspended" status after 14 days with limited access</li>
                  <li>Final notification sent with 7-day grace period to update payment method</li>
                  <li>After 21 days of failed payment, account is automatically cancelled</li>
                  <li>All data is preserved for 30 days post-cancellation for potential reactivation</li>
                </ol>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">5. Cancellation Rights and Procedures</h2>
                
                <h3 className="text-xl font-semibold mt-4 mb-2">5.1 How to Cancel Your Subscription</h3>
                <p className="text-slate-700 leading-relaxed mb-3">
                  You may cancel your subscription at any time through:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li><strong>Self-Service:</strong> Navigate to Settings → Subscription → Cancel Subscription in your dashboard</li>
                  <li><strong>Email Request:</strong> Contact support@cateringms.com with "Cancel Subscription" in the subject line</li>
                  <li><strong>Phone Request:</strong> Call 083 652 5755 during business hours</li>
                </ul>

                <h3 className="text-xl font-semibold mt-4 mb-2">5.2 Cancellation Options</h3>
                <p className="text-slate-700 leading-relaxed mb-3">
                  When cancelling, you can choose:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li><strong>End of Billing Period:</strong> Maintain full access until your current paid period ends (recommended)</li>
                  <li><strong>Immediate Cancellation:</strong> Lose access immediately but no refund for unused time</li>
                </ul>

                <h3 className="text-xl font-semibold mt-4 mb-2">5.3 Post-Cancellation Access</h3>
                <p className="text-slate-700 leading-relaxed">
                  After cancellation, you retain full access to all features until the end of your current billing period. Your data is preserved for 30 days after your subscription ends, allowing you to reactivate without data loss. After 30 days, all data is permanently deleted unless you specifically request an extension.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">5.4 Reactivation</h3>
                <p className="text-slate-700 leading-relaxed">
                  You may reactivate your subscription at any time during the 30-day data retention period. Reactivation is instant and restores full access to all your preserved data. Simply log in and select "Reactivate Subscription" from your dashboard, or contact support for assistance.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">5.5 Refund Policy</h3>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li><strong>Trial Period:</strong> No charges during the 14-day free trial. Cancel anytime without payment.</li>
                  <li><strong>First Payment:</strong> Full refund available if cancelled within 14 days of first paid charge (after trial ends)</li>
                  <li><strong>Subsequent Periods:</strong> No refunds for partial billing periods. Standard industry practice for SaaS subscriptions.</li>
                  <li><strong>Annual Subscriptions:</strong> Pro-rated refunds may be considered on a case-by-case basis for extenuating circumstances</li>
                  <li><strong>Downgrade Timing:</strong> Downgrades take effect at the next billing cycle to ensure no service interruption</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">6. Account Deletion and Data Rights</h2>
                
                <h3 className="text-xl font-semibold mt-4 mb-2">6.1 Account Deletion Request</h3>
                <p className="text-slate-700 leading-relaxed mb-3">
                  You have the right to request permanent deletion of your account and all associated data at any time. To request account deletion:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li>Navigate to Settings → Subscription → Delete Account</li>
                  <li>Select whether you want to export your data first (recommended)</li>
                  <li>Provide optional feedback to help us improve</li>
                  <li>Confirm your deletion request</li>
                </ul>

                <h3 className="text-xl font-semibold mt-4 mb-2">6.2 Deletion Grace Period</h3>
                <p className="text-slate-700 leading-relaxed">
                  <strong>30-Day Grace Period:</strong> All account deletions are scheduled 30 days from the request date. This gives you time to change your mind. During this period:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700 mt-2">
                  <li>Your subscription is immediately cancelled (no further charges)</li>
                  <li>You retain read-only access to your data</li>
                  <li>You can cancel the deletion request at any time</li>
                  <li>You will receive email reminders at 7 days and 1 day before permanent deletion</li>
                </ul>

                <h3 className="text-xl font-semibold mt-4 mb-2">6.3 Data Export (GDPR/POPIA Compliance)</h3>
                <p className="text-slate-700 leading-relaxed">
                  In compliance with GDPR and POPIA regulations, you have the right to export all your data at any time. You can request a data export:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li>Through your dashboard (Settings → Data Export)</li>
                  <li>When requesting account deletion (checkbox option)</li>
                  <li>By emailing data@cateringms.com</li>
                </ul>
                <p className="text-slate-700 leading-relaxed mt-2">
                  Data exports are provided in standard formats (CSV, JSON) and are typically delivered within 24-48 hours. Exported data includes all clients, orders, quotes, inventory records, and user-generated content.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">6.4 What Gets Deleted</h3>
                <p className="text-slate-700 leading-relaxed mb-3">
                  Upon permanent deletion (after 30-day grace period), we delete:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li>All client and customer data</li>
                  <li>All orders, quotes, and invoices</li>
                  <li>All inventory and equipment records</li>
                  <li>All user accounts and profile information</li>
                  <li>All uploaded files and documents</li>
                  <li>All settings and configurations</li>
                </ul>
                <p className="text-slate-700 leading-relaxed mt-3">
                  <strong>What We Retain:</strong> We retain anonymized usage statistics and aggregated data for analytics and service improvement. We also retain essential billing records for tax and accounting compliance (legally required for 7 years in South Africa).
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">7. User Accounts and Security</h2>
                <h3 className="text-xl font-semibold mt-4 mb-2">7.1 Account Registration</h3>
                <p className="text-slate-700 leading-relaxed">
                  To use the Service, you must create an account with accurate and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">7.2 Account Security</h3>
                <p className="text-slate-700 leading-relaxed">
                  You agree to immediately notify us of any unauthorized use of your account or any other breach of security. We will not be liable for any loss or damage arising from your failure to comply with these security obligations.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">7.3 Account Termination</h3>
                <p className="text-slate-700 leading-relaxed">
                  We reserve the right to suspend or terminate your account if you violate these Terms of Service or engage in fraudulent, abusive, or illegal activities.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">8. Data and Privacy</h2>
                <h3 className="text-xl font-semibold mt-4 mb-2">8.1 Your Data</h3>
                <p className="text-slate-700 leading-relaxed">
                  You retain all rights to the data you input into the Service. We do not claim ownership of your business data, customer information, or content. You grant us a limited license to use your data solely to provide and improve the Service.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">8.2 Data Security</h3>
                <p className="text-slate-700 leading-relaxed">
                  We implement industry-standard security measures to protect your data. However, no internet transmission is completely secure, and we cannot guarantee absolute security.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">8.3 Data Backup and Export</h3>
                <p className="text-slate-700 leading-relaxed">
                  We regularly backup all data. You can export your data at any time through your account settings. Upon account cancellation, we retain your data for 30 days before permanent deletion.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">8.4 Privacy Policy</h3>
                <p className="text-slate-700 leading-relaxed">
                  Our collection and use of personal information is governed by our Privacy Policy. By using the Service, you consent to the practices described in the Privacy Policy.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">9. Acceptable Use</h2>
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
                <h2 className="text-2xl font-semibold mb-4">10. Service Availability</h2>
                <h3 className="text-xl font-semibold mt-4 mb-2">10.1 Uptime</h3>
                <p className="text-slate-700 leading-relaxed">
                  We strive to maintain 99.5% uptime but do not guarantee uninterrupted access. We may perform maintenance that temporarily affects availability, and will provide advance notice when possible.
                </p>

                <h3 className="text-xl font-semibold mt-4 mb-2">10.2 Service Modifications</h3>
                <p className="text-slate-700 leading-relaxed">
                  We reserve the right to modify, suspend, or discontinue any part of the Service with reasonable notice. We will not be liable for any modification, suspension, or discontinuation of the Service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">11. Intellectual Property</h2>
                <p className="text-slate-700 leading-relaxed">
                  The Service, including all software, features, functionality, and content, is owned by us and is protected by copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works without our explicit written permission.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">12. Limitation of Liability</h2>
                <p className="text-slate-700 leading-relaxed">
                  To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities, arising from your use of the Service. Our total liability shall not exceed the amount you paid for the Service in the 12 months preceding the claim.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">13. Indemnification</h2>
                <p className="text-slate-700 leading-relaxed">
                  You agree to indemnify and hold us harmless from any claims, damages, liabilities, and expenses (including legal fees) arising from your use of the Service, your violation of these Terms, or your violation of any rights of another party.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">14. Governing Law</h2>
                <p className="text-slate-700 leading-relaxed">
                  These Terms shall be governed by and construed in accordance with the laws of South Africa. Any disputes arising from these Terms or the Service shall be subject to the exclusive jurisdiction of the courts of South Africa.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">15. Automated Email Communications</h2>
                <p className="text-slate-700 leading-relaxed mb-3">
                  By using our Service, you consent to receive automated transactional and service-related emails, including:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li><strong>Trial Reminders:</strong> Notifications 7, 3, and 1 day before your trial ends</li>
                  <li><strong>Payment Confirmations:</strong> Receipts for successful payments with downloadable invoices</li>
                  <li><strong>Payment Failures:</strong> Immediate alerts when payments fail with resolution steps</li>
                  <li><strong>Renewal Reminders:</strong> Notifications 14, 7, and 3 days before subscription renewal</li>
                  <li><strong>Price Change Notices:</strong> 30-day advance notice of any pricing changes</li>
                  <li><strong>Usage Limit Alerts:</strong> Notifications when approaching plan limits (80%, 90%, 100%)</li>
                  <li><strong>Cancellation Confirmations:</strong> Acknowledgment of cancellation requests with next steps</li>
                  <li><strong>Deletion Reminders:</strong> Countdown emails before permanent account deletion</li>
                  <li><strong>Service Updates:</strong> Important updates about features, maintenance, or policy changes</li>
                </ul>
                <p className="text-slate-700 leading-relaxed mt-3">
                  You cannot opt out of transactional emails as they are essential for account and billing management. You may manage marketing email preferences in your account settings.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">16. Dispute Resolution</h2>
                <p className="text-slate-700 leading-relaxed mb-3">
                  If you have a billing dispute or concern:
                </p>
                <ol className="list-decimal pl-6 space-y-2 text-slate-700">
                  <li>Contact billing@cateringms.com within 30 days of the disputed charge</li>
                  <li>Provide your account details and explanation of the dispute</li>
                  <li>We will investigate and respond within 5 business days</li>
                  <li>If unresolved, we will work with you to find a fair solution</li>
                </ol>
                <p className="text-slate-700 leading-relaxed mt-3">
                  For payment processing disputes, you also have the right to contact your card issuer or PayFast directly.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">17. Changes to Terms</h2>
                <p className="text-slate-700 leading-relaxed">
                  We reserve the right to modify these Terms at any time. We will notify you of material changes via email or through the Service. Your continued use of the Service after such notification constitutes acceptance of the modified Terms.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">18. Contact Information</h2>
                <p className="text-slate-700 leading-relaxed mb-3">
                  If you have any questions about these Terms of Service, please contact us. You can also learn more about our platform on our <Link href="/blog" className="text-purple-600 hover:text-purple-700 underline">blog</Link> or explore <Link href="/features" className="text-purple-600 hover:text-purple-700 underline">detailed features</Link>:
                </p>
                <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                  <p className="text-slate-700"><strong>Company:</strong> CateringMS (A product of Skylight Digital)</p>
                  <p className="text-slate-700"><strong>Address:</strong> 17 Swalle Street, Golden Acre, South Africa</p>
                  <p className="text-slate-700"><strong>Phone:</strong> 083 652 5755</p>
                  <p className="text-slate-700"><strong>Email:</strong> support@cateringms.com</p>
                </div>
              </section>

              <section className="mt-8 pt-6 border-t">
                <p className="text-sm text-slate-600">
                  By using the Catering Management Platform, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service, including all subscription management, billing, cancellation, and data deletion policies. For additional information, visit our <Link href="/" className="text-purple-600 hover:text-purple-700 underline">homepage</Link> or review our <Link href="/privacy" className="text-purple-600 hover:text-purple-700 underline">Privacy Policy</Link>.
                </p>
              </section>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
