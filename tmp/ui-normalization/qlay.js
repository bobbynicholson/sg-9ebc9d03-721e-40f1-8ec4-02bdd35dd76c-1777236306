const fs=require('fs');const p='src/pages/admin/quotes/[id].tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const rep=(a,b)=>{if(!s.includes(a))throw new Error('missing '+a.slice(0,90));s=s.replace(a,b);};
// 1. Always two columns on desktop
rep('<div className={`grid grid-cols-1 gap-6 items-start ${changeRequests.length > 0 || changeReqError ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>',
    '<div className="grid grid-cols-1 gap-6 items-start lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">');
// 2. Progress stepper after the header card
rep(`                </CardContent>
              </Card>

              {/* Menu items, editable when draft, read-only otherwise */}`,`                </CardContent>
              </Card>

              {/* Quote journey: Created -> Sent -> Viewed -> Accepted -> Booked. */}
              <Card>
                <CardContent className="px-4 py-5 sm:px-6">
                  <QuoteProgress
                    status={quote.status}
                    createdAt={(quote as any).created_at}
                    sentAt={(quote as any).sent_at}
                    viewedAt={(quote as any).viewed_at}
                    acceptedAt={(quote as any).accepted_at}
                    booked={!!(quote as any).converted_to_order_id}
                  />
                </CardContent>
              </Card>

              {/* Menu items, editable when draft, read-only otherwise */}`);
// 3. Cut action bar .. end of main column
const a=s.indexOf('              {/* Action bar */}');
const endMain='              </div>\n\n              {/* Sticky change-request panel.';
const b=s.indexOf(endMain);
if(a<0||b<0) throw new Error('cut');
let actions=s.slice(a,b);
s=s.slice(0,a)+s.slice(b);
actions=actions.replace('              <div className="flex flex-wrap gap-3">','              <div className="flex flex-col gap-2 [&>*]:min-w-0">');
// 4. Side column always visible, sticky, actions first
rep('<div className={changeRequests.length > 0 || changeReqError ? "lg:col-start-2 lg:self-stretch" : "hidden"}>',
`<div className="lg:col-start-2 lg:self-stretch">
                <div className="space-y-4 lg:sticky lg:top-20">
                <Card>
                  <CardContent className="space-y-4 p-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quote total</p>
                      <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-950">
                        {fmtMoney(isDraft ? computed.total : safeNum((quote as any).total ?? (quote as any).total_amount))}
                      </p>
                      <p className="text-xs text-slate-500">Including VAT</p>
                    </div>
${actions.split('\n').map(l=>l?'      '+l:l).join('\n')}                  </CardContent>
                </Card>`);
// close the extra wrapper before the side column closes: find ChangeRequestPanel end
rep(`                  forceOpen={forcePanelOpen}
                />
              </div>`,`                  forceOpen={forcePanelOpen}
                />
                </div>
              </div>`);
// import
rep('import Link from "next/link";','import Link from "next/link";\nimport { QuoteProgress } from "@/components/quotes/QuoteProgress";');
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
