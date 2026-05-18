/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import { emailService } from "./emailService";
import { buildTenantHref } from "@/lib/tenantUrl";

// Helper for building absolute URLs that the billing email links use.
// Slug is the catering company's URL slug (e.g. "spit-braai-delivery").
// All admin and subscription URLs in billing emails go to that
// company's slug-prefixed page so the recipient lands on their own
// branded URL space.
function buildBillingUrl(slug: string | null | undefined, path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com";
  return `${base}${buildTenantHref(slug, path)}`;
}

// Pull the company slug for a given profile in a single query so the
// billing email methods don't each have to repeat the join.
async function fetchCompanySlugForUser(userId: string): Promise<string | null> {
  const { data, error: error2 } = await supabase
    .from("profiles")
    .select("companies:company_id ( slug )")
    .eq("id", userId)
    .single();
  if (error2) {
    console.error("[billingEmailService] profiles fetch failed:", error2);
  }
  const company = (data as any)?.companies;
  const slug = Array.isArray(company) ? company?.[0]?.slug : company?.slug;
  return slug ?? null;
}

interface EmailTemplate {
  subject: string;
  body: string;
}

export class BillingEmailService {
  getEmailTemplate(type: string, data: Record<string, any>): EmailTemplate {
    const templates: Record<string, EmailTemplate> = {
      subscription_started: {
        subject: "Welcome to CateringMS! Your Subscription is Active",
        body: `
          <h2>Welcome to CateringMS, ${data.userName}!</h2>
          <p>Thank you for subscribing to our <strong>${data.planName}</strong> plan. Your subscription is now active and ready to use.</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Subscription Details:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Plan:</strong> ${data.planName}</li>
              <li><strong>Amount:</strong> ${data.amount}</li>
              <li><strong>Billing Cycle:</strong> ${data.billingCycle}</li>
              <li><strong>Next Billing Date:</strong> ${data.nextBillingDate}</li>
            </ul>
          </div>
          
          <p>You can manage your subscription anytime from your <a href="${data.subscriptionUrl}">Subscription Settings</a>.</p>
          
          <h3>Getting Started:</h3>
          <ol>
            <li>Complete your profile setup</li>
            <li>Add your first clients</li>
            <li>Create your first quote</li>
            <li>Set up your inventory</li>
          </ol>
          
          <p>Need help? Our support team is here for you at <a href="mailto:support@cateringms.com">support@cateringms.com</a>.</p>
          
          <p>Best regards,<br>The CateringMS Team</p>
        `
      },

      payment_succeeded: {
        subject: `Payment Received - ${data.amount}`,
        body: `
          <h2>Payment Confirmed</h2>
          <p>Hi ${data.userName},</p>
          <p>We have successfully received your payment. Thank you for your continued subscription to CateringMS!</p>
          
          <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #22c55e;">
            <h3>Payment Details:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Amount Paid:</strong> ${data.amount}</li>
              <li><strong>Payment Date:</strong> ${data.paymentDate}</li>
              <li><strong>Transaction ID:</strong> ${data.transactionId}</li>
              <li><strong>Billing Period:</strong> ${data.billingPeriodStart} to ${data.billingPeriodEnd}</li>
            </ul>
          </div>
          
          <p>Your next billing date is <strong>${data.nextBillingDate}</strong>.</p>
          
          <p><a href="${data.invoiceUrl}" style="background: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Download Invoice</a></p>
          
          <p>Questions about this payment? Contact us at <a href="mailto:billing@cateringms.com">billing@cateringms.com</a>.</p>
          
          <p>Best regards,<br>The CateringMS Team</p>
        `
      },

      payment_failed: {
        subject: "⚠️ Payment Failed - Action Required",
        body: `
          <h2>Payment Issue Detected</h2>
          <p>Hi ${data.userName},</p>
          <p>We attempted to process your payment but unfortunately it failed.</p>
          
          <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
            <h3>Payment Details:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Amount:</strong> ${data.amount}</li>
              <li><strong>Attempted Date:</strong> ${data.attemptedDate}</li>
              <li><strong>Reason:</strong> ${data.failureReason}</li>
            </ul>
          </div>
          
          <h3>What Happens Next?</h3>
          <p>We will automatically retry the payment in <strong>3 days</strong>. To avoid any service interruption, please:</p>
          <ol>
            <li>Check that your payment method is valid</li>
            <li>Ensure sufficient funds are available</li>
            <li>Update your payment details if needed</li>
          </ol>
          
          <p><a href="${data.updatePaymentUrl}" style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Update Payment Method</a></p>
          
          <p>If you have questions, please contact us immediately at <a href="mailto:billing@cateringms.com">billing@cateringms.com</a>.</p>
          
          <p>Best regards,<br>The CateringMS Team</p>
        `
      },

      trial_ending_soon: {
        subject: `Your Free Trial Ends in ${data.daysRemaining} Days`,
        body: `
          <h2>Your Trial is Ending Soon</h2>
          <p>Hi ${data.userName},</p>
          <p>Your 14-day free trial of CateringMS will end on <strong>${data.trialEndDate}</strong> (in ${data.daysRemaining} days).</p>
          
          <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>What You've Accomplished:</h3>
            <ul>
              <li>✓ Created ${data.clientsCreated} clients</li>
              <li>✓ Generated ${data.quotesCreated} quotes</li>
              <li>✓ Processed ${data.ordersCreated} orders</li>
            </ul>
          </div>
          
          <h3>Continue Your Success</h3>
          <p>To keep using CateringMS without interruption, please select a plan that fits your needs.</p>
          
          <p><a href="${data.pricingUrl}" style="background: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Choose Your Plan</a></p>
          
          <p>If your trial ends without selecting a plan, your account will be paused but your data will be safely stored for 30 days.</p>
          
          <p>Have questions? We're here to help at <a href="mailto:support@cateringms.com">support@cateringms.com</a>.</p>
          
          <p>Best regards,<br>The CateringMS Team</p>
        `
      },

      subscription_expiring: {
        subject: `Your Subscription Renews in ${data.daysUntilRenewal} Days`,
        body: `
          <h2>Subscription Renewal Reminder</h2>
          <p>Hi ${data.userName},</p>
          <p>This is a friendly reminder that your CateringMS subscription will automatically renew on <strong>${data.renewalDate}</strong>.</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Renewal Details:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Plan:</strong> ${data.planName}</li>
              <li><strong>Amount:</strong> ${data.amount}</li>
              <li><strong>Renewal Date:</strong> ${data.renewalDate}</li>
              <li><strong>Payment Method:</strong> ${data.paymentMethod}</li>
            </ul>
          </div>
          
          <p>No action is required unless you want to make changes to your subscription.</p>
          
          <p><a href="${data.subscriptionUrl}" style="background: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Manage Subscription</a></p>
          
          <p>Questions? Contact us at <a href="mailto:billing@cateringms.com">billing@cateringms.com</a>.</p>
          
          <p>Best regards,<br>The CateringMS Team</p>
        `
      },

      price_change_notification: {
        subject: "Important: Upcoming Price Change",
        body: `
          <h2>Price Change Notification</h2>
          <p>Hi ${data.userName},</p>
          <p>We wanted to inform you about an upcoming change to our pricing structure.</p>
          
          <div style="background: #fff7ed; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <h3>What's Changing:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Current Price:</strong> ${data.currentPrice}</li>
              <li><strong>New Price:</strong> ${data.newPrice}</li>
              <li><strong>Effective Date:</strong> ${data.effectiveDate}</li>
              <li><strong>Reason:</strong> ${data.changeReason}</li>
            </ul>
          </div>
          
          <h3>Why This Change?</h3>
          <p>${data.explanation}</p>
          
          <h3>Your Options:</h3>
          <ol>
            <li><strong>Continue:</strong> No action needed. The new price will apply automatically on ${data.effectiveDate}.</li>
            <li><strong>Cancel:</strong> You can cancel your subscription without penalty before ${data.effectiveDate}.</li>
            <li><strong>Downgrade:</strong> Switch to a different plan that better fits your budget.</li>
          </ol>
          
          <p>You have <strong>30 days</strong> to make any changes. We will send you reminders leading up to the effective date.</p>
          
          <p><a href="${data.subscriptionUrl}" style="background: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Review My Options</a></p>
          
          <p>We value your business and are committed to providing the best catering management solution. If you have any questions or concerns, please reach out to us at <a href="mailto:billing@cateringms.com">billing@cateringms.com</a>.</p>
          
          <p>Best regards,<br>The CateringMS Team</p>
        `
      },

      subscription_cancelled: {
        subject: "Subscription Cancellation Confirmed",
        body: `
          <h2>Subscription Cancelled</h2>
          <p>Hi ${data.userName},</p>
          <p>We have processed your cancellation request. We're sorry to see you go!</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Cancellation Details:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Plan:</strong> ${data.planName}</li>
              <li><strong>Cancelled On:</strong> ${data.cancelledDate}</li>
              <li><strong>Access Until:</strong> ${data.accessUntilDate}</li>
            </ul>
          </div>
          
          ${data.cancelType === 'immediate' 
            ? `<p>Your subscription has been cancelled immediately. You no longer have access to CateringMS features.</p>`
            : `<p>You will continue to have access to all CateringMS features until <strong>${data.accessUntilDate}</strong>. After this date, your account will be paused.</p>`
          }
          
          <h3>What Happens to Your Data?</h3>
          <p>Your data will be safely stored for <strong>30 days</strong> after your subscription ends. If you change your mind, you can reactivate your subscription anytime during this period.</p>
          
          <p><a href="${data.reactivateUrl}" style="background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reactivate Subscription</a></p>
          
          <h3>We'd Love Your Feedback</h3>
          <p>Would you mind sharing why you cancelled? Your feedback helps us improve CateringMS for everyone.</p>
          <p><a href="${data.feedbackUrl}">Share Your Feedback</a></p>
          
          <p>If you have any questions, please contact us at <a href="mailto:support@cateringms.com">support@cateringms.com</a>.</p>
          
          <p>We hope to see you again soon!<br>The CateringMS Team</p>
        `
      },

      subscription_reactivated: {
        subject: "Welcome Back! Your Subscription is Reactivated",
        body: `
          <h2>Welcome Back to CateringMS!</h2>
          <p>Hi ${data.userName},</p>
          <p>Great news! Your subscription has been successfully reactivated. We're excited to have you back!</p>
          
          <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #22c55e;">
            <h3>Subscription Details:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Plan:</strong> ${data.planName}</li>
              <li><strong>Amount:</strong> ${data.amount}</li>
              <li><strong>Next Billing Date:</strong> ${data.nextBillingDate}</li>
            </ul>
          </div>
          
          <p>All your data has been preserved and is ready for you to pick up where you left off.</p>
          
          <p><a href="${data.dashboardUrl}" style="background: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Go to Dashboard</a></p>
          
          <p>If you need any assistance getting started again, our support team is here to help at <a href="mailto:support@cateringms.com">support@cateringms.com</a>.</p>
          
          <p>Best regards,<br>The CateringMS Team</p>
        `
      },
      
      staff_invitation: {
        subject: `You're Invited to Join ${data.companyName} on CateringMS`,
        body: `
          <h2>You've Been Invited!</h2>
          <p>Hi ${data.userName},</p>
          <p>You have been invited by <strong>${data.inviterName}</strong> to join <strong>${data.companyName}</strong> on the CateringMS platform as a <strong>${data.role}</strong>.</p>
          
          <p>To accept your invitation and set up your account, please click the link below. This link will expire in 7 days.</p>
          
          <p><a href="${data.joinUrl}" style="background: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Accept Invitation & Join Team</a></p>
          
          <p>If you have any questions, please contact your manager.</p>
          
          <p>Welcome aboard,<br>The CateringMS Team</p>
        `
      },

      account_deletion_scheduled: {
        subject: "Account Deletion Scheduled - 30 Day Grace Period",
        body: `
          <h2>Account Deletion Request Received</h2>
          <p>Hi ${data.userName},</p>
          <p>We have received your request to delete your CateringMS account. Your account is scheduled for permanent deletion on <strong>${data.deletionDate}</strong>.</p>
          
          <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
            <h3>⚠️ Important Information:</h3>
            <ul>
              <li>You have <strong>30 days</strong> to change your mind</li>
              <li>All your data will be permanently deleted</li>
              <li>This action cannot be undone after the deletion date</li>
              <li>Your subscription has been cancelled</li>
            </ul>
          </div>
          
          ${data.exportRequested 
            ? `<p>As requested, we are preparing an export of your data. You will receive a download link within 24-48 hours.</p>`
            : `<p>You did not request a data export. If you would like to export your data before deletion, please contact us at <a href="mailto:support@cateringms.com">support@cateringms.com</a>.</p>`
          }
          
          <h3>Changed Your Mind?</h3>
          <p>You can cancel this deletion request anytime before ${data.deletionDate}.</p>
          
          <p><a href="${data.cancelDeletionUrl}" style="background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Cancel Deletion Request</a></p>
          
          <p>We're sorry to see you go. If there's anything we can do to improve CateringMS, please let us know at <a href="mailto:feedback@cateringms.com">feedback@cateringms.com</a>.</p>
          
          <p>Best regards,<br>The CateringMS Team</p>
        `
      }
    };

    return templates[type] || {
      subject: "CateringMS Notification",
      body: "<p>You have a notification from CateringMS.</p>"
    };
  }

