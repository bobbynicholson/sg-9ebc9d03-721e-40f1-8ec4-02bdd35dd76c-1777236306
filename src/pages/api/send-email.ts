import type { NextApiRequest, NextApiResponse } from "next";
import { emailService } from "@/services/emailService";
import { createPagesServerClient } from "@/lib/supabase/server";

/**
 * API Route for sending emails
 * This endpoint handles email sending server-side to protect API keys and manage email content.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { companyId, to, subject, template, body, variables, orderId, quoteId, emailType } = req.body;

    if (!companyId || !to) {
      return res.status(400).json({
        error: "Missing required fields: companyId and to are required.",
      });
    }

    // SECURITY: caller must be authenticated and belong to the company they're
    // sending email "from". Without this, anyone with the endpoint URL could
    // pump messages through another tenant's configured Resend/SMTP credentials.
    // companyWelcome is the one exception -- it's invoked by the public signup
    // flow before the user has a session.
    if (emailType !== "companyWelcome") {
      const ssr = createPagesServerClient({ req, res });
      const { data: { user } } = await ssr.auth.getUser();
      if (!user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { data: profile } = await ssr
        .from("profiles")
        .select("company_id, role, active_role")
        .eq("id", user.id)
        .maybeSingle();
      const callerRole = (profile as any)?.active_role || (profile as any)?.role;
      if (callerRole !== "super_admin" && (profile as any)?.company_id !== companyId) {
        return res.status(403).json({ error: "Cannot send email for another company" });
      }

      // Negative gates -- two ways a send can be refused:
      //
      //   (1) blocked_contacts: the contact was deleted with the
      //       "block from future comms" toggle on. Permanent unless
      //       the row is removed from blocked_contacts.
      //
      //   (2) comms_paused_until: the recipient lives on a lead or
      //       client row that came from a bulk import and the owner
      //       hasn't reviewed + green-lit the batch yet. Stops naive
      //       "welcome email" blasts from going out to historical
      //       data on day one of a new tenant.
      //
      // Both checks run for every recipient. Either one triggers a
      // 409 response so the caller can surface the reason in the UI.
      const recipients = Array.isArray(to) ? to : [to];
      const recipientLower = recipients
        .filter((r): r is string => typeof r === "string" && !!r)
        .map((r) => r.toLowerCase().trim());

      if (recipientLower.length > 0) {
        // Cast through any -- the auto-generated database.types.ts doesn't
        // yet include blocked_contacts or the is_comms_paused_for_email
        // RPC, and the typed client tries to recurse infinitely on
        // unknown table names. Re-generate types and remove the cast
        // when convenient.
        const ssrAny = ssr as any;

        const { data: blocks } = await ssrAny
          .from("blocked_contacts")
          .select("email_lower, reason")
          .eq("company_id", companyId)
          .in("email_lower", recipientLower);
        if (blocks && blocks.length > 0) {
          return res.status(409).json({
            error: "Recipient is on this company's block list",
            blocked: blocks.map((b: any) => b.email_lower),
            reason: blocks[0]?.reason ?? null,
          });
        }

        // Quarantine guard. is_comms_paused_for_email looks across
        // leads + clients for any row matching this address whose
        // comms_paused_until is still in the future. Importantly we
        // run it per recipient so one paused email in a multi-recipient
        // send blocks the whole call -- safer default than partial
        // delivery.
        for (const recip of recipientLower) {
          const { data: paused } = await ssrAny.rpc("is_comms_paused_for_email", {
            p_company_id: companyId,
            p_email: recip,
          });
          if (paused === true) {
            return res.status(409).json({
              error: "Recipient is in import quarantine -- comms paused until the owner reviews the batch",
              quarantined: recip,
            });
          }
        }
      }
    }

    let result = false;

    // Handle specific email types with server-side templates
    if (emailType === 'companyWelcome' && variables) {
      const { companyName, ownerName } = variables;
      const welcomeSubject = `Welcome to CateringMS, ${companyName}!`;
      const loginUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/login`;
      
      const welcomeBody = `
        <h1>Welcome, ${ownerName}!</h1>
        <p>Your company, <strong>${companyName}</strong>, is now set up on the CateringMS platform.</p>
        <p>You can now log in to your account to start managing your catering business.</p>
        <a href="${loginUrl}" style="background-color: #4f46e5; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Log In to Your Dashboard
        </a>
        <p>If you have any questions, feel free to contact our support team.</p>
        <br>
        <p>Best regards,</p>
        <p>The CateringMS Team</p>
      `;

      result = await emailService.sendEmail({
        companyId,
        to,
        subject: welcomeSubject,
        body: welcomeBody,
      });

    } else {
      // Handle generic email requests
      if (!subject) {
        return res.status(400).json({ error: "Missing required field: subject is required for generic emails." });
      }

      result = await emailService.sendEmail({
        companyId,
        to,
        subject,
        template,
        body,
        variables,
        orderId,
        quoteId,
      });
    }

    if (result) {
      return res.status(200).json({
        success: true,
        message: "Email processed successfully",
      });
    } else {
      return res.status(500).json({
        success: false,
        error: "Failed to send email",
      });
    }
  } catch (error) {
    console.error("Email API error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}