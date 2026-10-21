/** Repair unpaid event invoice dates without changing payments or sending email.
 * Dry run: node scripts/fix-invoice-due-dates.mjs --company-id <uuid>
 * Apply:   node scripts/fix-invoice-due-dates.mjs --company-id <uuid> --apply
 * Optional: --order-id <uuid>. Originals are backed up before every apply.
 */
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { register } from 'node:module';
import { createClient } from '@supabase/supabase-js';
register('./tests/pdf-source-loader.mjs', import.meta.url);
const { reconcileCompanyInvoiceDueDates } = await import('../src/services/invoiceDueDateService.ts');
const args = process.argv.slice(2);
const option = (name) => { const i=args.indexOf(name); return i >= 0 ? args[i+1] : undefined; };
const companyId = option('--company-id');
if (!companyId || !/^[a-f0-9-]{36}$/i.test(companyId)) throw new Error('--company-id <uuid> is required');
const orderId = option('--order-id');
const apply = args.includes('--apply');
const local = Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')&&line.includes('=')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i).trim(),line.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || local.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || local.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const plan = await reconcileCompanyInvoiceDueDates(db, companyId, { orderId, dryRun: true });
for (const row of plan.corrections) console.log(`${row.invoiceNumber}: ${row.previousDueDate} -> ${row.dueDate}; ${row.previousStatus} -> ${row.status}`);
console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY RUN', scanned: plan.scanned, corrections: plan.corrections.length }));
if (apply && plan.corrections.length) {
  const invoices = [];
  const orders = [];
  for (let offset=0; offset<plan.corrections.length; offset+=100) {
    const batch=plan.corrections.slice(offset,offset+100);
    const [invoiceResult, orderResult]=await Promise.all([
      db.from('invoices').select('id,order_id,invoice_number,invoice_date,due_date,status,invoice_data,updated_at,total_amount,amount_paid,balance_due').eq('company_id',companyId).in('id',batch.map(row=>row.invoiceId)),
      db.from('orders').select('id,event_date,balance_due_date,updated_at').eq('company_id',companyId).in('id',[...new Set(batch.map(row=>row.orderId))]),
    ]);
    if(invoiceResult.error || orderResult.error) throw new Error(invoiceResult.error?.message || orderResult.error.message);
    invoices.push(...invoiceResult.data); orders.push(...orderResult.data);
  }
  await mkdir('tmp/invoice-due-date-audit',{recursive:true});
  const backup=`tmp/invoice-due-date-audit/before-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  await writeFile(backup,JSON.stringify({companyId,plan,invoices,orders},null,2));
  const result=await reconcileCompanyInvoiceDueDates(db,companyId,{orderId});
  await writeFile(backup.replace('before-','result-'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({updatedInvoices:result.updatedInvoices,updatedOrders:result.updatedOrders,backup}));
}
