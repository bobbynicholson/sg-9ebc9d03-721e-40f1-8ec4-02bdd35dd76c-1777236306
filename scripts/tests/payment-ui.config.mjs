import { defineConfig, chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: '.', testMatch: ['payment-ui.pw.mjs', 'client-payment-return-ui.pw.mjs'], fullyParallel: false, workers: 1, timeout: 60000,
  outputDir: '../../tmp/payment-ui-results', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3106', browserName: 'chromium',
    launchOptions: { executablePath: chromium.executablePath() },
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/tests/payment-ui-server.mjs', cwd: fileURLToPath(new URL('../../',import.meta.url)), url: 'http://127.0.0.1:3106',
    reuseExistingServer: false, timeout: 120000 },
});
