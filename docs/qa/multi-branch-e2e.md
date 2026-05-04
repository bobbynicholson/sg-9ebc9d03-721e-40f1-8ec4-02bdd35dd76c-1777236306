# Spit Braai multi-branch end-to-end QA

Validates Stages 0-3 of the multi-branch rebuild + audit fixes on production. Tenant: Spit Braai Delivery (`slug='spit-braai-delivery'`). Owner: `hello@spitbraaidelivery.co.za` (`role='company_admin'`). Existing region: Cape Town (`code='CPT'`).

---

## 0. Prerequisites

- Two Chrome windows. **Window A** = normal (Bobby). **Window B** = incognito (JHB manager). Both signed-out at start.
- Real test inbox accessible for `branch-manager-jhb@example.com` (or substitute one Bobby controls).
- Supabase SQL editor open on project `vsuyzovzqtrngorpqnhy`.
- Test client phone on hand (e.g. 0833334444). Use a personal email like `test+jhb@example.com` so it's filterable.

Clean baseline check. Run before starting -- expect zero rows for every count except the first:

```sql
-- Replace once and reuse
with c as (select id from companies where slug='spit-braai-delivery')
select
  (select count(*) from regions where company_id=(select id from c) and code='JHB' and is_active) as jhb_active_regions,
  (select count(*) from profiles where email='branch-manager-jhb@example.com') as jhb_manager_profiles,
  (select count(*) from leads where company_id=(select id from c) and email='test+jhb@example.com') as orphan_leads,
  (select count(*) from quotes q join clients cl on cl.id=q.client_id where cl.email='test+jhb@example.com') as orphan_quotes;
```

If any column other than the first returns >0, run the cleanup script in section 6 before continuing.

---

## 1. Setup -- add the JHB branch

Window A. Sign in as `hello@spitbraaidelivery.co.za`.

1. Navigate to `/spit-braai-delivery/admin/regions`.
2. Click **Add Region** (top-right, purple gradient).
3. Fill the dialog:
   - Region name: `Johannesburg`
   - Code: `JHB`
   - Country: `South Africa`
   - Province / state: `Gauteng`
   - Branch / kitchen address: type "Sandton" and pick a Sandton address from the autocomplete dropdown. Confirm Coords shows `(set)` with roughly `-26.107, 28.057`. Do not type coordinates manually -- the autocomplete must populate them.
4. **Branch overrides** panel (blue):
   - VAT rate (%): leave blank (inherit company default).
   - Deposit (%): leave blank.
   - Delivery R / km: `12`
   - Min delivery fee (R): `100`
5. **Branch manager notifications** panel (green): leave all three switches ON.
6. Click **Create region**. Toast confirms "Region created".
7. Card for Johannesburg appears with KPI mini-strip: MTD orders 0, MTD revenue R0, Open quotes 0, Staff 0.

Verify the override row landed:

```sql
select id, name, code, vat_rate, deposit_percent, delivery_cost_per_km, min_delivery_fee,
       notify_manager_on_new_lead, notify_manager_on_new_order, notify_manager_on_prep_alert
from regions
where company_id=(select id from companies where slug='spit-braai-delivery')
  and code='JHB';
-- expect: vat_rate NULL, deposit_percent NULL, delivery_cost_per_km 12, min_delivery_fee 100, all 3 notify flags true
```

---

## 2. Setup -- invite a JHB branch manager

Window A, still signed in.

1. Navigate to `/spit-braai-delivery/admin/users`.
2. Click **Add Staff Member**.
3. Full name: `JHB Manager`. Email: `branch-manager-jhb@example.com`.
4. Role dropdown: confirm these new options exist -- **Branch Manager (single / multi-branch)** and **Sales Admin (cross-branch sales)**. Pick **Branch Manager (single / multi-branch)**.
5. **Branches this user can access** panel appears below. Tick **Johannesburg** only. Leave Cape Town unticked.
6. Submit. Toast: "Staff Added!". Note the password is `BYPASS_2026`.

Verify:

```sql
select p.id, p.email, p.full_name, p.role, p.active_role, p.region_id,
       p.regions_covered, r.code as primary_region
from profiles p
left join regions r on r.id=p.region_id
where p.email='branch-manager-jhb@example.com';
-- expect: role='region_admin', regions_covered=[<JHB uuid>], region_id=<JHB uuid>, primary_region='JHB'
```

