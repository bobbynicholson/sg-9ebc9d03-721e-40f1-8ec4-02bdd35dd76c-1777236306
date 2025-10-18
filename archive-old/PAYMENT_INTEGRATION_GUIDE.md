# Payment Integration Quick Reference Guide

## Overview

Your platform now supports 6 payment gateways: 3 for South Africa and 3 for international expansion. This guide provides quick setup instructions for each.

---

## South African Payment Gateways

### 1. PayFast (Recommended for SA Launch)

**Why PayFast?**
- Most popular in South Africa
- Accepts all major SA banks
- Instant EFT and credit cards
- Lower fees than international gateways
- ZAR currency native support

**Setup Steps:**
1. Go to [payfast.co.za](https://www.payfast.co.za)
2. Click "Get Started" and complete registration
3. Verify your business (requires company registration docs)
4. Access your dashboard and get credentials:
   - Merchant ID
   - Merchant Key
   - Passphrase (set this in security settings)
5. Start in **Sandbox Mode** for testing
6. In your platform: Admin > Payment Gateways > PayFast
7. Enter credentials and enable "Test Mode"
8. Save and test with a dummy transaction

**Test Card:**
- Use PayFast sandbox dashboard to simulate payments
- No real cards needed in sandbox

**Going Live:**
- Complete PayFast verification
- Switch "Test Mode" to OFF
- Process real transactions

**Fees:**
- 2.9% + R2.00 per transaction
- No monthly fees
- No setup fees

---

### 2. Yoco

**Why Yoco?**
- Great for small to medium businesses
- Very simple setup
- Good customer support
- Mobile card reader available
- Popular with SA startups

**Setup Steps:**
1. Go to [yoco.com](https://www.yoco.com)
2. Sign up for business account
3. Complete verification
4. Get API keys from dashboard:
   - Public Key
   - Secret Key
5. In your platform: Admin > Payment Gateways > Yoco
6. Enter keys and enable

**Test Environment:**
- Request sandbox access from Yoco support
- Test card: 4111 1111 1111 1111

**Fees:**
- 2.95% per transaction
- No monthly fees

---

### 3. Peach Payments

**Why Peach Payments?**
- Enterprise-grade solution
- Supports multiple African countries
- Good for scaling across Africa
- Advanced fraud detection
- More payment methods (wallets, bank transfers)

**Setup Steps:**
1. Go to [peachpayments.com](https://www.peachpayments.com)
2. Request demo/account
3. Complete enterprise verification
4. Get credentials:
   - Entity ID
   - API Key
5. In your platform: Admin > Payment Gateways > Peach
6. Configure and test

**Fees:**
- Custom pricing (typically 2.5-3%)
- May require monthly minimums
- Better rates at volume

---

## International Payment Gateways

### 4. Stripe (Recommended for International)

**Why Stripe?**
- Industry leader globally
- 135+ currencies supported
- Excellent documentation
- Strong security and fraud prevention
- Extensive features (subscriptions, invoicing)

**Setup Steps:**
1. Go to [stripe.com](https://stripe.com)
2. Create account (requires business details)
3. Complete verification process
4. Get API keys from dashboard:
   - Publishable Key (starts with pk_)
   - Secret Key (starts with sk_)
5. In your platform: Admin > Payment Gateways > Stripe
6. Start in test mode (use test keys: pk_test_, sk_test_)

**Test Cards:**
- Success: 4242 4242 4242 4242
- Decline: 4000 0000 0000 0002
- Authentication required: 4000 0025 0000 3155

**Going Live:**
- Complete Stripe verification
- Switch to live keys (pk_live_, sk_live_)

**Fees:**
- International cards: 2.9% + 30¢ per transaction
- Local SA cards via Stripe: ~3.4%
- No setup or monthly fees

---

### 5. PayPal

**Why PayPal?**
- Globally recognized brand
- Customers trust the name
- 200+ countries supported
- Buyer protection builds confidence
- No coding required for basic setup

**Setup Steps:**
1. Go to [paypal.com/business](https://www.paypal.com/business)
2. Create business account
3. Get verified (link bank account)
4. Go to Developer Portal for API access
5. Get credentials:
   - Client ID
   - Client Secret
6. In your platform: Admin > Payment Gateways > PayPal
7. Test in sandbox mode first

**Test Environment:**
- Use PayPal Developer Dashboard
- Create test buyer and seller accounts
- No real money in sandbox

**Fees:**
- 2.9% + fixed fee per transaction
- Fixed fee varies by currency
- No monthly fees

---

### 6. Square

**Why Square?**
- All-in-one commerce platform
- Good for in-person + online
- Point of sale hardware available
- Strong analytics and reporting
- Growing international presence

**Setup Steps:**
1. Go to [squareup.com](https://squareup.com)
2. Create account
3. Complete verification
4. Access Developer Dashboard
5. Get credentials:
   - Application ID
   - Access Token
   - Location ID
6. In your platform: Admin > Payment Gateways > Square
7. Configure and test

**Test Environment:**
- Square provides sandbox environment
- Test cards available in docs

**Fees:**
- Online: 2.9% + 30¢
- In-person (with reader): 2.6% + 10¢
- No monthly fees for starter

---

## Recommended Setup Strategy

### Phase 1: Local Launch (South Africa)
**Choose ONE:**
- **Best for most**: PayFast
- **Best for small business**: Yoco  
- **Best for enterprise**: Peach Payments

Configure only your chosen gateway to start. Don't overwhelm yourself with multiple setups initially.

### Phase 2: International Expansion
**Add ONE:**
- **Best overall**: Stripe
- **Best for brand trust**: PayPal
- **Best for retail + online**: Square

Add international gateway only when you have confirmed international customers.

---

## Integration Checklist

Before going live with ANY gateway:

### Technical Setup
- [ ] Gateway configured in platform
- [ ] Credentials entered correctly
- [ ] Test mode enabled initially
- [ ] Webhook URLs configured (if required)
- [ ] Success/cancel URLs set

### Testing
- [ ] Process test payment successfully
- [ ] Verify order status updates
- [ ] Check payment appears in gateway dashboard
- [ ] Test failed payment scenario
- [ ] Verify email notifications sent
- [ ] Check transaction saved in platform

### Security
- [ ] API keys stored in environment variables (not hardcoded)
- [ ] HTTPS enabled on live site
- [ ] Webhook signatures verified (if applicable)
- [ ] PCI compliance reviewed

### Go-Live
- [ ] Business verification completed with gateway
- [ ] Switch from test to live mode
- [ ] Update to live API keys
- [ ] Process small real transaction as test
- [ ] Monitor first few transactions closely

---

## Common Issues and Solutions

### Issue: Payment Not Processing
**Check:**
- Are you in test mode with test credentials?
- Are API keys correct (no extra spaces)?
- Is Supabase connected for persistent storage?
- Check browser console for errors

### Issue: Payment Successful but Order Not Updating
**Check:**
- Webhook URL configured correctly?
- Check webhook logs in gateway dashboard
- Verify Supabase connection for order updates
- Check transaction status in Payment Transactions page

### Issue: Customer Says Payment Taken but Order Shows Pending
**Fix:**
- Check gateway dashboard for actual transaction status
- Webhook may have failed - manually update order
- Implement webhook retry logic (future enhancement)

### Issue: Testing Not Working
**Check:**
- Using test/sandbox credentials (not live)?
- Test mode toggle enabled in platform?
- Using correct test card numbers?
- Sandbox account active?

---

## Currency Considerations

### South African Operations (ZAR)
- All SA gateways handle ZAR natively
- No currency conversion needed
- Prices displayed and charged in Rands

### International Operations
**Option 1: Multi-Currency (Recommended)**
- Stripe supports 135+ currencies
- Charge customer in their local currency
- Automatic conversion
- Better customer experience

**Option 2: ZAR Only**
- Charge everyone in ZAR
- Customer's bank does conversion
- Simpler for you
- May deter some international customers

**Implementation:**
- Set currency in payment intent: `currency: "ZAR"` or `currency: "USD"`
- Display prices in customer's currency
- Store exchange rate for records

---

## Webhook Configuration

Webhooks notify your platform when payment status changes (especially important for async payment methods).

### PayFast Webhooks
```
Webhook URL: https://yourdomain.com/api/payment/webhook/payfast
```
Configure in PayFast dashboard under Integration settings.

### Stripe Webhooks
```
Webhook URL: https://yourdomain.com/api/payment/webhook/stripe
```
Set in Stripe Dashboard > Developers > Webhooks.
Get webhook signing secret for verification.

### Other Gateways
Similar pattern - configure in their dashboard to point to:
```
https://yourdomain.com/api/payment/webhook/[gateway-name]
```

**Note:** Webhook endpoints need to be created in your codebase after Supabase connection to handle real-time payment updates.

---

## Cost Comparison (for R10,000 transaction)

| Gateway | Transaction Fee | Net Amount | Best For |
|---------|----------------|------------|----------|
| PayFast | R292 (2.9% + R2) | R9,708 | SA businesses |
| Yoco | R295 (2.95%) | R9,705 | Small SA businesses |
| Peach | ~R250-300 | R9,700-750 | Enterprise, volume |
| Stripe (Local) | R340 (3.4%) | R9,660 | International + SA |
| PayPal | R290 + 30¢ | ~R9,708 | International trust |
| Square | R290 + 30¢ | ~R9,708 | Retail + online |

**Recommendation**: Start with PayFast for lowest SA fees, add Stripe for international when needed.

---

## Support Contacts

### PayFast
- Support: support@payfast.co.za
- Phone: +27 21 813 9817
- Hours: Mon-Fri 8:30-17:00 SAST

### Yoco
- Support: hello@yoco.com
- Phone: 087 550 9626
- In-app chat available

### Peach Payments
- Support: support@peachpayments.com
- Phone: +27 21 813 9810

### Stripe
- Support: support.stripe.com
- 24/7 email support
- Phone for high-volume accounts

### PayPal
- Support: paypal.com/help
- Phone: 0800 944 144 (SA)

### Square
- Support: squareup.com/help
- 24/7 phone and chat

---

## Next Steps

1. **Choose your primary gateway** based on your launch market
2. **Create account** with chosen provider
3. **Get test credentials** and configure in platform
4. **Process test transactions** to verify everything works
5. **Complete business verification** with gateway
6. **Switch to live mode** when ready
7. **Monitor first transactions** closely
8. **Add international gateway** when you have international demand

---

## Quick Reference: Where to Configure

In your platform:
1. Go to **Admin Dashboard**
2. Click **Settings** (top right)
3. Scroll to **Payment Processing** card
4. Click **Configure Payments**
5. Choose **South African** or **International** tab
6. Select gateway and click **Configure**
7. Enter credentials and save
8. Toggle **Enable Gateway** to activate

That's it! The payment gateway is now active and ready to process transactions.

---

## Important Reminder

**Current Status**: Payment UI is complete and functional, BUT requires Supabase connection before processing real transactions. The system currently stores payment configurations in localStorage for testing only.

**Before Launch**: Follow the LAUNCH_READINESS_GUIDE.md to connect Supabase and set up proper payment processing with persistent storage and security.