  // Wave 24: optional `client` arg so server-side callers (cron
  // workers, webhook handlers, API routes) can pass a service-role
  // supabase client through. Without it the underlying emailService
  // helper falls back to the imported browser anon client, which has
  // no session on the server, and the email_provider_settings SELECT
  // silently returns nothing - the email never sends.
  async sendBillingEmail(to: string, type: string, data: Record<string, any>, companyId: string, client?: any): Promise<boolean> {
    try {
      const template = this.getEmailTemplate(type, data);

      return await emailService.sendEmail({
        companyId,
        to,
        subject: template.subject,
        body: template.body,
        ...(client ? { _client: client } : {}),
      } as any);
    } catch (error) {
      console.error("Error sending billing email:", error);
      return false;
    }
  }

  async sendStaffInvitationEmail(
    to: string,
    inviterName: string,
    companyName: string,
    joinUrl: string,
    companyId: string
  ): Promise<boolean> {
    return await this.sendBillingEmail(
      to,
      "staff_invitation",
      {
        userName: "there",
        inviterName,
        companyName,
        role: "Team Member",
        joinUrl
      },
      companyId
    );
  }

  async notifySubscriptionStarted(userId: string, subscription: any) {
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("email, full_name, company_id")
      .eq("id", userId)
      .single();
    if (profileErr) {
      console.error("[billingEmailService] profiles fetch failed:", profileErr);
    }

    if (!profile?.email || !profile.company_id) return;

    const slug = await fetchCompanySlugForUser(userId);
    await this.sendBillingEmail(
      profile.email,
      "subscription_started",
      {
        userName: profile.full_name || "there",
        planName: subscription.plan_name,
        amount: `R${subscription.amount}`,
        billingCycle: subscription.billing_cycle === "monthly" ? "Monthly" : "Yearly",
        nextBillingDate: subscription.next_billing_date ? new Date(subscription.next_billing_date).toLocaleDateString() : 'N/A',
        subscriptionUrl: buildBillingUrl(slug, "/admin/subscription")
      },
      profile.company_id
    );
  }

