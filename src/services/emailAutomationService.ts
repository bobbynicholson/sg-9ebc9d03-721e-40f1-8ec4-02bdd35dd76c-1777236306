import { emailService } from "./emailService";

export const emailAutomationService = {
  async sendCompanyWelcomeEmail(
    recipientEmail: string,
    companyName: string,
    companyId: string,
    companySlug: string,
    adminName: string
  ): Promise<boolean> {
    const loginUrl = `${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/${companySlug}/auth/login`;
    
    return emailService.sendEmail({
      companyId: companyId,
      to: recipientEmail,
      subject: `Welcome to CateringMS, ${companyName}! 🎉`,
      template: 'company-welcome',
      variables: {
        adminName: adminName,
        companyName: companyName,
        companySlug: companySlug,
        loginUrl: loginUrl,
      },
    });
  },
};