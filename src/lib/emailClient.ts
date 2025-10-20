/**
 * Client-safe email helper
 * Calls the email API route instead of importing emailService directly
 * This prevents Next.js from trying to bundle nodemailer for the browser
 */

export interface SendEmailParams {
  companyId: string;
  to: string;
  subject: string;
  template?: string;
  body?: string;
  variables?: Record<string, any>;
  orderId?: string;
  quoteId?: string;
}

/**
 * Send an email via API route (safe for client-side use)
 */
export async function sendEmailViaAPI(params: SendEmailParams): Promise<boolean> {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      console.error('Email API error:', await response.text());
      return false;
    }

    const result = await response.json();
    return result.success || false;
  } catch (error) {
    console.error('Error calling email API:', error);
    return false;
  }
}
