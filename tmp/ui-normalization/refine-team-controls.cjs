const fs=require('fs'),ts=require('typescript');
const filename='src/components/admin/TeamManagerWorkspace.tsx';
let source=fs.readFileSync(filename,'utf8');
const file=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
function visit(n){
 if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(file)==='Card'){
  const header=n.children.find(c=>ts.isJsxElement(c)&&c.openingElement.tagName.getText(file)==='CardHeader');
  if(header){
   const text=header.getText(file),kind=text.includes('setRosterOpen')?'roster':text.includes('setDiaryOpen')?'diary':text.includes('setNotesOpen')?'notes':null;
   if(kind){
    const label=kind==='roster'?'Team roster':kind==='diary'?'Daily work diary':'Recent notes';
    const description=kind==='roster'?'{members.length} team members · {onDuty} on duty':kind==='diary'?'Record completed work, issues and handovers. Unsaved notes stay here when collapsed.':'{notes.length} recorded notes; the latest 12 are shown when expanded.';
    edits.push({start:n.openingElement.tagName.end,end:n.openingElement.tagName.end,text:` collapsible defaultOpen={${kind==='roster'?'defaultRosterOpen':'false'}} collapseLabel="${label}"`});
    function removeButton(c){if(ts.isJsxElement(c)&&c.openingElement.tagName.getText(file)==='button')edits.push({start:c.getStart(file),end:c.end,text:''});else ts.forEachChild(c,removeButton);}removeButton(header);
    edits.push({start:header.closingElement.getStart(file),end:header.closingElement.getStart(file),text:`<CardDescription>${description}</CardDescription>`});
    const expression=n.children.find(c=>ts.isJsxExpression(c)&&c.expression&&ts.isBinaryExpression(c.expression)&&c.expression.left.getText(file)===`${kind}Open`);
    if(expression){const content=expression.expression.right;edits.push({start:expression.getStart(file),end:expression.end,text:content.getText(file)});}
   }
  }
 }
 ts.forEachChild(n,visit);
}visit(file);
for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end);
source=source.replace('CardHeader, CardTitle }','CardHeader, CardTitle, CardDescription }');
source=source.replace(/  const \[(rosterOpen|diaryOpen|notesOpen),[^\n]+\n/g,'');
// The workspace itself stays mounted when collapsed so diary values survive.
const start=source.indexOf('  if (!workspaceOpen) {'),end=source.indexOf('  const submitClock',start);
if(start<0||end<0)throw Error('Workspace boundary unavailable');
source=source.slice(0,start)+source.slice(end);
source=source.replace('Clock {teamName} staff and keep today&apos;s handover notes in one place.','{onDuty} on duty · Manage the roster and keep today&apos;s handover notes in one place.');
source=source.replace('        <Button variant="outline" size="sm" onClick={() => setTick',[
 '        <div className="flex flex-wrap items-center gap-2">',
 '          <Button type="button" variant="outline" size="sm" aria-expanded={workspaceOpen} aria-controls={`${department}-team-controls-content`} aria-label={`${workspaceOpen ? "Collapse" : "Expand"} team controls`} onClick={() => setWorkspaceOpen(value => !value)} disabled={!!saving} className="min-h-10 gap-1.5 bg-white dark:bg-slate-900">',
 '            {workspaceOpen ? "Collapse" : "Expand"}<ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${workspaceOpen ? "rotate-180" : ""}`} />',
 '          </Button>',
 '        <Button variant="outline" size="sm" onClick={() => setTick'
].join('\n'));
source=source.replace('        </Button>\n      </div>\n\n      {error &&','        </Button>\n        </div>\n      </div>\n\n      {error &&');
source=source.replace('      {showSummaryStats &&', '      <div id={`${department}-team-controls-content`} hidden={!workspaceOpen} style={workspaceOpen ? undefined : { display: "none" }} className="space-y-4">\n      {showSummaryStats &&');
source=source.replace('      <Dialog open={!!clockOutTarget}', '      </div>\n      <Dialog open={!!clockOutTarget}');
fs.writeFileSync(filename,source);
console.log('Team controls now use shared disclosures and keep diary inputs mounted.');