---

## 3. The acceptance map

### 3a. As JHB region_admin (Window B, incognito)

Sign in at `/spit-braai-delivery/login` with `branch-manager-jhb@example.com` / `BYPASS_2026`.

| Step | Expected | Pass / fail / notes |
|---|---|---|
| Login lands on | `/spit-braai-delivery/admin/dashboard` (NOT `/admin/platform/...`) | |
| Top-bar region dropdown | Shows **Johannesburg** only. No "All branches", no CPT. Cannot widen scope. | |
| Sidebar nav | "Branding & Settings" section absent. "Platform Admin" absent. | |
| Visit `/spit-braai-delivery/admin/leads` | Empty list, no JHB leads | |
| Visit `/spit-braai-delivery/admin/leads/new` | Branch picker (if shown) pre-selected to Johannesburg | |
| Create lead | Name `Test Client`, email `test+jhb@example.com`, phone `0833334444`, event date next Saturday, guests `50`. Save. | |
| Back on `/admin/leads` | New lead visible with **JHB** badge in region column | |
| Click "New quote" on lead's row | Builder opens, leadId pre-filled, client name + phone pre-filled | |
| Add menu item, per-person, R200, guest count 50 | Subtotal updates to ~R10 000 | |
| Venue address: type "Rosebank" and pick a Joburg address | Coords populate | |
| Distance + delivery fee panel | "From Johannesburg" (NOT Cape Town). R per km field shows `12`. Min fee floor `R100`. Auto fee = distance km x R12, floored at R100. | |
| Save draft | Toast "Draft saved". Refresh page -- client phone field still populated (audit fix). | |
| Send quote | Status changes to `sent`. | |

DB verify the sent quote:

```sql
select q.id, q.region_id, r.code, q.client_phone, q.deposit_percentage, q.status,
       q.delivery_cost_per_km, q.min_delivery_fee
from quotes q
join clients c on c.id=q.client_id
join regions r on r.id=q.region_id
where c.email='test+jhb@example.com'
order by q.created_at desc limit 1;
-- expect: r.code='JHB', client_phone='0833334444', deposit_percentage=30, status='sent',
-- delivery_cost_per_km=12, min_delivery_fee=100
```

### 3b. As Bobby company_admin (Window A, fresh incognito)

Sign in fresh in a second incognito as `hello@spitbraaidelivery.co.za`.

| Step | Expected | Pass / fail / notes |
|---|---|---|
| Top-bar region dropdown | Shows **All branches** + **Cape Town** + **Johannesburg** | |
| Default selection | "All branches" | |
| Switch to Johannesburg | CPT data drops out of lists; JHB lead + quote remain | |
| Switch back to All | Both branches' data visible | |
| `/spit-braai-delivery/admin/financial-dashboard` | **Branches** tab visible (5-tab layout). Click it. One row per branch (CPT, JHB) with MTD revenue / orders / outstanding. | |
| `/spit-braai-delivery/admin/regions` top KPI strip | Active branches `2`, Open quotes `1`, MTD orders `0`, MTD revenue `R0` | |
| `/spit-braai-delivery/admin/inventory` -- Add item | Branch picker visible with options **Shared (every branch can use this)** / Cape Town / Johannesburg | |

---

## 4. Negative tests

Window B, still signed in as JHB region_admin.

| Step | Expected | Pass / fail / notes |
|---|---|---|
| Go to `/spit-braai-delivery/admin/financial-dashboard` directly | Redirect to dashboard with `?error=unauthorized`, OR access-denied screen | |
| Go to `/spit-braai-delivery/admin/platform/dashboard` | Redirect to dashboard with `?error=unauthorized` | |
| URL hack: paste a CPT order id into `/spit-braai-delivery/admin/orders/<cpt-uuid>` | "Not found" / empty (RLS blocks region_admin from CPT rows) | |

Grab a CPT order id for the URL hack:

```sql
select id from orders
where company_id=(select id from companies where slug='spit-braai-delivery')
  and region_id=(select id from regions where code='CPT' and company_id=(select id from companies where slug='spit-braai-delivery'))
limit 1;
```

