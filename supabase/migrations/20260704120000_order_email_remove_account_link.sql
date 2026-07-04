-- Remove the second ("See all your past + upcoming bookings") account/magic
-- link from the booking-confirmed + status-update customer emails.
--
-- Rationale (Raj, 2026-07-04): the /c/account?t=acc_... magic link is broken
-- (the acc_ token fails validation) AND unwanted -- customers should not need
-- login credentials. The only link in these emails should be the token-gated
-- "View / track / pay" order link, which works.
--
-- The trg_order_email trigger only mints the account token + appends the
-- second link when email_provider_settings.magic_link_repeat_customers is
-- true. Turning that flag off is a clean, low-risk way to suppress the link
-- without rewriting the function body (which was fragile to paste in the SQL
-- editor). This was already applied live via the service role on 2026-07-04;
-- this migration keeps it durable across any restore / migration re-run.
UPDATE public.email_provider_settings
   SET magic_link_repeat_customers = false
 WHERE magic_link_repeat_customers = true;
