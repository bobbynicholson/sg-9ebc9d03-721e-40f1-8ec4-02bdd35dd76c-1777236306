const fs = require('fs'), path = require('path'), ts = require('typescript');
// Deliberate per-page decisions. Never infer disclosure from every card.
const decisions = {
  'audit-logs.tsx': {'Filters': false},
  'calendar.tsx': {'Gap finder': false},
  'cashflow-dashboard.tsx': {'30-day cashflow summary': true, 'Quick actions': false},
  'company-profile.tsx': {'Identity':true,'Region & currency':false,'Peak season':false,'Cash on hand staleness':false,'VAT registration':false,'Banking details':false,'Kitchen / HQ address':false,'Brand colours + logo':false,'Document numbering':false},
  'dashboard.tsx': {'Quick Actions':false},
  'driver-management.tsx': {'Driver portal access':false},
  'email-settings.tsx': {'Use your own sending domain':false,'Sender identity':true,'When to email clients automatically':false,'Mailchimp (bulk campaigns)':false},
  'financial-dashboard.tsx': {'Financial Summary':true,'Quick Actions':false,'Revenue Projections':false,'Expense Tracking':false,'Per-branch P&L':false},
  'integrations.tsx': {'Get a Zap running in 60 seconds':false,'Xero accounting':false,'QuickBooks Online':false,'Outbound webhooks':false,'Inbound API keys':false,'Catering Zap recipes':false,'Sage Business Cloud (Pastel)':false},
  'notification-settings.tsx': {'Email Notifications':true,'Push Notifications':false,'SMS Notifications':false,'WhatsApp Notifications':false},
  'quotes/new.tsx': {'Client + event':true,'Menu items':true,'Equipment':false,'Pricing adjustments':false,'Notes':false,'Client preview':false},
  'quotes/[id].tsx': {'Menu items':true,'Equipment':false,'Pricing':true,'Note to the client':false},
  'route-planning.tsx': {'Batch suggestions':false,'Route Details & Stops':false},
  'staff-hours.tsx': {'Payment History':false,'Where the rest lives':false},
  'subscription.tsx': {'PayFast Flow Test':false,'Usage This Quarter':false,'Billing History':false,'Danger Zone':false},
  'suppliers/[id].tsx': {'Purchase summary':true,'Events during this period':false,'Products supplied':false,'Receipts in this window':false},
  'white-label.tsx': {'Logo & Organization':true,'Color Palette':false,'Live Preview':false},
  'platform/audit-logs.tsx': {'Filters':false},
  'platform/cms-pages.tsx': {'SEO':false},
  'platform/currency-monitoring.tsx': {'Currency Policy Reminder':false},
  'platform/settings.tsx': {'Other config keys':false},
  'platform/tech-costs.tsx': {'Assumptions':false,'Cost breakdown':true},
};
const changed=[];
const clean = s => s.replaceAll('&amp;','&').replace(/\s+/g,' ').trim();
for (const [relative,titles] of Object.entries(decisions)) {
  const filename=path.join('src/pages/admin',relative),source=fs.readFileSync(filename,'utf8');
  const file=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[],found=new Set();
  function visit(node) {
    if (ts.isJsxElement(node)&&['Card','PortalCard'].includes(node.openingElement.tagName.getText(file))) {
      const tag=node.openingElement.tagName.getText(file);
      const header=node.children.find(c=>ts.isJsxElement(c)&&c.openingElement.tagName.getText(file)==='CardHeader'
        ||ts.isJsxSelfClosingElement(c)&&c.tagName.getText(file)==='PortalCardHeader');
      let title='';
      if (header&&ts.isJsxSelfClosingElement(header)) {
        const attr=header.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(file)==='title');
        if (attr?.initializer&&ts.isStringLiteral(attr.initializer)) title=attr.initializer.text;
      } else if(header) {
        function findTitle(n) {
          if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(file)==='CardTitle')
            title=n.children.filter(ts.isJsxText).map(c=>c.text).join(' ');
          else ts.forEachChild(n,findTitle);
        }
        findTitle(header);
      }
      title=clean(title);
      const body=node.children.filter(c=>ts.isJsxElement(c)&&c.openingElement.tagName.getText(file)==='CardContent');
      let parent=node.parent,inDialog=false;
      while(parent){if(ts.isJsxElement(parent)&&/^(DialogContent|AlertDialogContent|SheetContent)$/.test(parent.openingElement.tagName.getText(file)))inDialog=true;parent=parent.parent;}
      if(title in titles && !inDialog && (tag==='PortalCard'||body.length===1)) {
        found.add(title);
        const has=node.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(file)==='collapsible');
        if(!has) {
          edits.push({pos:node.openingElement.tagName.end,text:` collapsible defaultOpen={${titles[title]}} collapseLabel=${JSON.stringify(title)}`});
          changed.push({file:filename.replaceAll('\\','/'),title,defaultOpen:titles[title]});
        }
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(file);
  let updated=source;
  for(const e of edits.sort((a,b)=>b.pos-a.pos))updated=updated.slice(0,e.pos)+e.text+updated.slice(e.pos);
  if(edits.length)fs.writeFileSync(filename,updated);
  for(const title of Object.keys(titles))if(!found.has(title))console.log('Review unmatched section:',relative,title);
}
fs.writeFileSync('tmp/ui-normalization/section-decisions.json',JSON.stringify(changed,null,2));
console.log(`Applied ${changed.length} explicit section defaults across ${new Set(changed.map(c=>c.file)).size} pages.`);
