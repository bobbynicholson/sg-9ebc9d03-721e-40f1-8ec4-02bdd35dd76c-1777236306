const fs=require('fs');const p='src/pages/client-portal/billing.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a=s.indexOf('              {/* Stats */}\n              <div className="mb-6 md:mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">');
const e=s.indexOf('              {/* Filters and Search */}',a);
if(a<0||e<0) throw 'x';
s=s.slice(0,a)+s.slice(e);
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
