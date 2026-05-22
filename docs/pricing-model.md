# Pricing model - CateringMS

**Last updated:** 2026-05-21
**Status:** Proposal (pre-billing-launch). Numbers are recommended starts; tune after the first 20 tenants.

---

## 1. Founding constraint

> "Every user gets the full experience across all packages. The difference is volume."

Locked. No feature gating between paid tiers. The only levers are:

1. **Events / month** allowance (the single most honest unit for a catering tool).
2. **Active staff seats** that can log in concurrently.
3. **Per-event overage charge** when they exceed the allowance.

A tenant on the smallest paid tier sees the same dashboard, the same kitchen pipeline, the same client portal, the same Stripe / PayFast hookup, the same WhatsApp triggers, the same AI suggestions as the largest tier. They just hit their cap sooner.

This is the right call for the SaaS we're building. The alternative (feature gating) penalises growth and makes upgrade conversations adversarial. Volume gating makes upgrades a celebration ("you outgrew Starter, congrats").

---

## 2. What this tool actually does (the value pitch)

Before pricing, the honest list of what the tenant gets:

- **Full lead -> quote -> event -> delivery -> invoice -> payment pipeline.** One system instead of WhatsApp threads + Excel + a wall calendar.
- **Tenant-branded client portal** with payment gateway integration (PayFast / Stripe / Yoco). The client never sees CateringMS.
- **Kitchen production planning** with prep-list generation from menu items, restock alerts, handover panels, OT logging.
- **Shopping intelligence** - buy lists derived from real demand, supplier ratings, receipt scanning -> stock + payables automation.
- **Driver dispatch + real-time tracking** the client can watch from their phone.
- **Cleaning + equipment SOPs** so a catering manager isn't carrying every recurring task in their head.
- **Cashflow forecast** that combines confirmed deposits, expected balances, supplier payables, fixed costs, and staff wages on one chart.
- **Email + SMS + WhatsApp notifications** across the whole client journey.
- **Multi-region branches** for caterers running two depots in one company.
- **Audit trail + role-based access** that makes a sale-to-investor or franchise-rollout conversation possible.
- **AI-assisted everything** - quote drafting, menu suggestions, financial alerts, lead scoring.

The competitor list (Total Party Planner, Caterease, ChefMod, FoodStorm, Curate) charges $80-$300/month/user for a slice of this. We're delivering the whole pipeline.

---

## 3. Pricing tiers

### 3.1 South Africa (ZAR) - primary launch market

| Tier | Events / month | Staff seats | Price (ZAR/month) | Per-event overage |
|---|---|---|---|---|
| **Free trial** | 3 (first 30 days) | 3 | R0 | n/a |
| **Starter** | up to 10 | 5 | R 990 | R 150 |
| **Growth** | up to 30 | 12 | R 2,490 | R 100 |
| **Scale** | up to 80 | 25 | R 4,990 | R 65 |
| **Enterprise** | unlimited | unlimited | from R 9,900 | flat |

**Annual discount:** 17% off (pay for 10 months, get 12). Common pattern, kills churn for tenants who'd otherwise drift away in January.

**Why these breakpoints:**
- A 10-event/month caterer is a side-hustle or a single-shopper. R990 is below the "ask my accountant" threshold; they sign up on a Friday afternoon.
- A 30-event/month caterer is the "we hire two kitchen staff and run a Saturday wedding + Sunday corporate" SMME. R2,490 is roughly one staff member's daily wage - easy ROI.
- An 80-event/month caterer is running 2-3 simultaneous events most days. R4,990 is half a junior chef's monthly salary - dramatic ROI vs the chaos they're paying for in lost orders today.
- Enterprise is the franchise / multi-branch / hotel-group conversation. Custom quote.

### 3.2 United Kingdom (GBP)

| Tier | Events / month | Staff seats | Price (GBP/month) | Per-event overage |
|---|---|---|---|---|
| **Free trial** | 3 (first 30 days) | 3 | £0 | n/a |
| **Starter** | up to 10 | 5 | £ 49 | £ 9 |
| **Growth** | up to 30 | 12 | £ 119 | £ 6 |
| **Scale** | up to 80 | 25 | £ 239 | £ 4 |
| **Enterprise** | unlimited | unlimited | from £ 479 | flat |

UK caterers think in pounds-per-month and benchmark against Caterease (£90+/user/month - so even our Growth tier with 12 users is wildly under their per-seat).

### 3.3 United States (USD)

| Tier | Events / month | Staff seats | Price (USD/month) | Per-event overage |
|---|---|---|---|---|
| **Free trial** | 3 (first 30 days) | 3 | $0 | n/a |
| **Starter** | up to 10 | 5 | $ 59 | $ 11 |
| **Growth** | up to 30 | 12 | $ 149 | $ 7 |
| **Scale** | up to 80 | 25 | $ 299 | $ 5 |
| **Enterprise** | unlimited | unlimited | from $ 599 | flat |

US caterers pay more for everything; pricing reflects market norms. Total Party Planner charges from $99/user/month for less surface area, so Growth ($149 flat for 12 users) is a hard "yes".

### 3.4 Currency notes

- All tiers bill in the tenant's currency, not converted at runtime. Locks the price the tenant signed up at.
- VAT/GST/sales tax handled per-region by the payment gateway (PayFast for SA does this natively; Stripe Tax for UK/USA).
- Annual plan locks the rate for 12 months. Mid-cycle upgrades prorate; downgrades take effect on the next billing date.

