import { spawn } from 'node:child_process';
if (!process.env.PAYMENT_TEST_DATABASE_URL) {
  throw new Error('Set PAYMENT_TEST_DATABASE_URL to an isolated local PostgreSQL database named payment_fixture. No .env file is loaded.');
}
const child = spawn(process.execPath, ['--test','scripts/tests/payment-settlement.test.mjs'], { stdio:'inherit', env:process.env });
child.on('exit', code => { process.exitCode=code ?? 1; });
