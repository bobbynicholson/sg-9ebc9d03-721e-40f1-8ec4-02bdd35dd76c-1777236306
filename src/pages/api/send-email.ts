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