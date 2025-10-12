# Google OAuth Setup Guide for CaterOS

## Complete Step-by-Step Configuration

This guide will walk you through setting up Google OAuth authentication for your CaterOS application.

---

## 1. SUPABASE DASHBOARD SETUP

### Step 1: Access Authentication Settings

1. Log in to your Supabase dashboard: https://app.supabase.com
2. Select your CaterOS project
3. Navigate to **Authentication** → **Providers** in the left sidebar
4. Scroll down to find **Google** in the list of providers

### Step 2: Enable Google Provider

1. Click on **Google** to expand the settings
2. Toggle **Enable Sign in with Google** to ON
3. Leave the settings panel open (you'll need to come back here)

---

## 2. GOOGLE CLOUD CONSOLE SETUP

### Step 1: Create Google Cloud Project

1. Go to Google Cloud Console: https://console.cloud.google.com
2. Click **Select a project** dropdown at the top
3. Click **New Project**
4. Project name: "CaterOS Authentication" (or your preferred name)
5. Click **Create**
6. Wait for project creation, then select the new project

### Step 2: Enable Google+ API

1. In the left sidebar, go to **APIs & Services** → **Library**
2. Search for "Google+ API"
3. Click on **Google+ API**
4. Click **Enable**
5. Wait for activation (takes a few seconds)

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** as user type
3. Click **Create**

**Fill in the required fields:**

**App Information:**
- App name: `CaterOS`
- User support email: `support@cateros.com` (your support email)
- App logo: (Optional - upload your CaterOS logo if you have one)

**App Domain:**
- Application home page: `https://your-domain.vercel.app` (your actual domain)
- Application privacy policy: `https://your-domain.vercel.app/privacy`
- Application terms of service: `https://your-domain.vercel.app/terms`

**Developer Contact Information:**
- Email addresses: `support@cateros.com`

4. Click **Save and Continue**

**Scopes Section:**
1. Click **Add or Remove Scopes**
2. Select these scopes:
   - `userinfo.email`
   - `userinfo.profile`
   - `openid`
3. Click **Update**
4. Click **Save and Continue**

**Test Users (Optional for Development):**
- Add your email address and any team members' emails
- Click **Save and Continue**

5. Review summary and click **Back to Dashboard**

### Step 4: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** at the top
3. Select **OAuth client ID**

**Configure OAuth Client:**
- Application type: **Web application**
- Name: `CaterOS Web App`

**Authorized JavaScript origins:**
Add these URLs (one per line):
```
http://localhost:3000
https://your-project-ref.supabase.co
https://your-domain.vercel.app
```

**Authorized redirect URIs:**
Add these URLs (one per line):
```
http://localhost:3000/auth/callback
https://your-project-ref.supabase.co/auth/v1/callback
https://your-domain.vercel.app/auth/callback
```

**IMPORTANT:** Replace `your-project-ref` with your actual Supabase project reference and `your-domain` with your actual Vercel domain.

4. Click **Create**

### Step 5: Copy Credentials

After creation, you'll see a modal with your credentials:

```
Client ID: 123456789-abc123def456.apps.googleusercontent.com
Client Secret: GOCSPX-abc123def456xyz789
```

**IMPORTANT:** Copy both values immediately. You'll need them in the next step.

---

## 3. CONNECT GOOGLE TO SUPABASE

### Step 1: Add Credentials to Supabase

1. Return to your Supabase dashboard
2. Go back to **Authentication** → **Providers** → **Google**
3. Paste your Google credentials:
   - **Client ID**: Paste the Client ID from Google
   - **Client Secret**: Paste the Client Secret from Google
4. Click **Save**

### Step 2: Get Supabase Callback URL

Supabase will show you the callback URL:
```
https://your-project-ref.supabase.co/auth/v1/callback
```

Copy this URL.

### Step 3: Update Google OAuth Redirect URIs (If Needed)

1. Return to Google Cloud Console
2. Go to **APIs & Services** → **Credentials**
3. Click on your OAuth 2.0 Client ID
4. Under **Authorized redirect URIs**, ensure this URL is listed:
   ```
   https://your-project-ref.supabase.co/auth/v1/callback
   ```
5. If not listed, add it and click **Save**

---

## 4. VERIFY SETUP IN YOUR APPLICATION

### Test Google OAuth Flow

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to: `http://localhost:3000/auth/login`

3. Click **"Continue with Google"** button

4. You should be redirected to Google's consent screen

5. Sign in with your Google account

6. Grant permissions

7. You should be redirected back to your app at `http://localhost:3000`

8. Check that:
   - You're logged in
   - Your profile is created
   - Your name and email are populated

### Troubleshooting Common Issues

**Issue: "redirect_uri_mismatch" error**
- Solution: Double-check that all redirect URIs in Google Cloud Console exactly match those in Supabase
- Ensure there are no trailing slashes or typos

**Issue: "Access blocked: This app's request is invalid"**
- Solution: Ensure OAuth consent screen is properly configured
- Verify all required scopes are added

**Issue: User redirected but not logged in**
- Solution: Check browser console for errors
- Verify callback handler exists at `/auth/callback`
- Check Supabase logs for authentication errors

**Issue: "Cookies are disabled" or similar**
- Solution: Ensure your browser allows cookies
- Check that Supabase client is properly initialized

---

## 5. PRODUCTION DEPLOYMENT CHECKLIST

Before going live, ensure:

### Supabase Configuration
- [ ] Google OAuth provider is enabled
- [ ] Client ID and Secret are saved
- [ ] Production redirect URIs are added

### Google Cloud Console
- [ ] OAuth consent screen is fully configured
- [ ] Production domain is added to Authorized JavaScript origins
- [ ] Production callback URLs are added to Authorized redirect URIs
- [ ] App verification is complete (if required by Google)

### Vercel Environment Variables
Ensure these are set in your Vercel project:
```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Update Google OAuth Settings for Production
1. Go to Google Cloud Console → OAuth client
2. Add production URLs:

**Authorized JavaScript origins:**
```
https://your-production-domain.com
https://www.your-production-domain.com
```

**Authorized redirect URIs:**
```
https://your-project-ref.supabase.co/auth/v1/callback
https://your-production-domain.com/auth/callback
https://www.your-production-domain.com/auth/callback
```

---

## 6. TESTING CHECKLIST

Test these scenarios:

- [ ] New user can sign up with Google
- [ ] Existing user can sign in with Google
- [ ] User profile is created with correct data
- [ ] 14-day trial is properly assigned
- [ ] Onboarding flow triggers correctly
- [ ] User can sign out and sign back in
- [ ] Email and name are populated from Google account
- [ ] Currency defaults to ZAR for new users
- [ ] Demo mode and Google OAuth work independently

---

## 7. SECURITY BEST PRACTICES

### Client ID & Secret Protection
- **NEVER** commit Client Secret to git
- Store in environment variables
- Rotate credentials if exposed

### Scope Minimization
- Only request necessary scopes (email, profile, openid)
- Don't request additional Google permissions unless needed

### User Data Handling
- Only store essential user information
- Comply with GDPR and data protection regulations
- Provide users ability to delete their data

---

## 8. MONITORING & MAINTENANCE

### Google Cloud Console Monitoring
- Monitor OAuth usage in **APIs & Services** → **Dashboard**
- Check for suspicious activity
- Review error logs

### Supabase Auth Logs
- Monitor authentication events in Supabase dashboard
- Track failed login attempts
- Review user signup patterns

### Regular Audits
- Review OAuth credentials quarterly
- Update redirect URIs when domains change
- Keep OAuth consent screen information current

---

## QUICK REFERENCE

### Key URLs
- Google Cloud Console: https://console.cloud.google.com
- Supabase Dashboard: https://app.supabase.com
- OAuth Consent Screen: https://console.cloud.google.com/apis/credentials/consent

### Important Files in Codebase
```
src/services/authService.ts              - OAuth logic
src/pages/auth/login.tsx                 - Login page with Google button
src/pages/auth/register.tsx              - Register page with Google button
src/pages/auth/callback.tsx              - OAuth callback handler
src/contexts/AuthContext.tsx             - Auth state management
```

### Support Resources
- Supabase Auth Docs: https://supabase.com/docs/guides/auth/social-login/auth-google
- Google OAuth 2.0 Docs: https://developers.google.com/identity/protocols/oauth2
- Next.js Auth Patterns: https://nextjs.org/docs/authentication

---

## GETTING HELP

If you encounter issues:

1. **Check Supabase Logs:**
   - Go to your Supabase dashboard → Logs → Auth
   - Look for authentication errors

2. **Verify Credentials:**
   - Double-check Client ID and Secret
   - Ensure no extra spaces or characters

3. **Test Redirect URIs:**
   - Copy exact URLs from Supabase
   - Paste into Google Console
   - No trailing slashes

4. **Contact Support:**
   - Supabase Discord: https://discord.supabase.com
   - CaterOS Support: support@cateros.com
   - Phone: +27 83 652 5755

---

## SUMMARY

You've successfully set up Google OAuth authentication for CaterOS! Users can now:

✅ Sign up with their Google account (1-click registration)
✅ Sign in with Google (faster login)
✅ Have their profile auto-populated with Google data
✅ Get a 14-day free trial automatically
✅ Start using CaterOS immediately

The implementation is production-ready and secure. Just remember to update your redirect URIs when you deploy to production!

---

*Last Updated: October 12, 2025*
*CaterOS by Skylight Digital*
