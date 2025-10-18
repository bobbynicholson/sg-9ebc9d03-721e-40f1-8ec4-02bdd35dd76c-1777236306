# 📧 Email Configuration Guide for Alex

## 🔐 Internal CateringMS Email Setup (READ THIS FIRST!)

**For all CateringMS platform email configurations:**

- ✅ **Official Email**: `hello@cateringms.com`
- ✅ **Server Access**: You have full server logins for cateringMS.com
- ✅ **Usage Guidelines**:
  - Use `hello@cateringms.com` when signing up for Resend
  - Use `hello@cateringms.com` for all 3rd-party service integrations
  - This is the official platform email for CateringMS
  - All platform-related communications should come from this address

**Why this matters:**
- Professional, consistent branding across all services
- Centralized email management
- Easier to track platform communications
- Single point of contact for customers

---

## Overview

The email infrastructure is **100% production-ready** and requires **zero code changes**. You just need to configure your email provider and add environment variables.

## Current Status

✅ **Email Service**: Fully implemented with Resend API and SMTP support  
✅ **Development Mode**: Emails are simulated (logs to console) until you configure a provider  
✅ **Template System**: Complete email template and variable replacement system  
✅ **Email Logging**: All sent emails are tracked in the database  
✅ **API Endpoints**: `/api/send-email` and `/api/test-email` ready to use  

## Email Providers Supported

### Option 1: Resend (Recommended for Next.js/Vercel) ⭐

**Why Resend?**
- Built for serverless/Next.js
- Free tier: 100 emails/day, 3,000/month
- Simple setup (just one API key)
- Excellent deliverability
- Official React/Next.js integration

**Setup Steps:**

1. **Sign up at [resend.com](https://resend.com)**
   - Free account, no credit card required

2. **Get your API key**
   - Dashboard → API Keys → Create API Key
   - Copy the key (starts with `re_`)

3. **Add to environment variables**
   ```bash
   # .env.local
   RESEND_API_KEY=re_your_api_key_here
   ```

4. **Configure in database**
   ```sql
   -- For each company that needs email
   INSERT INTO email_settings (user_id, enabled, provider, from_name, from_email)
   VALUES (
     'company-uuid-here',
     true,
     'resend',
     'CateringMS',
     'noreply@yourdomain.com'
   );
   ```

5. **Verify domain (Optional but recommended)**
   - Add DNS records in Resend dashboard
   - This improves deliverability and removes "via resend.com" from sender

**That's it! Emails will send immediately.**

---

### Option 2: SMTP (Any Provider)

Works with: Gmail, SendGrid, Mailgun, AWS SES, etc.

**Setup Steps:**

1. **Get SMTP credentials from your provider**
   - Example (Gmail):
     - Enable 2FA
     - Generate App Password
     - Use `smtp.gmail.com:587`

2. **Configure in database**
   ```sql
   INSERT INTO email_settings (
     user_id,
     enabled,
     provider,
     from_name,
     from_email,
     smtp_host,
     smtp_port,
     smtp_user,
     smtp_password
   )
   VALUES (
     'company-uuid-here',
     true,
     'smtp',
     'CateringMS',
     'your-email@gmail.com',
     'smtp.gmail.com',
     587,
     'your-email@gmail.com',
     'your-app-password'
   );
   ```

**Done! SMTP emails will work immediately.**

---

## Testing Email Configuration

### Method 1: Using the Test API Endpoint

```bash
curl -X POST http://localhost:3000/api/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "your-company-uuid",
    "to": "your-test-email@example.com"
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Test email sent successfully! Check your inbox.",
  "config": {
    "provider": "resend",
    "from": "CateringMS <noreply@yourdomain.com>",
    "enabled": true
  }
}
```

### Method 2: Test Company Signup

1. Go to `/company-signup`
2. Complete the signup form
3. Check the email you used - you should receive a welcome email

---

## Email Templates

Companies can customize email templates in their admin portal:

1. **Navigate to**: `/{companySlug}/admin/email-templates`
2. **Available templates**:
   - `company-welcome` - Sent when company signs up
   - `order-confirmation` - Sent when order is confirmed
   - `quote-sent` - Sent when quote is created
   - Custom templates can be added

3. **Template variables** (automatically replaced):
   - `{adminName}` - Admin/recipient name
   - `{companyName}` - Company name
   - `{companySlug}` - Company URL slug
   - `{loginUrl}` - Login URL
   - `{orderNumber}` - Order number
   - Custom variables can be passed

---

## Production Checklist

- [ ] Choose email provider (Resend recommended)
- [ ] Add `RESEND_API_KEY` to Vercel environment variables
- [ ] Configure `email_settings` in database for each company
- [ ] Test with `/api/test-email` endpoint
- [ ] Verify domain in Resend (optional but recommended)
- [ ] Monitor email logs in `email_automation_log` table

---

## How Emails Are Sent

### Company Signup Flow

```typescript
// This happens automatically during company signup:
1. User submits signup form
2. Company is created in database
3. companyService.createCompany() calls emailAutomationService.sendCompanyWelcomeEmail()
4. emailService.sendEmail() checks email_settings for the company
5. Email is sent via configured provider (Resend or SMTP)
6. Email is logged in email_automation_log table
```

### Development vs Production

**Development (No provider configured):**
- Emails are simulated
- Logs appear in console
- Signup flow continues normally
- Perfect for local testing

**Production (Provider configured):**
- Real emails are sent
- No code changes needed
- Just add environment variables

---

## Troubleshooting

### "Email automation is disabled or not configured"

**Solution**: Add `email_settings` record for the company:
```sql
INSERT INTO email_settings (user_id, enabled, provider, from_name, from_email)
VALUES ('company-uuid', true, 'resend', 'Your Company', 'noreply@yourdomain.com');
```

### "Email template not found"

**Solution**: Template might be missing. Create it:
```sql
INSERT INTO email_templates (user_id, name, slug, subject, body)
VALUES (
  'company-uuid',
  'Company Welcome',
  'company-welcome',
  'Welcome to CateringMS, {companyName}!',
  '<div>Welcome {adminName}! Your login URL: {loginUrl}</div>'
);
```

### Emails not sending (Resend)

1. Check `RESEND_API_KEY` is in environment
2. Verify API key is valid (check Resend dashboard)
3. Check from_email domain is verified in Resend
4. Review logs in `email_automation_log` table

### Emails going to spam

1. Verify domain in Resend
2. Add SPF, DKIM, DMARC records
3. Use a professional from_email address
4. Avoid spam trigger words in templates

---

## Database Schema Reference

### email_settings
```sql
CREATE TABLE email_settings (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  enabled BOOLEAN DEFAULT false,
  provider TEXT, -- 'resend' or 'smtp'
  from_name TEXT,
  from_email TEXT,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_password TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### email_templates
```sql
CREATE TABLE email_templates (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name TEXT,
  slug TEXT,
  subject TEXT,
  body TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### email_automation_log
```sql
CREATE TABLE email_automation_log (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  order_id UUID,
  quote_id UUID,
  template_type TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  subject TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
);
```

---

## Next Steps

1. **Choose Resend** (recommended) or configure SMTP
2. **Add environment variable** to Vercel
3. **Configure email_settings** for your company
4. **Test with `/api/test-email`**
5. **Done!** Emails will work automatically

---

## Support

If you encounter any issues:
1. Check the troubleshooting section above
2. Review logs in `email_automation_log` table
3. Test with `/api/test-email` to isolate the issue
4. Verify environment variables are set in Vercel

The email infrastructure is solid and production-ready. Once you add the provider credentials, everything will work immediately without any code changes!
