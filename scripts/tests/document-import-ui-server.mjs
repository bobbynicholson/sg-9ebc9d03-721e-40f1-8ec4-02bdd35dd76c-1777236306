// Real import UI with synthetic fixture data. No database, auth, AI or email.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const out=resolve('tmp/document-import-ui');await mkdir(out,{recursive:true});
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const field=value=>({value,evidence:'Synthetic PDF fixture',page:1,confidence:.95});
const base=()=>({job:{id:id(1),source_filename:'Synthetic import fixture.pdf',summary:{document_import:true}},currency:'ZAR',pricingIncludesVat:false,regions:[{id:id(2),name:'Cape Town'}],catalogue:[{id:id(4),name:'Roast chicken',kind:'menu',price:100,has_recipe:true}],documents:[{id:id(3),job_id:id(1),target_table:'orders',filename:'Synthetic import fixture.pdf',status:'review',version:0,source_hash:'a'.repeat(64),extraction:{document_type:'order',fields:Object.fromEntries(Object.entries({reference:'LEGACY-0042',client_name:'Jane Example',client_company_name:'Example Events Ltd',client_email:'jane@example.test',event_name:'Annual team lunch',event_date:'2099-11-05',guest_count:20,venue_address:'Example venue, Cape Town',subtotal:1200,tax_amount:180,total_amount:1380}).map(([k,v])=>[k,field(v)])),items:[{kind:'menu',name:'Roast chicken',description:'',category:'Mains',quantity:10,unit_price:100,line_total:1000,page:1,evidence:'10 × R100',catalogue_id:null,owned_quantity:null,prep_time_minutes:null,cook_time_minutes:null,requires_cleaning:true,cleaning_minutes:null},{kind:'equipment',name:'Chafing dish',description:'',category:'Serving',quantity:2,unit_price:100,line_total:200,page:1,evidence:'2 × R100',catalogue_id:null,owned_quantity:null,prep_time_minutes:null,cook_time_minutes:null,requires_cleaning:true,cleaning_minutes:null}],unmatched:[{label:'Collection note',value:'Collect equipment after the final sitting.',page:2}],warnings:[]}}]});
let data=base();let lastReview=null;
await writeFile(out+'/react-shim.js',`import * as React from 'react';export {React};`);
await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{DocumentImportWorkbench}from'@/components/admin/DocumentImportWorkbench';import{ImportReadinessBanner}from'@/components/admin/ImportReadinessBanner';const review=location.search.includes('review');createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-7xl p-4 sm:p-8"><h1 className="mb-2 text-2xl font-semibold">Import quote and order PDFs</h1><p className="mb-6 text-sm text-muted-foreground">Synthetic preview for automated verification.</p>{location.search.includes('banner')?<ImportReadinessBanner orderId="${id(9)}"/>:<DocumentImportWorkbench initialJob={review?'${id(1)}':undefined}/>}</main>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,jsx:'transform',inject:[out+'/react-shim.js'],outfile:out+'/app.js',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));b.onResolve({filter:/^@\/lib\/tenantUrl$/},()=>({path:'tenant',namespace:'fixture'}));b.onResolve({filter:/^@\/integrations\/supabase\/client$/},()=>({path:'client',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='link'?`import React from'react';export default React.forwardRef(function Link({href,children,...props},ref){return React.createElement('a',{...props,ref,href},children)});`:args.path==='tenant'?`export function useTenantHref(){return{withSlug:p=>p}}`:`export const supabase={storage:{from(){return{async uploadToSignedUrl(){return{error:null}}}}}};`,loader:'js',resolveDir:process.cwd()}));b.onResolve({filter:/^@\//},args=>({path:resolve('src',args.path.slice(2)+(args.path.includes('/components/')?'.tsx':'.ts'))}));}}]});
execFileSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-i','src/styles/globals.css','-o',out+'/app.css','--content','src/components/admin/DocumentImportWorkbench.tsx,src/components/admin/ImportReadinessBanner.tsx,src/components/ui/*.tsx','--minify'],{stdio:'pipe'});
await writeFile(out+'/index.html','<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="bg-slate-50"><div id="root"></div><script src="/app.js"></script></body></html>');
createServer(async(req,res)=>{try{
 const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 if(req.url==='/fixture-reset'){data=base();lastReview=null;return send(200,{ok:true});}
 if(req.url==='/fixture-state')return send(200,{data,lastReview});
 if(req.url.startsWith('/api/')){
  if(req.url.startsWith('/api/document-imports/readiness')){
   if(req.method==='POST'){data.documents[0].setup_completed_at=new Date().toISOString();return send(200,{ok:true});}
   return send(200,{gaps:data.documents[0].setup_completed_at?[]:[{message:'Complete setup for the imported booking.',kind:'review',href:`/admin/document-imports?job=${id(1)}&document=${id(3)}`}]});
  }
  if(req.method==='POST'){
   let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);
   lastReview=body.review;data.documents[0].reviewed_data=body.review;data.documents[0].version++;
   if(body.action==='commit'){data.documents[0].status='committed';data.documents[0].target_id=id(9);}
   return send(200,{ok:true,document:data.documents[0],targetId:id(9)});
  }
  if(req.url==='/api/document-imports')return send(200,{jobs:[]});
  return send(200,data);
 }
 const file=req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0].slice(1);res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(out+'/'+file));
}catch(e){res.writeHead(500);res.end(String(e));}}).listen(3108,'127.0.0.1');
