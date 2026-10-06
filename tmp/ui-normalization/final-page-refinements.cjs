const fs=require('fs'),ts=require('typescript');
let file='src/pages/admin/quotes/new.tsx',source=fs.readFileSync(file,'utf8');
const start=source.indexOf('value={deliveryDistance ||');
const input=source.lastIndexOf('<Input',start);
source=source.slice(0,input)+source.slice(input).replace('<Input','<Input id="quote-delivery-distance"');
fs.writeFileSync(file,source);
file='src/pages/admin/settings.tsx';source=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
const a=source.indexOf('      {hasUnsavedChanges && (',source.indexOf('</PortalShell>'));
const b=source.indexOf('\n    </>\n  );',a);
if(a<0||b<0)throw Error('Settings banner boundaries unavailable');
const block=source.slice(a,b).replace('fixed bottom-4 left-1/2 z-40 -translate-x-1/2 lg:left-[calc(50%+9rem)] xl:left-[calc(50%+10rem)]','mb-6 flex justify-end');
source=source.slice(0,a)+source.slice(b);
const i=source.indexOf('          <PageWorkbench />')+'          <PageWorkbench />'.length;
source=source.slice(0,i)+'\n'+block+source.slice(i);
source=source.replace('Each card opens the canonical page for that part of the admin system.','Open the area you want to configure.').replace('These tabs save to company-backed settings and are shared by every admin on the tenant.','Choose an area, update its defaults and save your changes.');
fs.writeFileSync(file,source);
// Only supporting catalogue analytics collapse. The catalogue and review alerts stay visible.
file='src/pages/admin/offering.tsx';source=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
function visit(n){if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='Card'){
const header=n.children.find(c=>ts.isJsxElement(c)&&c.openingElement.tagName.getText(ast)==='CardHeader');
const text=header?.getText(ast)||'';
const label=text.includes('Often ordered together')?'Often ordered together':text.includes('Recently quoted')?'Recently quoted':null;
if(label)edits.push({pos:n.openingElement.tagName.end,text:` collapsible defaultOpen={false} collapseLabel="${label}"`});
}ts.forEachChild(n,visit);}visit(ast);
for(const e of edits.sort((a,b)=>b.pos-a.pos))source=source.slice(0,e.pos)+e.text+source.slice(e.pos);
fs.writeFileSync(file,source);
for(const relative of ['client-search','dispatch-queue','equipment-damages','inventory-recipes','inventory-tracking','live-operations']){
file=`src/pages/admin/${relative}.tsx`;source=fs.readFileSync(file,'utf8');
source=source.replace('import type { GetServerSideProps } from "next";','import type { GetServerSideProps } from "next";\nimport { tenantRedirectPrefix } from "@/lib/tenantRedirect";');
source=source.replaceAll('destination: `/admin/','destination: `${tenantRedirectPrefix(ctx)}/admin/');
fs.writeFileSync(file,source);
}
console.log('Refined quote focus, catalogue details, save reminders and six tenant redirects.');
