import { fileURLToPath } from 'node:url';
import { defineConfig, chromium } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'customer-identity-ui.pw.mjs',workers:1,timeout:30000,reporter:'list',outputDir:'../../tmp/customer-identity-ui-results',use:{baseURL:'http://127.0.0.1:3109',browserName:'chromium',launchOptions:{executablePath:chromium.executablePath()}},webServer:{cwd:fileURLToPath(new URL('../../',import.meta.url)),command:'node scripts/tests/customer-identity-ui-server.mjs',url:'http://127.0.0.1:3109',reuseExistingServer:false,timeout:60000}});
