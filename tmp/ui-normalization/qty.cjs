const fs=require('fs');const p='src/pages/team-portal/shopping/buy-list.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const pairs=[[`    const gap = Math.max(0, Number(r.minimum_stock || 0) - Number(r.current_stock || 0));
    return gap;`,`    const min = Number(r.minimum_stock || 0);
    const gap = Math.max(0, min - Number(r.current_stock || 0));
    // At the minimum exactly, the gap is 0: suggest one minimum's worth
    // so stock ends up above the reorder point.
    return gap > 0 ? gap : min;`]];
for(const [a,b] of pairs){if(!s.includes(a))throw 'x';s=s.replace(a,b);}
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
