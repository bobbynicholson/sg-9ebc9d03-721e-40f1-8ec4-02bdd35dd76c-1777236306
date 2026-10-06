const fs=require('fs');const p='src/components/admin/lifecycle-emails/TemplatesPanel.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a=`        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={\`\${g.channel}-\${g.category}-\${g.group}\`}>
              <div className="flex items-center gap-2 mb-2 px-1">
                {g.channel === "email"
                  ? <Mail className="w-4 h-4 text-blue-600" />
                  : <MessageCircle className="w-4 h-4 text-brand-primary" />}
                <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  {g.channel} &middot; {g.category} &middot; {g.group}
                </p>
                <span className="text-[10px] text-slate-400 ml-1">({g.items.length})</span>
              </div>
              <div className="space-y-2">`;
if(!s.includes(a)) throw 'a';
s=s.replace(a,`        <div className="space-y-2">
          {/* Each group folds to its title row; searching opens every match. */}
          {grouped.map((g) => (
            <details
              key={\`\${g.channel}-\${g.category}-\${g.group}-\${query.trim() ? "q" : "all"}\`}
              open={Boolean(query.trim())}
              className="group rounded-lg border border-slate-200 bg-white"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                {g.channel === "email"
                  ? <Mail className="w-4 h-4 text-blue-600" />
                  : <MessageCircle className="w-4 h-4 text-brand-primary" />}
                <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  {g.channel} &middot; {g.category} &middot; {g.group}
                </p>
                <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">{g.items.length}</span>
                <ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-2 border-t border-slate-100 p-2">`);
// close: find the end of this group's items div + wrapper
const b=`              </div>
            </div>
          ))}
        </div>
      )}`;
const idx=s.indexOf(b, s.indexOf('{/* Each group folds'));
if(idx<0) throw 'b';
s=s.slice(0,idx)+`              </div>
            </details>
          ))}
        </div>
      )}`+s.slice(idx+b.length);
s=s.replace('import { Mail, MessageCircle,','import { ChevronDown, Mail, MessageCircle,');
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