  async notifyPaymentSucceeded(userId: string, payment: any) {
    const { data: profile, error: profileErr2 } = await supabase
      .from("profiles")
      .select("email, full_name, company_id")
      .eq("id", userId)
      .single();
    if (profileErr2) {
      console.error("[billingEmailService] profiles fetch failed:", profileErr2);
    }

    if (!profile?.email || !profile.company_id) return;

    const slug = await fetchCompanySlugForUser(userId);
    await this.sendBillingEmail(
      profile.email,
      "payment_succeeded",
      {
        userName: profile.full_name || "there",
        amount: `R${payment.amount}`,
        paymentDate: new Date(payment.paid_at).toLocaleDateString(),
        transactionId: payment.transaction_id || "N/A",
        billingPeriodStart: new Date(payment.billing_period_start).toLocaleDateString(),
        billingPeriodEnd: new Date(payment.billing_period_end).toLocaleDateString(),
        nextBillingDate: payment.next_billing_date ? new Date(payment.next_billing_date).toLocaleDateString() : 'N/A',
        invoiceUrl: payment.invoice_pdf_url || buildBillingUrl(slug, "/admin/subscription")
      },
      profile.company_id
    );
  }

  async notifyPaymentFailed(userId: string, payment: any) {
    const { data: profile, error: profileErr3 } = await supabase
      .from("profiles")
      .select("email, full_name, company_id")
      .eq("id", userId)
      .single();
    if (profileErr3) {
      console.error("[billingEmailService] profiles fetch failed:", profileErr3);
    }

    if (!profile?.email || !profile.company_id) return;

    const slug = await fetchCompanySlugForUser(userId);
    await this.sendBillingEmail(
      profile.email,
      "payment_failed",
      {
        userName: profile.full_name || "there",
        amount: `R${payment.amount}`,
        attemptedDate: new Date(payment.created_at).toLocaleDateString(),
        failureReason: payment.failed_reason || "Payment method declined",
        updatePaymentUrl: buildBillingUrl(slug, "/admin/subscription")
      },
      profile.company_id
    );
  }

