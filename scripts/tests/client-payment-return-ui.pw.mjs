import { test, expect } from '@playwright/test';

const token = '00000000-0000-0000-0000-000000000001';
const orderId = '00000000-0000-0000-0000-000000000003';
const bookingUrl = `/fixture/c/order/${orderId}?t=offline-order-token`;
async function setup(page, status = 'pending') {
  const state = { status, invoiceReads: 0, failRefresh: false, rejectAcceptance: false, lostAcceptanceResponse: false, acceptanceRequests: [], changeRequests: [],
    invoice: { id: token, public_token: token, invoice_number: 'INV-RETURN', invoice_date: '2026-10-01',
      due_date: '2099-12-31', total_amount: 1000, amount_paid: 0, balance_due: 1000, status: 'sent',
      invoice_data: { eventDate: '2099-12-31', initialPaymentAmount: 300, clientName: 'Fixture client', items: [] },
      payment_currency: 'ZAR', payments: [], payment_options: { provider: 'yoco', online_available: true, eft_available: false },
      companies: { id: 'fixture-company', company_name: 'Fixture Caterer', deposit_percent: 50 } },
    quote: { id: token, quote_number: 'QUO-RETURN', client_name: 'Fixture client', event_date: '2099-12-31', event_time: '13:00',
      guest_count: 60, menu_items: [], equipment_items: [], subtotal: 1000, tax_amount: 0, total_amount: 1000,
      total: 1000, initial_payment_amount: 5, deposit_percentage: 50, status: 'sent', valid_until: '2099-12-31',
      converted_to_order_id: null, accepted_at: null, pending_change_request: false,
      event_capacity: { status: 'available', accepting_blocked: false },
      payment_options: { provider: 'yoco', online_available: true, eft_available: false },
      company: { id: 'fixture-company', slug: 'fixture', company_name: 'Fixture Caterer', currency: 'ZAR', vat_registered: false } } };
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    // This test can only use the local fixture server; it never calls a merchant, database or email service.
    if (url.origin !== 'http://127.0.0.1:3106') return route.abort();
    if (url.pathname.startsWith('/api/public/invoices/')) {
      state.invoiceReads += 1;
      return state.failRefresh && state.returnChecked
        ? route.fulfill({ status: 503, json: { error: 'Balance refresh unavailable' } })
        : route.fulfill({ json: { invoice: state.invoice } });
    }
    if (url.pathname.endsWith('/get') && url.pathname.startsWith('/api/public/quotes/')) return route.fulfill({ json: { ok: true, quote: state.quote } });
    if (url.pathname.endsWith('/change-request')) {
      state.changeRequests.push(route.request().postDataJSON());
      state.quote.pending_change_request = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname.endsWith('/catalogue')) return route.fulfill({ json: { ok: true, menu: [], equipment: [] } });
    if (url.pathname.endsWith('/accept') && url.pathname.startsWith('/api/public/quotes/')) {
      const request = route.request().postDataJSON(); state.acceptanceRequests.push(request);
      if (state.rejectAcceptance) return route.fulfill({ status: 409, json: { ok: false, error: 'The event date is no longer available.' } });
      state.quote = { ...state.quote, status: 'accepted', accepted_at: '2026-10-04T00:00:00Z', converted_to_order_id: orderId,
        service_sittings: (request.serviceSittings || []).map((s, index) => ({ sequence_number: index + 1, guest_count: s.guestCount, service_time: s.serviceTime })) };
      if (state.lostAcceptanceResponse) return route.fulfill({ status: 504, json: { ok: false, error: 'Response interrupted' } });
      return route.fulfill({ json: { ok: true, orderId } });
    }
    if (url.pathname.endsWith('/order-link')) return route.fulfill({ json: { ok: true, converted: true, url: bookingUrl } });
    if (url.pathname === '/api/payments/confirm-return') {
      state.returnChecked = true;
      return route.fulfill({ json: { ok: true, status: state.status } });
    }
    if (url.pathname === '/api/payments/credit-balance') return route.fulfill({ json: { ok: true, available: 0, maxApplicable: 0 } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'Offline fixture' } });
    return route.continue();
  });
  return state;
}

