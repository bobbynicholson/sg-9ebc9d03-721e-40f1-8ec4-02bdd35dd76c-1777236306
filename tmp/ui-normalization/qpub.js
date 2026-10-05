const fs=require('fs');const p='src/pages/q/[token].tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a=`          {/* EVENT DETAILS - icon tiles so the who / when / how many /
              where scan in one glance. */}`;
if(!s.includes(a)) throw 'x';
s=s.replace(a,`          {/* Where this quote is: Prepared -> Sent -> Viewed -> Accepted -> Booked. */}
          <Card className="no-print mb-4 border border-stone-200 shadow-sm">
            <CardContent className="px-4 py-5 sm:px-6">
              <QuoteProgress
                audience="client"
                status={quote.status}
                createdAt={(quote as any).created_at}
                sentAt={(quote as any).sent_at}
                viewedAt={(quote as any).viewed_at}
                acceptedAt={quote.accepted_at}
                booked={!!(quote as any).converted_to_order_id}
              />
            </CardContent>
          </Card>

`+a);
s=s.replace('import { isManualEftAvailable } from "@/lib/publicPaymentOptions";','import { isManualEftAvailable } from "@/lib/publicPaymentOptions";\nimport { QuoteProgress } from "@/components/quotes/QuoteProgress";');
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
