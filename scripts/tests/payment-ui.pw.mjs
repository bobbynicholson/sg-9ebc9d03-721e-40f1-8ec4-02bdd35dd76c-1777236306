import { test, expect } from '@playwright/test';
const token = '00000000-0000-0000-0000-000000000001';
function invoice(online = true) {
  return { id:'00000000-0000-0000-0000-000000000002',public_token:token,invoice_number:'INV-TEST',
    invoice_date:'2026-10-01',due_date:'2099-12-31',total_amount:1000,amount_paid:0,balance_due:1000,status:'sent',
    invoice_data:{eventDate:'2099-12-31',initialPaymentAmount:300,clientName:'Fixture client',items:[]},
    payment_currency:'ZAR',payments:[],payment_options:{provider:online?'yoco':null,online_available:online,eft_available:true},
    companies:{id:'company-fixture',company_name:'Fixture Caterer',email:'owner@example.test',deposit_percent:50,
      bank_name:'Fixture Bank',bank_account_holder:'Fixture Caterer',bank_account_number:'123456789',bank_branch_code:'123456'} };
}
async function setup(page, { online=true, credit=0 } = {}) {
  let current = invoice(online), available=credit;
  const requests=[];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:3106') return route.abort();
    if (url.pathname.startsWith('/api/public/invoices/')) return route.fulfill({json:{invoice:current}});
    if (url.pathname==='/api/payments/credit-balance') return route.fulfill({json:{ok:true,available,maxApplicable:available}});
    if (url.pathname==='/api/payments/confirm-return') return route.fulfill({json:{ok:true,status:'pending'}});
    if (url.pathname==='/api/payments/claim-eft') { requests.push(route.request().postDataJSON()); return route.fulfill({json:{ok:true,payment_id:'claim-fixture'}}); }
    // Unhandled APIs cannot reach the server or real services.
    if (url.pathname.startsWith('/api/')) return route.fulfill({status:503,json:{error:'Offline UI fixture'}});
    return route.continue();
  });
  return { requests, update:(patch)=>{current={...current,...patch};}, credit:(amount)=>{available=amount;} };
}
test('EFT shows this company bank and a submitted claim stays unpaid awaiting review',async({page})=>{
  const fixture=await setup(page,{online:false}); await page.goto(`/pay/i/${token}`);
  await expect(page.getByText('Fixture Bank',{exact:true})).toBeVisible();
  await expect(page.getByText('123456789',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Pay .* now/})).toBeDisabled();
  await page.getByRole('button',{name:/made this EFT payment/}).click();
  await expect(page.getByRole('button',{name:'Confirmation sent for review'})).toBeDisabled();
  expect(fixture.requests).toHaveLength(1); expect(fixture.requests[0].claimed_amount).toBe(300);
  await expect(page.getByText(/Paid in full|nothing further to pay/i)).toHaveCount(0);
});
test('credit covering a selected partial payment shows the remaining invoice balance',async({page})=>{
  await setup(page,{credit:150});
  await page.route('**/api/payments/create-session',route=>route.fulfill({json:{ok:true,provider:'store_credit',settled:false,
    creditApplied:100,amountPaid:100,balanceDue:900,invoiceStatus:'partially_paid'}}));
  await page.goto(`/pay/i/${token}`); await page.locator('#pay-amount').fill('100');
  await page.getByRole('button',{name:/Settle with.*100.*credit/}).click();
  await expect(page.getByText(/Store credit payment recorded:.*100/)).toBeVisible();
  await expect(page.getByText(/Remaining invoice balance:.*900/)).toBeVisible();
  await expect(page.getByText(/nothing further to pay/)).toHaveCount(0);
});
test('return with an unresolved attempt blocks another online checkout',async({page})=>{
  await setup(page); await page.goto(`/pay/i/${token}?cancelled=1&payment_attempt_id=${token}`);
  await expect(page.locator('#pay-amount')).toHaveValue('300');
  await expect(page.getByRole('button',{name:/Pay .* now/})).toBeDisabled();
});
test('retrying the same selected credit payment retains its request UUID',async({page})=>{
  await setup(page,{credit:100}); const requests=[];
  await page.route('**/api/payments/create-session',async route=>{
    requests.push(route.request().postDataJSON());
    return route.fulfill(requests.length===1?{status:503,json:{error:'Temporarily unavailable'}}:
      {json:{ok:true,provider:'store_credit',settled:false,creditApplied:100,amountPaid:100,balanceDue:900,invoiceStatus:'partially_paid'}});
  });
  await page.goto(`/pay/i/${token}`); await page.locator('#pay-amount').fill('100');
  await page.getByRole('button',{name:/Settle with.*100.*credit/}).click();
  await expect(page.getByText(/Temporarily unavailable/)).toBeVisible();
  await page.getByRole('button',{name:/Settle with.*100.*credit/}).click();
  await expect(page.getByText(/Store credit payment recorded/)).toBeVisible();
  expect(requests).toHaveLength(2); expect(requests[0].checkout_request_id).toBe(requests[1].checkout_request_id);
});
test('committed credit remains visible when gateway creation fails',async({page})=>{
  const fixture=await setup(page,{credit:100});
  await page.route('**/api/payments/create-session',route=>{
    fixture.update({amount_paid:100,balance_due:900,status:'partially_paid'}); fixture.credit(0);
    return route.fulfill({status:503,json:{error:'Gateway unavailable',creditApplied:100,creditPaymentId:'credit-fixture'}});
  });
  await page.goto(`/pay/i/${token}`);
  await page.getByRole('button',{name:/Pay .*200.* now/}).click();
  await expect(page.getByText(/Store credit payment recorded/)).toBeVisible();
  await expect(page.getByText(/Remaining invoice balance:.*900/)).toBeVisible();
  await expect(page.getByText(/nothing further to pay/)).toHaveCount(0);
});
