import { readFile, writeFile } from 'node:fs/promises';
const files = [
  '20260925150000_payment_attempts_and_gateway_requirements.sql',
  '20261001000000_payment_webhook_idempotency_guard.sql',
  '20261003110000_add_quote_initial_payment_amount.sql',
  '20261003120000_update_payment_request_email_summary.sql',
  '20261003130000_sync_order_financials_from_invoice.sql',
  '20261003140000_atomic_payment_settlement.sql',
  '20261003150000_payment_recovery_workers.sql',
  '20261003160000_checkout_gateway_credential_versions.sql',
  '20261003170000_atomic_company_gateway_configuration.sql',
  '20261003180000_financial_write_permissions.sql',
  '20261004090000_idempotent_store_credit_checkout.sql',
  '20261004100000_refund_reconciliation_and_receipts.sql',
];
let sql = '-- Payment-attempt/webhook prerequisites plus the latest company quote/payment migrations.\n' +
  '-- Run this bundle OR the individual files, never both. See docs/payment-migrations-how-to-run.md.\nBEGIN;\n';
for (const name of files) {
  const source = await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url),'utf8');
  sql += `\n-- Source: ${name}\n${source.replace(/\r\n/g,'\n').trimEnd()}\n\n`;
}
sql += 'COMMIT;\n';
const target = new URL('../LOCAL_PAYMENT_MIGRATIONS.sql',import.meta.url);
if (process.argv.includes('--check')) {
  if ((await readFile(target,'utf8')).replace(/\r\n/g,'\n') !== sql) throw new Error('Payment migration bundle differs from source files. Run node scripts/build-payment-migration-bundle.mjs');
  process.stdout.write(`Payment bundle matches all ${files.length} source migrations.\n`);
} else {
  await writeFile(target,sql); process.stdout.write(`Wrote payment bundle with ${files.length} migrations.\n`);
}
