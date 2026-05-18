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
  /**
   * Critical-comm carve-out. When true, the time-bounded import
   * quarantine pause is ignored (comms_paused_until). The block list
   * is ALWAYS honoured - being blocked is a final decision, not a
   * temporary pause. Use ONLY for legally-required notices like
   * refund / cancellation receipts. The server-side emailService
   * already supports this; without forwarding it through the API
   * endpoint, browser-initiated critical comms would be silently
   * blocked by quarantine.
   */
  bypassQuarantine?: boolean;
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
