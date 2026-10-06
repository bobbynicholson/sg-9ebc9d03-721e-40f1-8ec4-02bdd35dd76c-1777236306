const fs=require('fs');const p='src/pages/admin/quotes/index.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const start=s.indexOf('                          <div className="flex items-center gap-4 text-sm">\n                            <span className="text-slate-600">\n                              {Array.isArray(quote.menu_items)');
const endStr='                              <span className="text-brand-primary">{formatQuoteMoney(quote.total ?? 0, quote.currency, tenantCurrency.code)}</span>\n                            </div>\n';
const end=s.indexOf(endStr,start);
if(start<0||end<0) throw 'x';
const nu=`                          {/* One summary line: item counts on the left, the quote's
                              own subtotal / VAT / total on the right. Null-guarded
                              because legacy rows can carry null money fields. */}
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm">
                              <span className="text-slate-600">
                                {Array.isArray(quote.menu_items) ? quote.menu_items.length : 0} menu items · {Array.isArray(quote.equipment_items) ? quote.equipment_items.length : 0} equipment items
                              </span>
                              <span className="flex flex-wrap items-center gap-x-3 text-slate-600 tabular-nums">
                                <span>Subtotal <span className="font-medium text-slate-900">{formatQuoteMoney(quote.subtotal ?? 0, quote.currency, tenantCurrency.code)}</span></span>
                                <span>VAT <span className="font-medium text-slate-900">{formatQuoteMoney(quote.tax ?? 0, quote.currency, tenantCurrency.code)}</span></span>
                                <span className="font-bold text-slate-900">Total <span className="text-brand-primary">{formatQuoteMoney(quote.total ?? 0, quote.currency, tenantCurrency.code)}</span></span>
                              </span>
                            </div>
`;
s=s.slice(0,start)+nu+s.slice(end+endStr.length);
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