---

## 4. Free trial vs free tier

**Recommendation: free trial, NOT a free tier.**

Reasoning:
- A free tier looks generous but breeds zero-revenue tenants who consume support time. The kind of free user we'd attract here (a one-person caterer running 2 events/year) is a churn risk masquerading as growth.
- A 30-day full-experience free trial converts better. They use it for a real month, hit the limit, fall in love with the cashflow forecast, and pay.
- Trial limits: 3 events, 3 staff seats, all features. Hard cap on the 4th event prompts the upgrade.
- If a tenant doesn't upgrade in 30 days, the account goes read-only (data preserved, sends suspended). They can resurrect by upgrading at any point - data export still works via /admin/export-company-data.

---

## 5. Per-event overage vs hard cap

**Recommendation: soft overage with per-event charge.**

Hard caps create a horrible UX moment - the tenant blocks creating an event for a real wedding next Saturday. They will rage-quit.

Soft overage: confirm the event, charge per-event overage on the next invoice, surface a "you're 3 over this month - upgrade to Growth and save R150" prompt in the dashboard. The same nudge appears via in-app banner + monthly invoice summary.

After three consecutive months of overage, force an upgrade conversation: "We've billed you R450 in overage over the last 3 months. Growth would have covered this for free + you'd have R840 of headroom." This is the upgrade dance done humanely.

---

## 6. What's NOT included in any tier (true add-ons)

These are real platform costs, not feature gates:

- **SMS sends**: passed through at cost + 20% (Twilio retail). ~R1.20/SMS in SA.
- **WhatsApp template messages**: passed through at cost + 20% (~R0.65/conversation in SA).
- **AI generation calls** beyond a fair-use threshold: 5,000 quote-line / menu-suggestion calls / month included on Growth+. Overage billed at $0.002/call (close to OpenAI/Anthropic API cost + margin).
- **Custom domain + dedicated email sender**: tier-included from Growth up. Starter uses the shared `noreply@send.cateringms.com`.

These are usage costs, not feature levers. The tenant pays the platform's actual cost plus a small spread, transparently shown on the invoice.

---

## 7. Migration / onboarding pricing

- **Self-serve onboarding**: free. The FirstStepsCard + FirstEventWalkthrough drive it.
- **Assisted migration** (we import the tenant's existing client list + menu + recurring events from CSV / their old system): R 5,000 / £ 350 / $ 450 one-off.
- **White-glove onboarding** (assigned onboarding manager for 2 weeks, dedicated training session, branded comms templates): R 15,000 / £ 990 / $ 1,200 one-off. Tied to annual Scale or Enterprise.

These are real services that take real human time. They're how Skylight covers the first 60 days of the tenant relationship without burning unit economics.

---

## 8. Comparison anchors

What competitors charge for less:

| Tool | Region | Lowest tier | Per-user/event basis |
|---|---|---|---|
| Caterease | UK/US | $99/user/month | Per user, no event cap |
| Total Party Planner | US | $99/user/month | Per user |
| Curate | US | $149/month | 1 user, ~25 events |
| ChefMod | US | "Call sales" | Quote-driven |
| FoodStorm | UK/AU | $79/user/month | Per user |
| WhatsApp + Excel | Everywhere | Free | Drowning |

Our Growth tier at R2,490 (£119 / $149) for 30 events and 12 users undercuts every competitor on a per-user basis by 5-10x while delivering more surface area. The pitch writes itself.

---

## 9. What needs to ship before we charge anyone

This list is the gate, not the wish list:

- [ ] Stripe / PayFast subscription webhook scaffold (#102 in followup backlog)
- [ ] Subscription status drives feature flags via the existing gating scaffold (Phase 5 #64 - already done)
- [ ] Soft-paywall UX for free-trial expiry (read-only banner + upgrade CTA)
- [ ] Overage tracking + monthly invoice line items
- [ ] Annual vs monthly toggle on the pricing page
- [ ] Currency picker on signup (driven by region selection)
- [ ] Public pricing page on the marketing site (skylight-proposals.co.za sibling? or cateringms.com landing)
- [ ] Refund policy + terms-of-service that match the model

Until that's in, we run on platform-comp invitations only.

---

## 10. What I want Bobby to push back on

1. **Are the SA prices right?** I've anchored to what a 30-event SMME caterer can afford without flinching, but you know the market better. The "R990 below the accountant-ask threshold" assumption could be soft.

2. **Annual vs monthly mix.** I've assumed 17% annual discount drives 40% annual mix. Saner tenants pay monthly until they trust us. We could tighten this discount once we have churn data.

3. **Enterprise floor.** I've put it at R9,900 / £479 / $599. That might be too low - if a 5-branch caterer is closing R2m/month in events, R10k is laughable. But anything above feels arbitrary without a real conversation. Recommend we keep it "from R9,900, call us" and let inbound calls set the real number.

4. **Overage UX.** Soft overage is humane but it does mean a tenant can rack up surprise costs. Should we cap overage at, say, 50% of the next-tier price? "If you'd hit Growth tier we'd auto-upgrade you mid-month" might be cleaner than per-event charges.

5. **Trial length.** 30 days is the norm. A catering month with 3 events isn't a representative sample - some caterers don't have 3 events in their first month. Could justify 45 or 60 days.
