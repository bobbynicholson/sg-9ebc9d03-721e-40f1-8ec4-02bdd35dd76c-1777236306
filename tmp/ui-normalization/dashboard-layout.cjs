const fs=require('fs'),ts=require('typescript');
const filename='src/pages/admin/dashboard.tsx',source=fs.readFileSync(filename,'utf8');
const file=ts.createSourceFile(filename,source,99,true,4);
let shell;
function find(n){if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(file)==='PortalShell')shell=n;ts.forEachChild(n,find);}
find(file);
const groups=[
  {title:'Needs attention',open:true,description:'Follow-ups, shortages, dispatch gaps and unresolved financial or delivery issues.',labels:['Quote follow-up','Low stock','Inventory expiry','Vehicle service due','Equipment damages','Lead aging','Dispatch gaps','Pending refunds','Overdue invoices','Email failures']},
  {title:'Upcoming work and team',open:false,description:'Tomorrow’s events, new leads and the staff currently on duty.',labels:['New leads today',"Tomorrow's events",'Active staff now']},
  {title:'Recent activity and payments',open:false,description:'Recorded payments, inventory changes, cancellations, feedback and the activity log.',labels:['Recent inventory adjusts','Recent ratings','Cancelled orders','Recent payments','Recent activity']},
  {title:'Performance and trends',open:false,description:'Delivery performance, weekly bookings, quote response times and comparisons.',labels:['Delivery SLA','Weekly orders chart','Quote response time','Region performance','Year over year']},
];
const selected=new Set(groups.flatMap(g=>g.labels)),nodes=new Map(),edits=[];
let first=Infinity,priority;
for(let i=0;i<shell.children.length;i++) {
  const n=shell.children[i];
  if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(file)==='WidgetErrorBoundary') {
    const attr=n.openingElement.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(file)==='label');
    const label=attr?.initializer&&ts.isStringLiteral(attr.initializer)?attr.initializer.text:'';
    if(selected.has(label)) {
      nodes.set(label,n.getText(file));first=Math.min(first,n.getStart(file));
      edits.push({start:n.getStart(file),end:n.end,text:''});
      let j=i-1;while(j>=0&&ts.isJsxText(shell.children[j])&&!shell.children[j].text.trim())j--;
      const previous=shell.children[j];
      if(previous&&ts.isJsxExpression(previous)&&!previous.expression)edits.push({start:previous.getStart(file),end:previous.end,text:''});
    }
  }
  if(ts.isJsxExpression(n)&&n.getText(file).includes('id="priority-actions"')) {
    priority=n.getText(file);edits.push({start:n.getStart(file),end:n.end,text:''});
  }
}
for(const label of selected)if(!nodes.has(label))throw new Error('Missing dashboard widget: '+label);
if(!priority||!Number.isFinite(first))throw new Error('Missing dashboard insertion target');
const layout=priority+'\n\n'+groups.map(g=>`<Card collapsible defaultOpen={${g.open}} collapseLabel=${JSON.stringify(g.title)} className="mb-6" id="dashboard-${g.title.toLowerCase().replaceAll(' ','-')}">
  <CardHeader><CardTitle className="text-base">${g.title}</CardTitle><CardDescription>${g.description}</CardDescription></CardHeader>
  <CardContent><div className="grid items-start gap-4 xl:grid-cols-2 [&>div]:mb-0">${g.labels.map(l=>nodes.get(l)).join('\n')}</div></CardContent>
</Card>`).join('\n\n');
const insertion=edits.find(e=>e.start===first);insertion.text=layout;
let updated=source;
for(const e of edits.sort((a,b)=>b.start-a.start))updated=updated.slice(0,e.start)+e.text+updated.slice(e.end);
updated=updated.replace('Card, CardContent, CardHeader, CardTitle }','Card, CardContent, CardHeader, CardTitle, CardDescription }').replace(/\n[ \t]*\n(?:[ \t]*\n)+/g,'\n\n');
fs.writeFileSync(filename,updated);
console.log('Dashboard: priority actions promoted; 23 existing widgets grouped into 4 deliberate sections.');
