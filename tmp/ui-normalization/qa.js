const fs=require('fs');const p='src/components/order/OrderQuickActions.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a=s.indexOf('  const chipBase = ');const b=s.lastIndexOf('}');
const nu=`  // One action bar, three labelled groups. Every chip shares one neutral
  // style; colour lives only in the icon so the row reads calmly.
  const chip = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary";
  const groupLabel = "mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm print:hidden">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={groupLabel}>Team</span>
        <Link href={withSlug(\`/admin/order-assignments?orderId=\${order.id}\`)} className={chip} title="Choose the driver for this order">
          <Truck className="h-3.5 w-3.5 text-blue-600" />
          {order.assigned_driver_id ? "Change driver" : "Assign driver"}
        </Link>
        <Link href={withSlug(\`/admin/orders/\${order.id}/ticket\`)} className={chip} title="Choose kitchen team members for this order's prep tasks">
          <ChefHat className="h-3.5 w-3.5 text-orange-600" />
          {order.assigned_chef_id ? "Change kitchen" : "Assign kitchen"}
        </Link>
        <Link href={withSlug(\`\${staffOrderHref(order.id, "admin")}#section-waiter\`)} className={chip} title="Open the Service team section to assign or remove waiters">
          <UserPlus className="h-3.5 w-3.5 text-amber-600" />
          Assign waiter
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={groupLabel}>Client</span>
        {phone && (
          <>
            <a href={\`tel:\${phone.replace(/[^+\d]/g, "")}\`} className={chip} title={\`Call \${phone}\`}>
              <Phone className="h-3.5 w-3.5 text-slate-500" />
              Call
            </a>
            <a
              href={\`https://wa.me/\${phone.replace(/[^\d]/g, "")}?text=\${encodeURIComponent(waMessage)}\`}
              target="_blank"
              rel="noopener noreferrer"
              className={chip}
              title="Open WhatsApp pre-filled"
            >
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
              WhatsApp
            </a>
          </>
        )}
        {email && (
          <a href={\`mailto:\${email}?subject=\${encodeURIComponent(emailSubject)}\`} className={chip} title={\`Email \${email}\`}>
            <Mail className="h-3.5 w-3.5 text-slate-500" />
            Email
          </a>
        )}
        <button type="button" onClick={openClientPreview} className={chip} title="Open the page the client sees in a new tab">
          <Eye className="h-3.5 w-3.5 text-slate-500" />
          Client view
        </button>
        <button type="button" onClick={copyClientLink} className={chip} title="Copy a tokenised client-view link">
          <Copy className="h-3.5 w-3.5 text-slate-500" />
          Copy link
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={groupLabel}>Documents</span>
        {order.quote_id && (
          <Link href={withSlug(\`/admin/quotes/\${order.quote_id}\`)} className={chip} title="Open the source quote">
            <FileText className="h-3.5 w-3.5 text-slate-500" />
            Quote
          </Link>
        )}
        <Link href={withSlug(\`/admin/invoices?orderId=\${order.id}\`)} className={chip} title="Open the invoice list filtered to this order">
          <Receipt className="h-3.5 w-3.5 text-slate-500" />
          Invoice
        </Link>
      </div>
    </div>
  );
`;
s=s.slice(0,a)+nu+s.slice(b);
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
