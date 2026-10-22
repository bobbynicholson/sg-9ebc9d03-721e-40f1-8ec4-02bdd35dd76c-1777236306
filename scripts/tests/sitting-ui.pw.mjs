import { test, expect } from '@playwright/test';
for(const viewport of [{width:1440,height:1000},{width:390,height:844}])test(`quote review and independent sitting trip choices at ${viewport.width}px`,async({page})=>{
  await page.setViewportSize(viewport);await page.goto('/');
  await expect(page.locator('main > section').first().getByLabel('Sitting 2 service time')).toHaveValue('04:30');
  await page.locator('main > section').first().getByLabel('Sitting 2 service time').fill('18:00');
  await expect(page.locator('main > section').first().getByLabel('Sitting 1 service time')).toHaveValue('12:00');
  await page.getByRole('combobox',{name:'Equipment returns',exact:true}).selectOption('per_sitting_collection');
  const articles=page.locator('article');await expect(articles).toHaveCount(2);
  await articles.nth(0).getByRole('group',{name:'Delivery drivers',exact:true}).getByLabel('Thabo').check();
  await articles.nth(1).getByRole('group',{name:'Delivery drivers',exact:true}).getByLabel('Zanele').check();
  await articles.nth(0).getByRole('group',{name:'Collection drivers',exact:true}).getByLabel('Noah').check();
  await articles.nth(1).getByRole('group',{name:'Collection drivers',exact:true}).getByLabel('Zanele').check();
  const pending=page.waitForRequest(r=>r.url().includes('/api/orders/')&&r.method()==='POST');
  await page.getByRole('button',{name:'Save sitting schedule',exact:true}).click();
  const request=await pending;const payload=request.postDataJSON();
  expect(payload.returnPlan).toBe('per_sitting_collection');expect(payload.sittings[0].deliveryDriverIds).toEqual(['d1']);expect(payload.sittings[0].collectionDriverIds).toEqual(['d3']);expect(payload.sittings[1].deliveryDriverIds).toEqual(['d2']);expect(payload.sittings[1].collectionDriverIds).toEqual(['d2']);
  await expect(page.getByRole('alert')).toContainText('another trip within 45 minutes');
  await expect(articles.nth(1).getByRole('group',{name:'Delivery drivers',exact:true}).getByLabel('Zanele')).toBeChecked();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`tmp/sitting-ui-${viewport.width}.png`,fullPage:true});
});
for(const viewport of [{width:1440,height:1000},{width:390,height:844}])test(`admin can split an existing booked order at ${viewport.width}px`,async({page})=>{
  await page.setViewportSize(viewport);await page.goto('/?legacy=1');
  const schedule=page.getByRole('region',{name:'Service sittings & trips'});
  await schedule.getByRole('button',{name:'Split into two sittings',exact:true}).click();
  await expect(schedule.getByLabel('Sitting 1 guests',{exact:true})).toHaveValue('50');
  await expect(schedule.getByLabel('Sitting 2 guests',{exact:true})).toHaveValue('50');
  await expect(schedule.getByLabel('Sitting 2 service time',{exact:true})).toHaveValue('');
  await schedule.getByLabel('Sitting 2 service time',{exact:true}).fill('18:00');
  await schedule.getByRole('combobox',{name:'Equipment returns',exact:true}).selectOption('per_sitting_collection');
  const articles=schedule.locator('article');
  for(const [index,time] of ['11:00','17:00'].entries()){
    await articles.nth(index).getByLabel('Depart kitchen at',{exact:true}).fill(time);
    await articles.nth(index).getByLabel('Equipment collection time',{exact:true}).fill(index?'22:00':'15:00');
    await articles.nth(index).getByRole('group',{name:'Delivery drivers',exact:true}).getByLabel(index?'Zanele':'Thabo').check();
  }
  const pending=page.waitForRequest(r=>r.url().includes('/api/orders/')&&r.method()==='POST');
  await schedule.getByRole('button',{name:'Save sitting schedule',exact:true}).click();
  const payload=(await pending).postDataJSON();
  expect(payload.sittings.map(s=>[s.guest_count,s.service_time])).toEqual([[50,'12:00'],[50,'18:00']]);
  expect(payload.sittings[0].id).not.toBe(payload.sittings[1].id);
  await expect(schedule.getByRole('alert')).toContainText('another trip within 45 minutes');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`tmp/sitting-ui-legacy-${viewport.width}.png`,fullPage:true});
});
