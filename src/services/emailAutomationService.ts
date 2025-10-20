// ❌ REMOVED: import { emailService } from "./emailService";

export const emailAutomationService = {
  async sendCompanyWelcomeEmail(
    recipientEmail: string,
    companyName: string,
    companyId: string,
    companySlug: string,
    adminName: string
  ): Promise<boolean> {
    const loginUrl = `${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/${companySlug}/auth/login`;
    
    // ✅ Use API route instead of emailService directly
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        })
      });

      const result = await response.json();
      return result.success || false;
    } catch (error) {
      console.error("Failed to send welcome email:", error);
      return false;
    }
  },
};
