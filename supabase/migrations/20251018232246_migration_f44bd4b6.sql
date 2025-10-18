-- Apply the corrected migration
-- Create default email templates for new companies
-- This migration ensures every company has the necessary email templates
-- Using correct template_type values from the constraint

-- Function to create default email templates for a new company
CREATE OR REPLACE FUNCTION create_default_email_templates(company_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Quote Initial Template
  INSERT INTO email_templates (
    user_id,
    template_type,
    subject,
    body,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    company_user_id,
    'quote_initial',
    'Your Catering Quote - #{quoteNumber}',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #8B5CF6;">Your Quote is Ready!</h1>
      <p>Hi {clientName},</p>
      <p>Thank you for your interest! Here is your quote <strong>#{quoteNumber}</strong> for your upcoming event.</p>
      <div style="background-color: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Event Date:</strong> {eventDate}</p>
        <p style="margin: 10px 0 0 0;"><strong>Quoted Amount:</strong> {quotedAmount}</p>
      </div>
      <p>Please review and let us know if you have any questions.</p>
      <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">Best regards,<br>{companyName}</p>
    </div>',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, template_type) DO NOTHING;

  -- Order Confirmation Template
  INSERT INTO email_templates (
    user_id,
    template_type,
    subject,
    body,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    company_user_id,
    'order_confirmation',
    'Order Confirmed - #{orderNumber}',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #8B5CF6;">Order Confirmed!</h1>
      <p>Hi {clientName},</p>
      <p>Your order <strong>#{orderNumber}</strong> has been confirmed.</p>
      <div style="background-color: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Event Date:</strong> {eventDate}</p>
        <p style="margin: 10px 0 0 0;"><strong>Total Amount:</strong> {totalAmount}</p>
      </div>
      <p>We will be in touch with more details soon!</p>
      <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">Thanks,<br>{companyName}</p>
    </div>',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, template_type) DO NOTHING;

  -- Payment Received Template
  INSERT INTO email_templates (
    user_id,
    template_type,
    subject,
    body,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    company_user_id,
    'payment_received',
    'Payment Received - Thank You!',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #10B981;">Payment Received!</h1>
      <p>Hi {clientName},</p>
      <p>We have received your payment for order <strong>#{orderNumber}</strong>.</p>
      <div style="background-color: #ECFDF5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10B981;">
        <p style="margin: 0;"><strong>Amount Paid:</strong> {amountPaid}</p>
        <p style="margin: 10px 0 0 0;"><strong>Payment Date:</strong> {paymentDate}</p>
      </div>
      <p>Thank you for your business!</p>
      <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">Best regards,<br>{companyName}</p>
    </div>',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, template_type) DO NOTHING;

  -- Review Request Template
  INSERT INTO email_templates (
    user_id,
    template_type,
    subject,
    body,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    company_user_id,
    'review_request',
    'How Was Your Experience?',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #8B5CF6;">We Value Your Feedback</h1>
      <p>Hi {clientName},</p>
      <p>Thank you for choosing {companyName} for your recent event!</p>
      <p>We would love to hear about your experience. Your feedback helps us improve our service.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="{reviewUrl}" style="display: inline-block; padding: 12px 30px; background-color: #8B5CF6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Leave a Review →</a>
      </div>
      <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">Thank you,<br>{companyName}</p>
    </div>',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, template_type) DO NOTHING;

END;
$$;

-- Trigger to automatically create email templates when a new company is created
CREATE OR REPLACE FUNCTION trigger_create_default_email_templates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create default templates for the new company admin
  PERFORM create_default_email_templates(NEW.id);
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_company_created_create_templates ON profiles;

-- Create trigger on profiles table (when a company admin is created)
CREATE TRIGGER on_company_created_create_templates
  AFTER INSERT ON profiles
  FOR EACH ROW
  WHEN (NEW.role = 'admin' OR NEW.active_role = 'admin')
  EXECUTE FUNCTION trigger_create_default_email_templates();

-- Create default templates for existing admin users (one-time migration)
DO $$
DECLARE
  admin_record RECORD;
BEGIN
  FOR admin_record IN 
    SELECT id FROM profiles WHERE role = 'admin' OR active_role = 'admin'
  LOOP
    PERFORM create_default_email_templates(admin_record.id);
  END LOOP;
END $$;

-- Add helpful comments
COMMENT ON FUNCTION create_default_email_templates IS 'Creates default email templates (quote_initial, order_confirmation, payment_received, review_request) for new companies';
COMMENT ON FUNCTION trigger_create_default_email_templates IS 'Trigger function to auto-create email templates when company admin signs up';