  async notifyTrialEnding(userId: string, daysRemaining: number, trialEndDate: string, stats: any) {
    const { data: profile, error: profileErr4 } = await supabase
      .from("profiles")
      .select("email, full_name, company_id")
      .eq("id", userId)
      .single();
    if (profileErr4) {
      console.error("[billingEmailService] profiles fetch failed:", profileErr4);
    }

    if (!profile?.email || !profile.company_id) return;

    await this.sendBillingEmail(
      profile.email,
      "trial_ending_soon",
      {
        userName: profile.full_name || "there",
        daysRemaining,
        trialEndDate: new Date(trialEndDate).toLocaleDateString(),
        clientsCreated: stats.clients || 0,
        quotesCreated: stats.quotes || 0,
        ordersCreated: stats.orders || 0,
        pricingUrl: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`
      },
      profile.company_id
    );
  }

  async notifySubscriptionExpiring(userId: string, subscription: any, daysUntilRenewal: number) {
    const { data: profile, error: profileErr5 } = await supabase
      .from("profiles")
      .select("email, full_name, company_id")
      .eq("id", userId)
      .single();
    if (profileErr5) {
      console.error("[billingEmailService] profiles fetch failed:", profileErr5);
    }

    if (!profile?.email || !profile.company_id) return;

    const slug = await fetchCompanySlugForUser(userId);
    await this.sendBillingEmail(
      profile.email,
      "subscription_expiring",
      {
        userName: profile.full_name || "there",
        daysUntilRenewal,
        planName: subscription.plan_name,
        amount: `R${subscription.amount}`,
        renewalDate: subscription.next_billing_date ? new Date(subscription.next_billing_date).toLocaleDateString() : 'N/A',
        paymentMethod: subscription.payment_method_last4 ? `Card ending in ${subscription.payment_method_last4}` : "PayFast",
        subscriptionUrl: buildBillingUrl(slug, "/admin/subscription")
      },
      profile.company_id
    );
  }

  async notifyPriceChange(userId: string, priceChange: any) {
    const { data: profile, error: profileErr6 } = await supabase
      .from("profiles")
      .select("email, full_name, company_id")
      .eq("id", userId)
      .single();
    if (profileErr6) {
      console.error("[billingEmailService] profiles fetch failed:", profileErr6);
    }

    if (!profile?.email || !profile.company_id) return;

    const slug = await fetchCompanySlugForUser(userId);
    await this.sendBillingEmail(
      profile.email,
      "price_change_notification",
      {
        userName: profile.full_name || "there",
        currentPrice: `R${priceChange.old_amount}`,
        newPrice: `R${priceChange.new_amount}`,
        effectiveDate: new Date(priceChange.effective_date).toLocaleDateString(),
        changeReason: priceChange.change_reason,
        explanation: priceChange.exchange_rate_info || "To maintain service quality and continue development of new features.",
        subscriptionUrl: buildBillingUrl(slug, "/admin/subscription")
      },
      profile.company_id
    );
  }

  async notifySubscriptionCancelled(userId: string, subscription: any, cancelType: string) {
    const { data: profile, error: profileErr7 } = await supabase
      .from("profiles")
      .select("email, full_name, company_id")
      .eq("id", userId)
      .single();
    if (profileErr7) {
      console.error("[billingEmailService] profiles fetch failed:", profileErr7);
    }

    if (!profile?.email || !profile.company_id) return;

    const slug = await fetchCompanySlugForUser(userId);
    await this.sendBillingEmail(
      profile.email,
      "subscription_cancelled",
      {
        userName: profile.full_name || "there",
        planName: subscription.plan_name,
        cancelledDate: new Date(subscription.cancelled_at).toLocaleDateString(),
        accessUntilDate: new Date(subscription.current_period_end).toLocaleDateString(),
        cancelType,
        reactivateUrl: buildBillingUrl(slug, "/admin/subscription"),
        feedbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com"}/feedback`
      },
      profile.company_id
    );
  }

