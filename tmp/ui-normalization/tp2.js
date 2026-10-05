const fs=require('fs');const p='src/components/admin/lifecycle-emails/TemplatesPanel.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a=s.indexOf('      {/* HEADER + COVERAGE */}');const b=s.indexOf('      {/* FILTERS */}');
if(a<0||b<0) throw 'x';
s=s.slice(0,a)+`      {/* One compact intro: what editing does, plus the template mix. */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="max-w-3xl space-y-1 text-xs leading-5 text-slate-600">
          <p className="flex items-start gap-1.5">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
            <span><strong className="text-slate-900">Edits change what clients and staff receive.</strong> Reset any template to go back to the default. WhatsApp templates have no subject line.</span>
          </p>
          <p className="flex items-start gap-1.5">
            <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span><strong className="text-slate-900">Automatic ({automatedCount})</strong> send on their own; <strong className="text-slate-900">Manual ({manualCount})</strong> open prefilled when you press Send on Leads, Quotes or Staff.</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Customised</p>
          <p className="text-xl font-bold tabular-nums text-brand-primary">
            {customisedCount}<span className="text-sm font-normal text-slate-400"> / {rows.length}</span>
          </p>
          <p className="text-[10px] text-slate-500">{emailCount} email &middot; {whatsappCount} WhatsApp</p>
        </div>
      </div>

`+s.slice(b);
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
