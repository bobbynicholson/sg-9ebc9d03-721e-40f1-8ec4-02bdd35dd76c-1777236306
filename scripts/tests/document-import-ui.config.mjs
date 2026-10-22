import { defineConfig, chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({testDir:'.',testMatch:'document-import-ui.pw.mjs',workers:1,timeout:30000,reporter:'list',outputDir:'../../tmp/document-import-ui-results',use:{baseURL:'http://127.0.0.1:3108',browserName:'chromium',launchOptions:{executablePath:chromium.executablePath()}},webServer:{cwd:fileURLToPath(new URL('../../',import.meta.url)),command:'node scripts/tests/document-import-ui-server.mjs',url:'http://127.0.0.1:3108',reuseExistingServer:false,timeout:60000}});
