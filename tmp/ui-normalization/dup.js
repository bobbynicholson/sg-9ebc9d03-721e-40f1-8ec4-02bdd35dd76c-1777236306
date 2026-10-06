const fs=require('fs');
function edit(p,fn){let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');s=fn(s);fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);}
const rep=(s,a,b)=>{if(!s.includes(a))throw a.slice(0,80);return s.replace(a,b);};
edit('src/components/order/sections/OrderHeaderSection.tsx',s=>{
  s=rep(s,'  forceOpen?: boolean;\n','  forceOpen?: boolean;\n  /** The document header above already shows title, status and number. */\n  underDocumentHeader?: boolean;\n');
  s=rep(s,'export function OrderHeaderSection({ order, defaultOpen, forceOpen }: Props) {','export function OrderHeaderSection({ order, defaultOpen, forceOpen, underDocumentHeader = false }: Props) {');
  s=rep(s,'      title={titleLine}\n      summary={summary}','      title={underDocumentHeader ? "Event & client details" : titleLine}\n      summary={summary}');
  s=rep(s,'      {/* Title band: prominent status pill + order number subtitle */}\n      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">','      {/* Title band: prominent status pill + order number subtitle */}\n      {!underDocumentHeader && <div className="flex items-start justify-between gap-3 flex-wrap mb-4">');
  // close the conditional after the title band div
  const i=s.indexOf('{!underDocumentHeader && <div className="flex items-start justify-between gap-3 flex-wrap mb-4">');
  const endBand='          )}\n        </div>\n      </div>\n';
  const j=s.indexOf(endBand,i);if(j<0)throw 'band';
  s=s.slice(0,j)+'          )}\n        </div>\n      </div>}\n'+s.slice(j+endBand.length);
  return s;});
edit('src/components/order/sections/OrderTimelineSection.tsx',s=>{
  s=rep(s,'  forceOpen?: boolean;\n','  forceOpen?: boolean;\n  /** Hide the "Next to do" banner when the document header shows it. */\n  hideNowBanner?: boolean;\n');
  s=rep(s,'export function OrderTimelineSection({ order, defaultOpen, forceOpen }: Props) {','export function OrderTimelineSection({ order, defaultOpen, forceOpen, hideNowBanner = false }: Props) {');
  s=rep(s,'            timeline={sharedTimeline}\n            hideOperatorGlossary\n            disableSourceLinks','            timeline={sharedTimeline}\n            hideOperatorGlossary\n            hideOperatorBanner={hideNowBanner}\n            disableSourceLinks');
  return s;});
edit('src/components/order/OrderDocument.tsx',s=>{
  s=rep(s,'          defaultOpen={true /* header is always open - it\'s the title block */}\n        />','          defaultOpen={true /* header is always open - it\'s the title block */}\n          underDocumentHeader={!staffAllowed}\n        />');
  s=rep(s,'          defaultOpen={true /* timeline is universal context */}\n        />','          defaultOpen={true /* timeline is universal context */}\n          hideNowBanner={!staffAllowed}\n        />');
  s=rep(s,'            companyId={order.company_id}\n            forceOpen={forceAll}\n            defaultOpen={true}','            companyId={order.company_id}\n            forceOpen={forceAll}\n            defaultOpen={false}');
  return s;});
console.log('ok');
