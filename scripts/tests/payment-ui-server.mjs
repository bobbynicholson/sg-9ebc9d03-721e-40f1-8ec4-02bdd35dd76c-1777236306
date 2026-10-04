import { spawn } from 'node:child_process';
// Override app credentials before Next loads .env.local. This server uses no
// company database, merchant or mail transport; Playwright supplies responses.
const env = { ...process.env, NEXT_DIST_DIR: '.next-payment-ui', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3106',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'offline_fixture_anon',
  SUPABASE_SERVICE_ROLE_KEY: 'offline_fixture_service', SUPABASE_SERVICE_KEY: 'offline_fixture_service',
  SUPABASE_SECRET_KEY: 'offline_fixture_service', DATABASE_URL: '', SUPABASE_DB_URL: '',
  RESEND_API_KEY: '', CRON_SECRET: 'offline_fixture_cron', NODE_ENV: 'development' };
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3106'],
  { stdio: 'inherit', env });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 1; });
