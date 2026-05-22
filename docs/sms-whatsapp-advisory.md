# SMS vs WhatsApp - provider recommendation

**Audit date:** 2026-05-22
**Status:** Written advice, no code shipped. Wire-up follows separately once Bobby picks the path.

---

## TL;DR

Use **both**, prefer **WhatsApp**, but **per region**:

- **South Africa**: WhatsApp first (95%+ adoption, dominant comms channel), SMS as fallback for new leads who haven't opted in to WhatsApp.
- **United Kingdom**: SMS first (penetration is 75%+, treated as a real channel by businesses), WhatsApp opt-in for clients who explicitly prefer it.
- **United States**: SMS only for transactional. WhatsApp is a niche channel for diaspora / Latin American communities; not the default. Don't market "we WhatsApp you" to a US caterer.

Use **Twilio** as the provider for both, with WhatsApp Business API routed through Twilio's WhatsApp endpoint. One integration, one credential, one billing relationship.

---

## 1. The honest "is WhatsApp really better" answer

WhatsApp is better for caterer<->client comms in SA. It's where the conversation already lives. The client expects to message the caterer on WhatsApp; the caterer is already doing it manually on their personal phone. Bringing WhatsApp into the platform formalises a workflow that's already happening.

SMS is better for US/UK because:
- WhatsApp open rates in the US are real but unevenly distributed - skews young, urban, and diaspora communities. A US corporate-events manager booking a 200-person lunch is more likely on iMessage or SMS than WhatsApp.
- UK WhatsApp adoption is ~70% but business comms are still SMS-first. The "the caterer texted me my delivery is on the way" expectation maps to SMS, not WhatsApp.

The platform should support both and let the **tenant** decide which channel a client gets. We default by tenant region but let them override per-client.

---

## 2. Channel matrix - what gets sent how

| Event | Channel preference order | Why |
|---|---|---|
| Magic-link sign-in | Email (always) | Tokens shouldn't be on SMS - security + retention |
| Quote sent | Email primary, WhatsApp/SMS notification | Email carries the PDF; channel notifies "check your inbox" |
| Quote accepted by client | Email to admin, SMS to admin | Real-time alert; admins ignore email |
| Deposit invoice sent | Email primary, WhatsApp/SMS link | Same as quote |
| Deposit received | Email + WhatsApp/SMS receipt | Money confirmation, every channel |
| Event 7 days out reminder | WhatsApp/SMS to client | Client wants the reminder, not an email |
| Event 24 hrs out reminder | WhatsApp/SMS to client + driver | Last chance to spot wrong address |
| Driver dispatched / "on the way" | WhatsApp/SMS to client | The single most-loved feature - immediate ETA confirmation |
| Delivery completed | WhatsApp/SMS to client | "Thanks - rate us when you have a moment" |
| Balance invoice | Email primary, WhatsApp/SMS link | PDF carries via email |
| Balance overdue | Email + SMS escalation | SMS gets read; email doesn't |
| Cancellation / postponement | Email + WhatsApp/SMS | Critical, every channel |

