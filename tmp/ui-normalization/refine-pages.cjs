const fs=require('fs'),ts=require('typescript');
const subtitles={
 'ai-brain':'Add approved company information and choose which roles can use it in the assistant.',
 'ai-brain/access':'Choose which roles can access live company information through the assistant.',
 'audit-logs':'Search recorded changes to orders, quotes, payments and staff activity.',
 'calendar':'See booked events, select a day and check the work coming next.',
 'cleaning-schedule':'Plan cleaning shifts and check coverage and recorded hours.',
 'company-profile':'Update your company identity, EFT banking details and operating location.',
 'contacts':'Find leads and clients, review their history and choose the next follow-up.',
 'daily-operations':'Set the daily kitchen and equipment cleaning tasks for your company.',
 'driver-management':'Manage drivers, their vehicles and pay rates.',
 'driver-schedule':'Plan driver shifts and review their recorded hours.',
 'driver-settlement':'Review driver pay for the selected period and record completed payouts.',
 'email-settings':'Set your sender identity, verify your domain and choose automatic client emails.',
 'email-templates':'Edit client email templates, review sent messages and manage automation.',
 'equipment':'Manage equipment, check availability and arrange hire-in cover for shortages.',
 'event-profitability':'Compare completed event revenue with recorded operating costs.',
 'exceptions':'Review unresolved issues and open the work that needs your attention.',
 'hr-solutions':'Review staff hours, wages and access, then open the tool you need.',
 'integrations':'Connect accounting tools, API keys and webhooks to your company.',
 'integrations/embed':'Create an enquiry form, preview it and copy the code for your website.',
 'inventory':'Check stock levels, adjust quantities and review upcoming shortages.',
 'invoices':'Create invoices, review payments and follow up on outstanding balances.',
 'kitchen-schedule':'Check today’s kitchen coverage and open the full schedule to plan shifts.',
 'kitchen-settings':'Set prep timing, shift thresholds and dietary alerts for your kitchen.',
 'kitchen-settlement':'Review kitchen wages for the selected period and record completed payouts.',
 'kitchen-staff':'Manage kitchen staff and their pay rates.',
 'leads':'Review enquiries, update their progress and create quotes for ready clients.',
 'leads/new':'Record the client’s contact details and event requirements.',
 'menu':'Manage dishes, prices, dietary details and recipes.',
 'money-health':'Review email delivery and payment reconciliation issues, then open the affected records.',
 'notification-settings':'Choose which alerts your company receives and how they are delivered.',
 'notifications':'Review company alerts and open the related order, payment or task.',
 'offering':'Manage menu and equipment offerings and review what clients request.',
 'onboarding/clients':'Import existing clients or add them individually to get started.',
 'onboarding/import':'Upload a spreadsheet, check the mapping and preview records before importing.',
 'onboarding/imports':'Review previous imports and open their results.',
 'onboarding':'Complete the setup steps needed to run your company.',
 'onboarding/receipts':'Upload purchase receipts and review the extracted details.',
 'order-assignments':'Assign drivers and staff, then check that booked orders have coverage.',
 'orders':'Review booked events, check their progress and open an order to manage it.',
 'outsource-providers':'Manage external service providers and their event bookings.',
 'outsource-providers/[id]':'Review this provider’s contacts, bookings and billing history.',
 'outstanding-balances':'Review unpaid invoice balances and follow up with the client.',
 'payment-gateways':'Connect a payment provider and choose the active gateway for client payments.',
 'public-holidays':'Review holiday dates and add company holidays used for shift pay.',
 'quotes':'Create and send quotes, track client replies and follow up on pending decisions.',
 'quotes/[id]':'Review the client request, price the items and save or send the quote.',
 'recurring-invoices':'Set a billing schedule and review the invoice templates used each cycle.',
 'refunds':'Review refunds and credits and complete any payouts that need manual action.',
 'regions':'Manage branches, their teams and delivery settings.',
 'reviews':'Read client feedback and follow up on reviews that need attention.',
 'settings':'Open a setup area or update the operational defaults used by your company.',
 'shopping':'Review what needs buying now and plan purchases for upcoming events.',
 'suppliers':'Manage supplier contacts, products and purchase history.',
 'suppliers/[id]':'Review this supplier’s contacts, purchases, products and receipts.',
 'tax-purchases':'Review recorded deductible purchases for your accountant.',
 'teams':'Check coverage and current work across your kitchen, drivers, cleaning and shopping teams.',
 'teams/kitchen':'Check kitchen coverage, manage the roster and record handover notes.',
 'teams/cleaning':'Check cleaning coverage, manage the roster and record handover notes.',
 'teams/drivers':'Check driver coverage, deliveries and upcoming assignments.',
 'teams/shopping':'Review purchases, receipts and upcoming shopping work.',
 'users':'Invite staff and manage their roles and access; manage client accounts in Contacts.',
 'vehicles':'Manage your fleet and the vehicle capabilities used for dispatch.',
 'wages':'Review recorded hours and wages across teams and track completed payouts.',
 'white-label':'Set your company logo and colours for client pages and outgoing emails.',
};
const descriptions={
 'Identity':'The business name and contact details shown to clients and staff.',
 'Region & currency':'Timezone, currency and location settings used across your company.',
 'Peak season':'Choose the months used for seasonal planning reminders.',
 'Cash on hand staleness':'Choose when an old bank-balance entry needs a reminder.',
 'VAT registration':'Tax registration and rate settings for quotes and invoices.',
 'Banking details':'The company bank account and instructions shown when clients choose EFT.',
 'Kitchen / HQ address':'The starting location used for delivery distance and route planning.',
 'Brand colours + logo':'Open branding settings to change how your company appears to clients.',
 'Document numbering':'Invoice, quote and order prefixes and next-number settings.',
 'Filters':'Narrow the records by date, activity or person.',
 'Gap finder':'Days with pending quotes and no booked events in the next 30 days.',
 'Quick Actions':'Shortcuts to create work or open the related working page.',
 'Quick actions':'Open the pages that contribute to your cashflow forecast.',
 'Driver portal access':'Help drivers reach their portal and understand the available actions.',
 'Use your own sending domain':'Verify your company domain for branded client emails.',
 'Sender identity':'The sender name and address used for your company’s emails.',
 'When to email clients automatically':'Choose the event updates sent to clients without a manual send.',
 'Mailchimp (bulk campaigns)':'Bulk campaign integration availability and next steps.',
 'Get a Zap running in 60 seconds':'A short guide to connecting your first automation.',
 'Xero accounting':'Connect company accounting through the supported automation setup.',
 'QuickBooks Online':'Check the accounting connection and sync settings.',
 'Outbound webhooks':'Company event destinations and the notifications they receive.',
 'Inbound API keys':'Keys that allow your tools to send data into this company.',
 'Catering Zap recipes':'Example automations for leads, orders and payments.',
 'Sage Business Cloud (Pastel)':'Check the accounting connection and required sync defaults.',
 'Email Notifications':'Choose the company events delivered by email.',
 'Push Notifications':'Choose which events create push alerts.',
 'SMS Notifications':'Choose text-message alerts and review their availability.',
 'WhatsApp Notifications':'Choose WhatsApp alerts and review their availability.',
 'Client + event':'Client contact details, venue, date and event requirements.',
 'Menu items':'Select dishes and review quantities, prices and dietary details.',
 'Equipment':'Optional equipment items and their quantities and prices.',
 'Pricing adjustments':'Optional discounts, delivery charges and other price changes.',
 'Notes':'Additional information included with the client’s quote.',
 'Client preview':'Review how the current quote will appear to the client.',
 'Pricing':'Review the quote’s prices, charges and total before saving.',
 'Note to the client':'Optional message displayed with the quote.',
 'PayFast Flow Test':'Review the existing payment diagnostic before starting it.',
 'Usage This Quarter':'Company usage compared with the limits of your subscription.',
 'Billing History':'Previous subscription invoices and their payment statuses.',
 'Danger Zone':'Account cancellation controls; review the consequences before continuing.',
 'Financial Summary':'Money received, known costs and the resulting cash position.',
 'Revenue Projections':'Expected revenue from upcoming booked events.',
 'Expense Tracking':'Recorded wages and estimated inventory costs.',
 'Per-branch P&L':'Revenue and balances grouped by operating branch.',
 'Route Details & Stops':'Stop order, distances and timings for the selected route.',
 'Payment History':'Recorded staff payouts for the selected period.',
 'Where the rest lives':'Related pages for staff roles, rates, shifts and wage summaries.',
 'Logo & Organization':'The company logo and display name shown on client pages.',
 'Color Palette':'Choose the brand colours used for your company.',
 'Live Preview':'Preview the current branding before saving.',
};
const changed=[];
for(const item of JSON.parse(fs.readFileSync('tmp/ui-normalization/route-inventory.json','utf8')).filter(x=>!x.route.startsWith('/admin/platform'))){
 const source=fs.readFileSync(item.file,'utf8'),file=ts.createSourceFile(item.file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
 const relative=item.route.replace(/^\/admin\//,'');
 let needsDescription=false;
 const attr=(attrs,name)=>attrs.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(file)===name);
 function visit(n){
  if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(file)==='PortalHeader'&&subtitles[relative]){
   const subtitle=attr(n.attributes,'subtitle');
   // Keep status-driven descriptions, number/status chips, and embedded links.
   if(subtitle?.initializer&&ts.isStringLiteral(subtitle.initializer))edits.push({start:subtitle.initializer.getStart(file),end:subtitle.initializer.end,text:JSON.stringify(subtitles[relative])});
  }
  if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(file)==='Card'){
   const label=attr(n.openingElement.attributes,'collapseLabel')?.initializer;
   if(label&&ts.isStringLiteral(label)&&descriptions[label.text]){
    const header=n.children.find(c=>ts.isJsxElement(c)&&c.openingElement.tagName.getText(file)==='CardHeader');
    let title,hasDesc=false;
    const find=c=>{if(ts.isJsxElement(c)){if(c.openingElement.tagName.getText(file)==='CardTitle')title=c;if(c.openingElement.tagName.getText(file)==='CardDescription')hasDesc=true;}ts.forEachChild(c,find);};
    if(header)find(header);
    if(title&&!hasDesc){edits.push({start:title.end,end:title.end,text:`\n<CardDescription>${descriptions[label.text]}</CardDescription>`});needsDescription=true;}
   }
  }
  ts.forEachChild(n,visit);
 }visit(file);
 if(needsDescription){
  const importNode=file.statements.find(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='@/components/ui/card');
  if(importNode?.importClause?.namedBindings&&!importNode.importClause.namedBindings.elements.some(x=>x.name.text==='CardDescription'))edits.push({start:importNode.importClause.namedBindings.end-1,end:importNode.importClause.namedBindings.end-1,text:', CardDescription '});
 }
 if(edits.length){let updated=source;for(const e of edits.sort((a,b)=>b.start-a.start))updated=updated.slice(0,e.start)+e.text+updated.slice(e.end);fs.writeFileSync(item.file,updated);changed.push({route:item.route,edits:edits.length});}
}
fs.writeFileSync('tmp/ui-normalization/page-copy-decisions.json',JSON.stringify(changed,null,2));
console.log(`Refined page descriptions and section summaries on ${changed.length} company routes.`);
