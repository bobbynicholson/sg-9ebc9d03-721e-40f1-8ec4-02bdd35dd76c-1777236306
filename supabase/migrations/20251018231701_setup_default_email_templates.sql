-- Create default email templates for new companies
-- This migration ensures every company has the necessary email templates
-- Fixed to match actual email_templates table structure

-- Function to create default email templates for a new company
CREATE OR REPLACE FUNCTION create_default_email_templates(company_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Company Welcome Email Template
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
    'welcome',
    'Welcome to CateringMS - Your Platform is Ready!',
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #8B5CF6; margin: 0;">Welcome to CateringMS!</h1>
      </div>
      
      <div style="background-color: #F9FAFB; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <p style="margin: 0 0 10px 0; font-size: 16px;">Hi {adminName},</p>
        <p style="margin: 0; color: #6B7280;">Your catering management platform is now ready! We are excited to have {companyName} on board.</p>
      </div>

      <div style="margin: 30px 0;">
        <h2 style="color: #374151; font-size: 18px; margin-bottom: 15px;">🚀 Your Platform Details</h2>
        <div style="background-color: #FEF3C7; padding: 15px; border-radius: 6px; border-left: 4px solid #F59E0B;">
          <p style="margin: 0 0 10px 0;"><strong>Your Custom URL:</strong></p>
          <p style="margin: 0; font-size: 18px; color: #92400E; word-break: break-all;">{loginUrl}</p>
          <p style="margin: 10px 0 0 0; font-size: 14px; color: #78350F;">⚠️ Save this URL! This is your unique login portal for you and your team.</p>
        </div>
      </div>

      <div style="margin: 30px 0;">
        <h2 style="color: #374151; font-size: 18px; margin-bottom: 15px;">✨ What is Next?</h2>
        <ul style="color: #6B7280; line-height: 1.8;">
          <li>Log in to your portal using the URL above</li>
          <li>Complete your company profile setup</li>
          <li>Add your team members (drivers, kitchen staff, etc.)</li>
          <li>Start managing orders and quotes</li>
          <li>Customize your email templates</li>
        </ul>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="{loginUrl}" style="display: inline-block; padding: 12px 30px; background-color: #8B5CF6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Access Your Portal →</a>
      </div>

      <div style="border-top: 1px solid #E5E7EB; padding-top: 20px; margin-top: 30px;">
        <p style="color: #9CA3AF; font-size: 14px; margin: 0 0 5px 0;">Need help? Contact our support team.</p>
        <p style="color: #9CA3AF; font-size: 14px; margin: 0;">CateringMS - Simplifying Catering Management</p>
      </div>
    </div>',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, template_type) DO NOTHING;

  -- Order Confirmation Email Template
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

  -- Quote Sent Email Template
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
    'quote_sent',
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
COMMENT ON FUNCTION create_default_email_templates IS 'Creates default email templates (welcome, order_confirmation, quote_sent) for new companies';
COMMENT ON FUNCTION trigger_create_default_email_templates IS 'Trigger function to auto-create email templates when company admin signs up';
