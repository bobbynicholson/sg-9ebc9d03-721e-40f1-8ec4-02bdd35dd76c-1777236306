import { emailService } from "@/services/emailService";

export const emailAutomationService = {
  /**
   * Sends a welcome email to a new company owner.
   * @param email - The recipient's email address.
   * @param companyName - The name of the company.
   * @param companyId - The ID of the company, used for linking.
   * @param ownerName - The name of the owner.
   */
  async sendCompanyWelcomeEmail(
    email: string,
    companyName: string,
    companyId: string,
    ownerName: string
  ): Promise<void> {
    const subject = `Welcome to CateringMS, ${companyName}!`;
    const loginUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/login`;
    
    // The link will now just go to the generic login page
    // The user's role and company context will be loaded after they log in.
    const body = `
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

    await emailService.sendEmail({
      to: email,
      subject,
      html: body,
    });
  },
};
