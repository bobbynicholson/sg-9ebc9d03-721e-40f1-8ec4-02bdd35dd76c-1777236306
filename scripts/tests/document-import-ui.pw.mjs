import {test,expect} from '@playwright/test';
test.beforeEach(async({request,page})=>{page.on('pageerror',e=>console.error('Fixture page:',e.message));await request.get('/fixture-reset');});
for(const width of [1440,390])test(`PDF review is usable at ${width}px, retains corrections and exposes setup CTA`,async({page,request})=>{
 await page.setViewportSize({width,height:1000});await page.goto('/?review=1');
 await expect(page.getByRole('heading',{name:'Annual team lunch',exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Contact name *',{exact:true})).toHaveValue('Jane Example');
 await expect(page.getByLabel('Billing company',{exact:true})).toHaveValue('Example Events Ltd');
 await expect(page.getByLabel('Catalogue match').first()).toHaveValue('00000000-0000-0000-0000-000000000004');
 await expect(page.getByRole('button',{name:'Create order and catalogue items'})).toBeDisabled();
 await page.screenshot({path:`tmp/document-import-${width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('Service time *',{exact:true}).fill('12:00');
 await page.getByLabel('Equipment return method',{exact:true}).selectOption('driver_same_day');
 await page.getByLabel('Physical quantity you own *').fill('6');
 await page.getByLabel('Cleaning minutes per item').fill('5');
 await page.getByRole('button',{name:'Save corrections'}).click();
 await expect(page.getByRole('status')).toContainText('Corrections saved');
 await page.getByRole('checkbox',{name:/I checked the customer/}).check();
 await expect(page.getByRole('button',{name:'Create order and catalogue items'})).toBeEnabled();
 await page.getByRole('button',{name:'Create order and catalogue items'}).click();
 await expect(page.getByRole('heading',{name:'Complete setup before using this booking'})).toBeVisible();
 const state=await(await request.get('/fixture-state')).json();expect(state.lastReview.fields.client_company_name).toBe('Example Events Ltd');expect(state.lastReview.items[1].owned_quantity).toBe(6);
 await page.getByRole('button',{name:'Recheck and complete setup'}).click();
 await expect(page.getByRole('heading',{name:'Import setup complete'})).toBeVisible();
});
test('file and folder upload entry points are findable',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Choose PDFs'})).toBeVisible();await expect(page.getByRole('button',{name:'Choose folder'})).toBeVisible();await expect(page.getByLabel('Create records in')).toHaveValue('quotes');
});
test('later operational use shows a persistent banner and direct setup link',async({page})=>{
 await page.goto('/?banner=1');await expect(page.getByRole('alert')).toContainText('Complete imported details first');await expect(page.getByRole('link',{name:'Complete setup',exact:true})).toHaveAttribute('href',/document-imports\?job=/);
});