Audit-fix gate (Bobby self-test, Window A as company_admin):

```sql
-- Temporarily flip Bobby's role and confirm middleware still admits to /admin/*
update profiles set role='region_admin', active_role='region_admin'
where email='hello@spitbraaidelivery.co.za';
```

Reload `/spit-braai-delivery/admin/leads` -- expect access (no redirect to login). The audit fix added region_admin to ADMIN_PORTAL_ROLES. Then revert immediately:

```sql
update profiles set role='company_admin', active_role='company_admin'
where email='hello@spitbraaidelivery.co.za';
```

Verify revert took:

```sql
select email, role, active_role from profiles where email='hello@spitbraaidelivery.co.za';
-- expect: company_admin / company_admin
```

---

## 5. Money flow check

Public quote acceptance + auto-invoice. From the JHB quote in step 3a, copy the public quote URL (the share link on the quote page).

1. Open the public quote URL in a private window (no auth). Confirm totals:
   - Delivery line uses R12/km, with R100 floor enforced for very short distances.
   - VAT shown at 15% (company default, since neither company nor JHB region overrode).
2. Click **Accept** (or whatever the public flow's accept button is).
3. Window A (company_admin), navigate to `/spit-braai-delivery/admin/orders` with filter set to JHB. New order visible.
4. Open the order. Confirm the auto-generated invoice link.

DB verify:

```sql
with q as (
  select q.* from quotes q
  join clients c on c.id=q.client_id
  where c.email='test+jhb@example.com'
  order by q.created_at desc limit 1
)
select
  q.region_id  as quote_region,
  q.tax_amount as quote_tax,
  q.total_amount as quote_total,
  o.region_id  as order_region,
  o.deposit_percentage,
  o.tax_amount as order_tax,
  i.region_id  as invoice_region,
  i.tax_amount as invoice_tax
from q
left join orders   o on o.quote_id=q.id
left join invoices i on i.order_id=o.id;
-- expect: quote_region = order_region = invoice_region = JHB uuid
-- expect: quote_tax = order_tax = invoice_tax (15% of subtotal+delivery)
-- expect: deposit_percentage = 30
```

---

## 6. Cleanup script

Soft-delete + tidy. Run after a successful pass (or to reset between attempts).

```sql
-- Adjust the email if you used a different test inbox
with c as (select id from companies where slug='spit-braai-delivery'),
     jhb as (select id from regions where company_id=(select id from c) and code='JHB'),
     test_client as (select id from clients where email='test+jhb@example.com')
update invoices set status='void'
  where order_id in (select id from orders where region_id=(select id from jhb));

with c as (select id from companies where slug='spit-braai-delivery'),
     jhb as (select id from regions where company_id=(select id from c) and code='JHB')
update orders set status='cancelled' where region_id=(select id from jhb);

with c as (select id from companies where slug='spit-braai-delivery'),
     jhb as (select id from regions where company_id=(select id from c) and code='JHB')
update quotes set status='archived' where region_id=(select id from jhb);

update leads set status='archived' where email='test+jhb@example.com';

update regions set is_active=false
where company_id=(select id from companies where slug='spit-braai-delivery')
  and code='JHB';

-- Manager profile row
delete from profiles where email='branch-manager-jhb@example.com';
-- NOTE: auth.users row must be deleted via Supabase auth dashboard
-- (admin API is service-role only; not safe to expose here).
```

---

## 7. Screenshot capture list

Capture for the audit log:

- JHB region card with the MTD KPI mini-strip filled in
- Top-bar region filter dropdown open, showing **All branches / Cape Town / Johannesburg** (as company_admin)
- Branch picker on the new-lead form (as JHB region_admin) pre-selected to Johannesburg
- Quote builder distance panel: **From Johannesburg** label, R per km = `12`, min fee R100 hint visible
- Financial dashboard with **Branches** tab active, table showing both branches
- Region badge **JHB** on a row in `/admin/leads` (or `/quotes` / `/orders`) list
- Sidebar (as region_admin) confirming **Branding & Settings** is absent
- Negative test 1: financial-dashboard redirected with `?error=unauthorized`
- Negative test 2: `/admin/platform/dashboard` redirected with `?error=unauthorized`
