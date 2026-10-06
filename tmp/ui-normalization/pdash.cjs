const fs=require('fs');const p='src/pages/admin/platform/dashboard.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a=`        {/* Audit Logs Section */}
        <div className="mt-12">
          <AuditLogsViewer />
        </div>`;
if(!s.includes(a))throw 'x';
s=s.replace(a,`        {/* Audit log folds away: 100 rows used to make this page 6,500px tall. */}
        <details className="group mt-8 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-base font-semibold text-slate-900 dark:text-white">Recent system audit logs</span>
              <span className="block text-xs text-slate-500">Latest 100 platform events. Open to view, or use Audit logs for search and filters.</span>
            </span>
            <span className="text-xs font-medium text-slate-600 group-open:hidden">Show</span>
            <span className="hidden text-xs font-medium text-slate-600 group-open:inline">Hide</span>
          </summary>
          <div className="border-t border-slate-100 p-2 dark:border-slate-800">
            <AuditLogsViewer />
          </div>
        </details>`);
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
