import { fileURLToPath } from 'node:url';
import { defineConfig, chromium } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'sitting-ui.pw.mjs',workers:1,timeout:30000,reporter:'list',outputDir:'../../tmp/sitting-ui-results',use:{baseURL:'http://127.0.0.1:3107',browserName:'chromium',launchOptions:{executablePath:chromium.executablePath()}},webServer:{cwd:fileURLToPath(new URL('../../',import.meta.url)),command:'node scripts/tests/sitting-ui-server.mjs',url:'http://127.0.0.1:3107',reuseExistingServer:false,timeout:60000}});
