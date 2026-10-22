import { test, expect } from '@playwright/test';
for (const width of [1440,390]) test(`two names stay separate at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});await page.goto('/');
  await page.getByLabel('Company / organisation name (optional)').fill('Example International Events Management Company (Pty) Ltd');
  await expect(page.getByLabel('Contact name')).toHaveValue('Sheri Lee Pan');
  await page.getByRole('button',{name:'Save contact'}).click();
  await expect(page.getByRole('status')).toHaveText('Saved both names.');
  await expect(page.getByText('Attention: Sheri Lee Pan')).toBeVisible();
  await expect(page.getByTestId('greeting')).toHaveText('Hi Sheri,');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:`tmp/customer-identity-ui-${width}.png`,fullPage:true});
  await page.getByLabel('Company / organisation name (optional)').fill('');
  await expect(page.getByText('Attention: Sheri Lee Pan')).toHaveCount(0);
  await expect(page.getByTestId('greeting')).toHaveText('Hi Sheri,');
});
