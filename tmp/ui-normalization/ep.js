const fs=require('fs');const p='src/pages/admin/event-profitability.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a=s.indexOf('          <PortalCard className="mb-5 border-brand-primary/20 bg-gradient-to-r from-brand-primary/10 via-brand-secondary/5 to-brand-accent/10">');
const e=s.indexOf('          </PortalCard>\n',a)+'          </PortalCard>\n'.length;
if(a<0) throw 'x';
s=s.slice(0,a)+`          <p className="mb-4 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-primary" />
            Costs include shopping, equipment hire and delivery. Staff labour and payment fees are left out until they can be linked to an order.
          </p>
`+s.slice(e);
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