  async notifySubscriptionReactivated(userId: string, subscription: any) {
    const { data: profile, error: profileErr8 } = await supabase
      .from("profiles")
      .select("email, full_name, company_id")
      .eq("id", userId)
      .single();
    if (profileErr8) {
      console.error("[billingEmailService] profiles fetch failed:", profileErr8);
    }

    if (!profile?.email || !profile.company_id) return;

    const slug = await fetchCompanySlugForUser(userId);
    await this.sendBillingEmail(
      profile.email,
      "subscription_reactivated",
      {
        userName: profile.full_name || "there",
        planName: subscription.plan_name,
        amount: `R${subscription.amount}`,
        nextBillingDate: subscription.next_billing_date ? new Date(subscription.next_billing_date).toLocaleDateString() : 'N/A',
        dashboardUrl: buildBillingUrl(slug, "/admin/dashboard")
      },
      profile.company_id
    );
  }

  async notifyAccountDeletionScheduled(userId: string, deletionRequest: any) {
    const { data: profile, error: profileErr9 } = await supabase
      .from("profiles")
      .select("email, full_name, company_id")
      .eq("id", userId)
      .single();
    if (profileErr9) {
      console.error("[billingEmailService] profiles fetch failed:", profileErr9);
    }

    if (!profile?.email || !profile.company_id) return;

    const slug = await fetchCompanySlugForUser(userId);
    await this.sendBillingEmail(
      profile.email,
      "account_deletion_scheduled",
      {
        userName: profile.full_name || "there",
        deletionDate: new Date(deletionRequest.scheduled_deletion_date).toLocaleDateString(),
        exportRequested: deletionRequest.data_export_requested,
        cancelDeletionUrl: buildBillingUrl(slug, "/admin/subscription")
      },
      profile.company_id
    );
  }
}

export const billingEmailService = new BillingEmailService();