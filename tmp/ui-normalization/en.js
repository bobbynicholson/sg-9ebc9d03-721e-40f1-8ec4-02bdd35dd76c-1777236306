const fs=require('fs');const p='src/components/order/OrderEditNotice.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a=`    <div className="flex items-start gap-3 p-3 mb-3 rounded-lg border-2 border-blue-300 bg-blue-50 print:hidden">
      <Pencil className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-blue-800 font-semibold">Editing this order</p>
        <p className="text-sm font-medium text-blue-900 mt-0.5">
          Order details live on the source quote. Edit the quote to update menu items, guest count, event date, venue, or pricing - changes mirror to this order automatically. Re-send the quote to the client to confirm.
        </p>
      </div>
      <a
        href={withSlug(\`/admin/quotes/\${quoteId}\`)}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex-shrink-0"
      >`;
if(!s.includes(a)) throw 'x';
s=s.replace(a,`    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2 print:hidden">
      <Pencil className="h-4 w-4 flex-shrink-0 text-blue-600" />
      <p className="min-w-0 flex-1 text-xs text-blue-900">
        <span className="font-semibold">To change menu, guests, date, venue or price, edit the quote.</span>{" "}
        <span className="text-blue-800/80">Changes copy to this order automatically.</span>
      </p>
      <a
        href={withSlug(\`/admin/quotes/\${quoteId}\`)}
        className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
      >`);
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
