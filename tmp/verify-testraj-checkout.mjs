import nextEnv from '@next/env';
import { createServerClient } from '@supabase/ssr';
nextEnv.loadEnvConfig(process.cwd(), true);
const jar = [];
const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: { getAll: () => jar, setAll: values => {
    for (const value of values) {
      const index = jar.findIndex(cookie => cookie.name === value.name);
      if (index >= 0) jar[index] = value; else jar.push(value);
    }
  } },
});
const { error } = await db.auth.signInWithPassword({ email: 'rajm267748@gmail.com', password: process.env.TESTRAJ_PASSWORD });
if (error) throw error;
console.log('testraj owner login: OK');
const response = await fetch('http://localhost:3001/api/subscription/create-session', {
  method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://cateringms.com', cookie: jar.map(c => `${c.name}=${c.value}`).join('; ') },
  body: JSON.stringify({ planId: 'starter', cycle: 'monthly' }),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
console.log(JSON.stringify({ checkoutStatus: response.status,
  initialAmount: result.html.match(/name="amount" value="([^"]+)/)?.[1],
  recurringAmount: result.html.match(/name="recurring_amount" value="([^"]+)/)?.[1],
  liveCheckout: result.html.includes('https://www.payfast.co.za/eng/process'), paymentSubmitted: false,
}));
