const fs=require('fs');const p='src/pages/admin/calendar.tsx';let s=fs.readFileSync(p,'utf8');
const a=s.indexOf('              <Card className="bg-gradient-to-br from-blue-50 to-blue-50">');
const endMarker='              </Card>\n';const e1=s.indexOf('</Card>',a);
if(a<0||e1<0) throw 'x';
let end=s.indexOf('\n',e1)+1;
// remove preceding blank line too
let start=s.lastIndexOf('\n',a-2)+1; // keep line before
s=s.slice(0,a).replace(/\r?\n[ \t]*\r?\n$/, s.includes('\r\n')?'\r\n':'\n')+s.slice(end);
fs.writeFileSync(p,s);console.log('ok');
