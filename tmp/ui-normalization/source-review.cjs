const fs=require('fs'), ts=require('typescript');
const inventory=JSON.parse(fs.readFileSync('tmp/ui-normalization/route-inventory.json','utf8'));
const result=[];
for(const item of inventory.filter(x=>!x.route.startsWith('/admin/platform'))){
 const source=fs.readFileSync(item.file,'utf8');
 const file=ts.createSourceFile(item.file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const headers=[],cards=[];
 const str=(attrs,name)=>{const attr=attrs.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(file)===name);return attr?.initializer?.getText(file)||'';};
 const visit=n=>{
  if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(file)==='PortalHeader')headers.push({title:str(n.attributes,'title'),subtitle:str(n.attributes,'subtitle')});
  if(ts.isJsxElement(n)&&['Card','PortalCard'].includes(n.openingElement.tagName.getText(file))){
   let inDialog=false,p=n.parent;while(p){if(ts.isJsxElement(p)&&/^(DialogContent|AlertDialogContent|SheetContent)$/.test(p.openingElement.tagName.getText(file)))inDialog=true;p=p.parent;}
   if(!inDialog){
    let title='',desc='';
    const h=n.children.find(c=>ts.isJsxElement(c)&&c.openingElement.tagName.getText(file)==='CardHeader'||ts.isJsxSelfClosingElement(c)&&c.tagName.getText(file)==='PortalCardHeader');
    if(h&&ts.isJsxSelfClosingElement(h)){title=str(h.attributes,'title');desc=str(h.attributes,'description');}
    else if(h){const find=c=>{if(ts.isJsxElement(c)&&c.openingElement.tagName.getText(file)==='CardTitle')title=c.children.map(x=>x.getText(file)).join('').replace(/\s+/g,' ').trim();else if(ts.isJsxElement(c)&&c.openingElement.tagName.getText(file)==='CardDescription')desc=c.children.map(x=>x.getText(file)).join('').replace(/\s+/g,' ').trim();else ts.forEachChild(c,find);};find(h);}
    if(title)cards.push({title,desc,collapsible:!!str(n.openingElement.attributes,'collapseLabel')});
   }
  }
  ts.forEachChild(n,visit);
 };visit(file);result.push({...item,headers,cards});
}
fs.writeFileSync('tmp/ui-normalization/source-review.json',JSON.stringify(result,null,2));
for(const r of result)console.log(r.route+' | '+r.headers.map(h=>h.title+': '+h.subtitle).join(' / ')+' | '+r.cards.map(c=>(c.collapsible?'[disclosure] ':'')+c.title).join('; '));
