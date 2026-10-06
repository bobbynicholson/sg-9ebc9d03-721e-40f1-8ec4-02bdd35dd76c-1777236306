const fs=require('fs');
function edit(p,fn){let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');s=fn(s);fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);}
const rep=(s,a,b)=>{if(!s.includes(a))throw new Error('missing: '+a.slice(0,90));return s.replace(a,b);};
const cut=(s,a,b)=>{const i=s.indexOf(a);const j=s.indexOf(b,i);if(i<0||j<0)throw new Error('cut '+a.slice(0,60));return [s.slice(0,i),s.slice(i,j+b.length),s.slice(j+b.length)];};

// Section props for side-panel grids
edit('src/components/order/sections/OrderHeaderSection.tsx',s=>{
  s=rep(s,'  underDocumentHeader?: boolean;\n','  underDocumentHeader?: boolean;\n  /** Rendered in the narrow right-hand panel on desktop. */\n  inSidePanel?: boolean;\n');
  s=rep(s,'underDocumentHeader = false }: Props) {','underDocumentHeader = false, inSidePanel = false }: Props) {');
  s=rep(s,'      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">','      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${inSidePanel ? "lg:grid-cols-1" : ""}`}>');
  return s;});
edit('src/components/order/sections/FinanceSection.tsx',s=>{
  s=s.replace(/(export function FinanceSection\(\{[^}]*?)(\s*\}: Props\))/, (m,a,b)=>a+', inSidePanel = false'+b);
  if(!s.includes('inSidePanel = false')) throw new Error('finance sig');
  s=rep(s,'interface Props {\n','interface Props {\n  /** Rendered in the narrow right-hand panel on desktop. */\n  inSidePanel?: boolean;\n');
  s=rep(s,'          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">','          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${inSidePanel ? "lg:grid-cols-2" : ""}`}>');
  return s;});

edit('src/components/order/OrderDocument.tsx',s=>{
  const print='mode === "print"';
  // Wider, centred canvas
  s=rep(s,'"max-w-full px-3 sm:px-4 md:px-6 py-4 sm:py-6"','"mx-auto max-w-[90rem] px-3 sm:px-4 md:px-6 py-4 sm:py-6"');
  // Pull out blocks
  let pre,qa,post; [pre,qa,post]=cut(s,'      {/* ODOC H.4: admin quick-action chip strip.','        }}\n      />\n'); s=pre+post;
  let head; [pre,head,post]=cut(s,'        <OrderHeaderSection\n','          underDocumentHeader={!staffAllowed}\n        />\n'); s=pre+post;
  let fin; [pre,fin,post]=cut(s,'        {/* ODOC: Finance section is permission-gated at render time.','            highlight={primary === "admin"}\n          />\n        )}\n'); s=pre+post;
  let comms; [pre,comms,post]=cut(s,'        {/* ODOC Wave F: communications log - admin-only,','            defaultOpen={false}\n          />\n        )}\n'); s=pre+post;
  let att; [pre,att,post]=cut(s,'        {/* ODOC Wave F: file attachments - contracts,','            defaultOpen={false}\n          />\n        )}\n'); s=pre+post;
  let hist; [pre,hist,post]=cut(s,'        {!isClient && showFor("history") && (\n          <HistorySection','            defaultOpen={false}\n          />\n        )}\n'); s=pre+post;
  head=head.replace('          underDocumentHeader={!staffAllowed}\n','          underDocumentHeader={!staffAllowed}\n          inSidePanel={mode !== "print"}\n');
  fin=fin.replace('            highlight={primary === "admin"}\n          />','            highlight={primary === "admin"}\n            inSidePanel={mode !== "print"}\n          />');
  const indent=(t)=>t.split('\n').map(l=>l?'    '+l:l).join('\n');
  // Banners stay above the main column; wrap all from EditNotice to AlertBanners into main column
  [pre,post]=[s.slice(0,s.indexOf('      {/* ODOC H.1: admin-tier')), s.slice(s.indexOf('      {/* ODOC H.1: admin-tier'))];
  const bannersEnd='      <OrderAlertBanners order={order} />\n\n      <div className="space-y-3 sm:space-y-4">\n';
  const bi=post.indexOf(bannersEnd); if(bi<0) throw new Error('banners');
  const banners=post.slice(0,bi+'      <OrderAlertBanners order={order} />\n'.length);
  let rest=post.slice(bi+bannersEnd.length);
  const mainEnd='      </div>\n\n      {user?.id && (\n        <Dialog';
  const mi=rest.indexOf(mainEnd); if(mi<0) throw new Error('mainEnd');
  const mainBody=rest.slice(0,mi);
  const after=rest.slice(mi+'      </div>\n'.length);
  const layout=`      {/* Two-column workspace on desktop: the work on the left, a
          reference panel (actions, details, money, files) on the right
          that stays in view while scrolling. On phones it stacks: actions
          and details first, then the work, then money and files. */}
      <div className={${print} ? "space-y-3 sm:space-y-4" : "flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_25rem]"}>
        <div className="order-2 min-w-0 space-y-3 sm:space-y-4 lg:order-none">
${indent(banners).replace(/^/,'')}
${indent(mainBody)}${indent(hist)}        </div>

        <aside className={${print} ? "space-y-3 sm:space-y-4" : "contents lg:sticky lg:top-16 lg:block lg:space-y-4"} aria-label="Order details and actions">
          <div className="order-1 space-y-3 sm:space-y-4 lg:order-none">
${indent(indent(qa))}${indent(head)}          </div>
          <div className="order-3 space-y-3 sm:space-y-4 lg:order-none">
${indent(fin)}${indent(comms)}${indent(att)}          </div>
        </aside>
      </div>
`;
  return pre+layout+after;
});
console.log('ok');
