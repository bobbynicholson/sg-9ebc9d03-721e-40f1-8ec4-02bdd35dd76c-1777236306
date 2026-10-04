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
function quote() {
  return { id:'00000000-0000-0000-0000-000000000003',updated_at:'2026-10-04T00:00:00Z',quote_number:'QUO-TEST',
    quote_name:'Test wedding',client_name:'Fixture client',event_date:'2026-10-29',event_time:'12:09',setup_time:'11:39',
    guest_count:60,venue_address:'Fixture venue',menu_items:[{description:'Baby potatoes',quantity:60,unit_price:7.5,total:450}],
    equipment_items:[],notes:null,terms_and_conditions:null,subtotal:450,tax_amount:0,discount_amount:0,total:450,total_amount:450,
    deposit_percentage:50,initial_payment_amount:1,status:'sent',valid_until:'2026-11-03',sent_at:'2026-10-04T00:00:00Z',
    viewed_at:'2026-10-04T00:00:00Z',accepted_at:null,converted_to_order_id:null,pending_change_request:false,
    event_capacity:{status:'available',accepting_blocked:false,message:null},
    payment_options:{provider:'payfast',online_available:true,unavailable_reason:null,eft_available:true},
    company:{id:'company-fixture',slug:'fixture',company_name:'Fixture Caterer',logo_url:null,email:'owner@example.test',phone:'0820000000',
      address_line1:'1 Fixture Road',address_line2:null,city:'Cape Town',vat_registered:false,vat_number:null,vat_rate:15,
      primary_color:'#512010',secondary_color:'#ffffff',accent_color:'#c60c30',brand_font_body:null,brand_font_display:null,currency:'ZAR',
      bank_name:'Fixture Bank',bank_account_holder:'Fixture Caterer',bank_account_number:'123456789',bank_branch_code:'123456',
      bank_account_type:'cheque',eft_instructions:'Use the invoice number as reference.'} };
}
async function setup(page, { online=true, credit=0 } = {}) {
  let current = invoice(online), available=credit;
  const requests=[];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:3106') return route.abort();
    if (url.pathname.startsWith('/api/public/invoices/')) return route.fulfill({json:{invoice:current}});
    if (url.pathname.startsWith('/api/public/quotes/') && url.pathname.endsWith('/get')) return route.fulfill({json:{ok:true,quote:quote()}});
    if (url.pathname==='/api/payments/credit-balance') return route.fulfill({json:{ok:true,available,maxApplicable:available}});
    if (url.pathname==='/api/payments/confirm-return') return route.fulfill({json:{ok:true,status:'pending'}});
    if (url.pathname==='/api/payments/claim-eft-proof') { requests.push({contentType:route.request().headers()['content-type']}); return route.fulfill({json:{ok:true,payment_id:'claim-fixture'}}); }
    // Unhandled APIs cannot reach the server or real services.
    if (url.pathname.startsWith('/api/')) return route.fulfill({status:503,json:{error:'Offline UI fixture'}});
    return route.continue();
  });
  return { requests, update:(patch)=>{current={...current,...patch};}, credit:(amount)=>{available=amount;} };
}
test('EFT shows this company bank and requires proof before a claim stays pending review',async({page})=>{
  const fixture=await setup(page,{online:false}); await page.goto(`/pay/i/${token}`);
  await expect(page.getByText('Fixture Bank',{exact:true})).toBeVisible();
  await expect(page.getByText('123456789',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Pay .* now/})).toBeDisabled();
  const submit=page.getByRole('button',{name:/Send payment proof for review/});
  await expect(submit).toBeDisabled();
  await page.locator('input[type=file]').setInputFiles({name:'transfer.png',mimeType:'image/png',buffer:Buffer.from('proof fixture')});
  await submit.click();
  await expect(page.getByRole('button',{name:'Confirmation sent for review'})).toBeDisabled();
  expect(fixture.requests).toHaveLength(1); expect(fixture.requests[0].contentType).toContain('multipart/form-data');
  await expect(page.getByText(/Paid in full|nothing further to pay/i)).toHaveCount(0);
});
test('online provider is the only public method when checkout is active',async({page})=>{
  await setup(page,{online:true}); await page.goto(`/pay/i/${token}`);
  await expect(page.getByText('Pay online with Yoco.')).toBeVisible();
  await expect(page.getByText('Fixture Bank',{exact:true})).toHaveCount(0);
  await expect(page.getByText('123456789',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Pay by EFT',{exact:true})).toHaveCount(0);
});
test('quote with active PayFast checkout hides the EFT option and bank details',async({page})=>{
  await setup(page); await page.goto(`/q/${token}?stay=1`);
  await expect(page.getByText(/pay online with PayFast/i)).toBeVisible();
  await expect(page.getByText('Pay by EFT',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Fixture Bank',{exact:true})).toHaveCount(0);
  await expect(page.getByText('123456789',{exact:true})).toHaveCount(0);
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