Email stays the system of record. SMS/WhatsApp are activity channels - notifications and confirmations. We never put critical content (PDFs, payment links the client can't easily forward) only on SMS.

---

## 3. Provider recommendation: Twilio

**Use Twilio for both SMS and WhatsApp Business API.**

Why:
- **One integration**. Twilio's API surface is consistent across SMS and WhatsApp - same `from`, `to`, `body` shape, same webhook signature. We write one provider adapter, route by channel.
- **One billing relationship**. Easier for Skylight ops, easier to pass through transparent per-message cost to tenants.
- **One credential** per tenant (Twilio account SID + auth token + WhatsApp sender + SMS-from number).
- **Twilio handles the WhatsApp Business API onboarding** - the alternative (going direct to Meta) means we'd be doing Business Manager review submissions ourselves per tenant. Twilio absorbs that pain.
- **Twilio has SA / UK / US coverage out of the box.** No regional carrier shopping.
- **Twilio supports message templates** for WhatsApp (required by Meta for outbound business-initiated messages). The template registry can live in our `email_templates` table extension.
- **Sub-account model** lets us scope each tenant's Twilio usage so a runaway tenant doesn't burn the platform's quota.

Alternatives considered:
- **MessageBird**: viable but UK-centric pricing, weaker SA presence, smaller WhatsApp footprint.
- **Vonage**: enterprise-leaning, painful tenant sub-accounts.
- **Direct WhatsApp Business API via Meta**: cheaper per message but the onboarding tax per tenant is brutal. Not worth it until we have 200+ tenants.
- **SA-specific (Clickatell, BulkSMS)**: cheap but no WhatsApp, no multi-region. Single-channel point solutions.

---

## 4. What setup looks like

### 4.1 Skylight (platform) one-time

- Create master Twilio account.
- Set up SMS sender numbers in ZA, GB, US (1 each minimum).
- Submit WhatsApp Business Profile for "CateringMS" so we can use a shared WhatsApp sender for trial / Starter tenants who don't want their own.
- Get the Twilio Account SID + Auth Token into Vercel env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_DEFAULT_SMS_FROM_ZA`, `TWILIO_DEFAULT_SMS_FROM_GB`, `TWILIO_DEFAULT_SMS_FROM_US`, `TWILIO_DEFAULT_WHATSAPP_FROM`.

### 4.2 Per-tenant

Two paths, mirror the email pattern we already have:

**Shared sender (default, Starter tier)**: tenant uses CateringMS's shared SMS numbers + shared WhatsApp business profile. They pay per-message + small spread, no setup. Their messages say "Sent on behalf of <Tenant Name>".

**Branded sender (Growth tier+)**: tenant connects their own Twilio sub-account credentials in `/admin/sms-settings`. Messages come from their own number / WhatsApp profile. They pay Twilio directly for usage, we just take the platform fee.

Mirror of how `email_provider_settings` already works.

### 4.3 Cost passthrough

Same model as the proposed `pricing-model.md`:
- SMS billed at Twilio retail + 20% spread.
- WhatsApp template messages billed at Twilio retail + 20%.
- Conversation-based pricing for WhatsApp (24-hour customer-care window) passed through transparently on the monthly invoice.

---

## 5. Code shape (when we wire it up)

Mirror the email service architecture:

```
src/services/smsService.ts         # sendSms() + sendWhatsApp() unified provider adapter
src/services/messagingService.ts   # high-level: sendEventReminder(orderId), sendDispatchAlert(orderId)
                                   #   picks channel based on client_preference + tenant_region + content_type
src/lib/twilioClient.ts            # singleton Twilio client (sub-account selection per tenant)
src/lib/messageTemplates.ts        # WhatsApp template registry (Meta-approved templates only)
```

Database additions:
- `clients.preferred_channel`: enum('whatsapp', 'sms', 'email_only'). Default by tenant region.
- `companies.sms_provider_settings`: jsonb with twilio credentials, sender numbers, branded vs shared mode.
- `messaging_logs`: mirror of `email_logs` for SMS/WhatsApp sends, including conversation_id for WhatsApp pricing audit.

WhatsApp message templates need Meta approval and live in a registry table - we can't free-text outbound WhatsApp messages outside the 24-hour conversation window.

---

## 6. Compliance + opt-out

Same shape as the email unsubscribe footer we just shipped:

- Every SMS / WhatsApp send carries "Reply STOP to stop" (SMS) or a one-click "Stop receiving messages from <Tenant>" button (WhatsApp interactive message).
- STOP replies write to `blocked_contacts` with `channel` discriminator so SMS opt-out doesn't also kill email.
- Per docs/notifications.md - opt-out is per channel + per tenant, not global. A client can be on the SMS block list for Caterer A and still get SMS from Caterer B.

---

## 7. What I want Bobby to decide

1. **Do we ship SA-first** (WhatsApp + SMS via Twilio with SA sender numbers) and add UK/US in a later phase, or wire all three regions on day one? Recommendation: **SA-first**, UK/US opt-in. SA is the immediate revenue base; UK/US tenants can use the shared Twilio numbers + Email-only until we have demand to justify per-region branding.

2. **Twilio sub-accounts vs single platform account.** Sub-accounts are cleaner for billing but add API friction (every API call has to specify which sub-account). I lean **single platform account** for v1, sub-accounts in v2 when we have 50+ active tenants.

3. **Do you want tenants to be able to bring their own Twilio creds (BYO-Twilio)?** This is fiddly for tenants but gives them direct billing. Recommendation: **shared by default, BYO on Scale tier+** for the few enterprise tenants who'll insist.

4. **Per-channel block list vs cross-channel global.** I lean per-channel (your STOP on SMS doesn't kill the email reminder). The alternative is one block per recipient + tenant, all channels off. Depends on compliance read - SA POPI is fine either way; UK GDPR cares about explicit consent per channel.

5. **Inbound channel** - do we want to receive WhatsApp/SMS replies back into the platform? That's a different scope (inbox UI, conversation threading). Recommendation: **outbound-only for v1**. Replies route to the tenant's normal phone / WhatsApp until we ship an inbox surface.
