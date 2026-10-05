const fs=require('fs');const p='src/pages/c/order/[id].tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const idx=(m)=>{const i=s.indexOf(m);if(i<0)throw new Error('missing '+m.slice(0,60));return i;};
const tTimeline=idx('          {/* Status timeline - the same 22-stage pipeline model used');
const tPayment=idx('          {/* Payment summary */}');
const tDriver=idx('          {/* Wave 19: live driver tracking.');
const tChange=idx('          {/* Wave 20 audit: Need to change something? card.');
const endMarker='          <p className="text-center text-xs text-slate-400">\n            This is a private link to your booking.';
const tEnd=idx(endMarker);
const head=s.slice(0,tTimeline);
const mainA=s.slice(tTimeline,tPayment);   // timeline, venue, items, equipment
const payment=s.slice(tPayment,tDriver);   // payment card
const mainB=s.slice(tDriver,tChange);      // driver tracking, special
const side=s.slice(tChange,tEnd);          // change + contact
const tail=s.slice(tEnd);
const ind=(t)=>t.split('\n').map(l=>l?'    '+l:l).join('\n');
s=head+`          {/* Two columns on desktop: the booking itself on the left; money,
              changes and contact on the right, staying in view. Phones stack
              in reading order with payment straight after the details. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <div className="min-w-0 space-y-6">
${ind(mainA)}${ind(mainB)}            </div>
            <aside className="space-y-6 lg:sticky lg:top-6" aria-label="Payment and help">
${ind(payment)}${ind(side)}            </aside>
          </div>

`+tail;
s=s.replace('        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">','        <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">');
s=s.replace('          <div className="max-w-3xl mx-auto flex items-center gap-4">','          <div className="max-w-6xl mx-auto flex items-center gap-4">');
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
