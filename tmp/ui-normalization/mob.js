const fs=require('fs');
function edit(p,fn){let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');s=fn(s);fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);}
const rep=(s,a,b)=>{if(!s.includes(a))throw a.slice(0,80);return s.replace(a,b);};
edit('src/components/order/OrderDocument.tsx',s=>rep(s,`          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {cancelled ? "Order cancelled"`,`          <div className="min-w-[13rem] flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {cancelled ? "Order cancelled"`));
edit('src/components/order/OrderEditNotice.tsx',s=>rep(s,'<p className="min-w-0 flex-1 text-xs text-blue-900">','<p className="min-w-[13rem] flex-1 text-xs text-blue-900">'));
edit('src/components/admin/orders/TimelineTrack.tsx',s=>rep(s,'      <NowCard stage={currentStage} withSlug={withSlug} disableSourceLinks={disableSourceLinks} />\n      <PhaseStepper phases={phases} small />','      {!hideOperatorBanner && (\n        <NowCard stage={currentStage} withSlug={withSlug} disableSourceLinks={disableSourceLinks} />\n      )}\n      <PhaseStepper phases={phases} small />'));
console.log('ok');