test('accepting a quote exposes the booking/payment link and automatically opens the booking', async ({ page }) => {
  await setup(page);
  await page.goto(`/q/${token}`);
  await page.getByRole('button', { name: 'Accept this quote', exact: true }).click();
  await page.getByPlaceholder('Your full name').fill('Fixture client');
  await page.getByRole('button', { name: 'Accept quote', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View your booking and payment' })).toBeVisible();
  await expect(page.getByText(/booking still needs the agreed payment/)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/fixture/c/order/${orderId}`), { timeout: 15000 });
});

test('failed acceptance keeps the quote actionable and never presents a booking as accepted', async ({ page }) => {
  const state = await setup(page); state.rejectAcceptance = true;
  await page.goto(`/q/${token}?stay=1`);
  await page.getByRole('button', { name: 'Accept this quote', exact: true }).click();
  await page.getByPlaceholder('Your full name').fill('Fixture client');
  await page.getByRole('button', { name: 'Accept quote', exact: true }).click();
  await expect(page.getByText('The event date is no longer available.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'View your booking and payment' })).toHaveCount(0);
});

test('two sittings validate before acceptance and save the exact guest split and times', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`/q/${token}?stay=1`);
  await page.getByRole('button', { name: 'Accept this quote', exact: true }).click();
  await page.getByPlaceholder('Your full name').fill('Fixture client');
  await page.getByLabel('Two sittings', { exact: true }).check();
  await page.getByLabel('First guests', { exact: true }).fill('20');
  await page.getByLabel('First time', { exact: true }).fill('12:00');
  await page.getByRole('button', { name: 'Accept quote', exact: true }).click();
  await expect(page.getByText('Every sitting needs a valid service time.', { exact: true })).toBeVisible();
  expect(state.acceptanceRequests).toHaveLength(0);
  await page.getByLabel('Second time', { exact: true }).fill('18:00');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View your booking and payment' })).toBeVisible();
  expect(state.acceptanceRequests[0].serviceSittings).toEqual([{ guestCount: 20, serviceTime: '12:00' }, { guestCount: 40, serviceTime: '18:00' }]);
});

test('a lost response after saving both sittings shows verified success instead of a false save error', async ({ page }) => {
  const state = await setup(page); state.lostAcceptanceResponse = true;
  await page.goto(`/q/${token}?stay=1`);
  await page.getByRole('button', { name: 'Accept this quote', exact: true }).click();
  await page.getByPlaceholder('Your full name').fill('Fixture client');
  await page.getByLabel('Two sittings', { exact: true }).check();
  await page.getByLabel('First time', { exact: true }).fill('12:00');
  await page.getByLabel('Second time', { exact: true }).fill('18:00');
  await page.getByRole('button', { name: 'Accept quote', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View your booking and payment' })).toBeVisible();
  await expect(page.getByText('Response interrupted', { exact: true })).toHaveCount(0);
  expect(state.quote.service_sittings).toHaveLength(2);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`requesting two sittings validates the revised guest split at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const state = await setup(page);
    await page.goto(`/q/${token}?stay=1`);
    await page.getByRole('button', { name: 'Need a tweak', exact: true }).click();
    await page.getByLabel('New guest count (optional)', { exact: true }).fill('100');
    await page.getByLabel('Two sittings', { exact: true }).check();
    await page.getByLabel('First guests', { exact: true }).fill('40');
    await page.getByLabel('First time', { exact: true }).fill('12:00');
    await page.getByRole('button', { name: 'Send to caterer', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Every sitting needs a valid service time.' })).toBeVisible();
    expect(state.changeRequests).toHaveLength(0);
    await page.getByLabel('Second time', { exact: true }).fill('18:00');
    await page.getByRole('group', { name: 'Serving times (optional)' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `tmp/quote-serving-times-${viewport.width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Send to caterer', exact: true }).click();
    await expect(page.getByText("Your message has been sent. They'll usually reply within a working day.", { exact: true })).toBeVisible();
    expect(state.changeRequests).toHaveLength(1);
    expect(state.changeRequests[0].requestedChanges).toMatchObject({ guest_count: 100, service_sittings: [{ guestCount: 40, serviceTime: '12:00' }, { guestCount: 60, serviceTime: '18:00' }] });
    expect(state.acceptanceRequests).toHaveLength(0);
  });
}

test('the approved two-sitting plan is shown and prefilled for acceptance', async ({ page }) => {
  const state = await setup(page);
  state.quote.service_sittings = [{ sequence_number: 1, guest_count: 20, service_time: '11:30:00' }, { sequence_number: 2, guest_count: 40, service_time: '18:00:00' }];
  await page.goto(`/q/${token}?stay=1`);
  await expect(page.getByText('Serving times', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Accept this quote', exact: true }).click();
  await expect(page.getByLabel('Two sittings', { exact: true })).toBeChecked();
  await expect(page.getByLabel('First guests', { exact: true })).toHaveValue('20');
  await expect(page.getByLabel('First time', { exact: true })).toHaveValue('11:30');
  await expect(page.getByLabel('Second time', { exact: true })).toHaveValue('18:00');
  await page.getByPlaceholder('Your full name').fill('Fixture client');
  await page.getByRole('button', { name: 'Accept quote', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View your booking and payment' })).toBeVisible();
  expect(state.acceptanceRequests[0].serviceSittings).toEqual([{ guestCount: 20, serviceTime: '11:30' }, { guestCount: 40, serviceTime: '18:00' }]);
});

test('an unrelated change request leaves the existing serving plan unchanged', async ({ page }) => {
  const state = await setup(page);
  state.quote.service_sittings = [{ sequence_number: 1, guest_count: 20, service_time: '12:00:00' }, { sequence_number: 2, guest_count: 40, service_time: '18:00:00' }];
  await page.goto(`/q/${token}?stay=1`);
  await page.getByRole('button', { name: 'Need a tweak', exact: true }).click();
  await page.getByLabel('What would you like changed?', { exact: true }).fill('Please add a vegetarian dessert option.');
  await page.getByRole('button', { name: 'Send to caterer', exact: true }).click();
  await expect(page.getByText("Your message has been sent. They'll usually reply within a working day.", { exact: true })).toBeVisible();
  expect(state.changeRequests[0].requestedChanges.service_sittings).toBeNull();
});

test('a verified partial payment returns automatically and shows the unpaid remainder', async ({ page }) => {
  const state = await setup(page, 'succeeded');
  state.invoice = { ...state.invoice, amount_paid: 5, balance_due: 995, status: 'partially_paid' };
  await page.goto(`/pay/i/${token}/success?payment_attempt_id=${token}`);
  await expect(page.getByRole('heading', { name: 'Payment received', exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/pay/i/${token}\\?payment_return=1`), { timeout: 15000 });
  await expect(page.getByText('The provider confirmed your payment. This invoice has been refreshed.')).toBeVisible();
  await expect(page.locator('#pay-amount')).toHaveValue('295');
  await expect(page.getByRole('button', { name: /Pay .*295.* now/ })).toBeEnabled();
  await expect(page.getByText(/settled in full/)).toHaveCount(0);
});

for (const status of ['failed', 'expired']) {
  test(`${status} checkout returns automatically and permits a fresh payment without crediting money`, async ({ page }) => {
    await setup(page, status);
    await page.goto(`/pay/i/${token}/success?payment_attempt_id=${token}`);
    await expect(page).toHaveURL(new RegExp(`/pay/i/${token}\\?payment_return=1`), { timeout: 15000 });
    await expect(page.getByText(status === 'failed'
      ? 'The provider confirmed this checkout did not complete. You can try again.'
      : 'This checkout expired before payment was confirmed. You can start a new checkout.')).toBeVisible();
    await expect(page.locator('#pay-amount')).toHaveValue('300');
    await expect(page.getByRole('button', { name: /Pay .*300.* now/ })).toBeEnabled();
    await expect(page.getByText(/settled in full/)).toHaveCount(0);
  });
}

test('cancelled browser return stays pending and blocked until the provider later confirms success', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`/pay/i/${token}?cancelled=1&payment_attempt_id=${token}`);
  await expect(page.getByText(/provider has not confirmed this checkout yet/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay .* now/ })).toBeDisabled();
  state.status = 'succeeded';
  state.invoice = { ...state.invoice, amount_paid: 5, balance_due: 995, status: 'partially_paid' };
  await expect(page.getByText('The provider confirmed your payment. This invoice has been refreshed.')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#pay-amount')).toHaveValue('295');
  await expect(page.getByRole('button', { name: /Pay .*295.* now/ })).toBeEnabled();
});

test('confirmed payment with a failed balance refresh keeps stale checkout blocked', async ({ page }) => {
  const state = await setup(page, 'succeeded'); state.failRefresh = true;
  await page.goto(`/pay/i/${token}?payment_return=1&payment_attempt_id=${token}`);
  await expect(page.getByText(/payment was confirmed.*Reload this invoice/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay .* now/ })).toBeDisabled();
});

test('full settlement shows the paid invoice and removes checkout', async ({ page }) => {
  const state = await setup(page, 'succeeded');
  state.invoice = { ...state.invoice, amount_paid: 1000, balance_due: 0, status: 'paid' };
  await page.goto(`/pay/i/${token}?payment_return=1&payment_attempt_id=${token}`);
  await expect(page.getByText(/this invoice is settled in full/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay .* now/ })).toHaveCount(0);
});
