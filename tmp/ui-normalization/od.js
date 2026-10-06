const fs=require('fs');const p='src/components/order/OrderDocument.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a=s.indexOf('  const statusTone = cancelled\n');
const b=s.indexOf('export interface OrderDocumentProps');
if(a<0||b<0) throw 'x';
const nu=`  const statusTone = cancelled
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : postponed
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : status === "completed" || status === "delivered"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-blue-200 bg-blue-50 text-blue-700";
  const isBlocked = currentTimelineStage?.status === "blocked";
  const nowTone = cancelled
    ? "border-rose-200 bg-rose-50"
    : postponed
      ? "border-amber-200 bg-amber-50"
      : isBlocked
        ? "border-rose-200 bg-rose-50"
        : "border-orange-200 bg-orange-50/70";
  const title = order.event_name || order.client_name || "Order";

  // One header for the whole document: who/what/when on the left, status
  // on the right, then a single "Now" strip. The detailed per-stage
  // timeline lives once, in the Status timeline section below - an
  // earlier copy here was computed from the order row alone and showed
  // different counts from the real one.
  return (
    <section className="mb-3 sm:mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:border-slate-300">
      <div className="h-1 bg-gradient-to-r from-brand-primary via-brand-primary/70 to-brand-secondary" aria-hidden="true" />
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 text-xs font-medium text-slate-500">
              {order.order_number && <span className="font-mono">#{order.order_number}</span>}
              {order.client_name && order.event_name && <span>· {order.client_name}</span>}
            </p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-[1.75rem]">
              {title}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
              <span>{eventLabel}</span>
              {order.guest_count ? <span>· {order.guest_count} guests</span> : null}
              {(order.venue_name || order.venue_address) && (
                <span className="min-w-0 max-w-full truncate">· {order.venue_name || order.venue_address}</span>
              )}
            </p>
          </div>
          <Badge variant="outline" className={\`\${statusTone} px-3 py-1 text-xs font-semibold capitalize\`}>
            {cleanStatus(order.status)}
          </Badge>
        </div>

        <div className={\`mt-4 flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-3 \${nowTone}\`}>
          <span
            aria-hidden="true"
            className={\`h-2.5 w-2.5 shrink-0 rounded-full \${cancelled || isBlocked ? "bg-rose-500" : postponed ? "bg-amber-500" : "animate-pulse bg-orange-500 motion-reduce:animate-none"}\`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {cancelled ? "Order cancelled" : postponed ? "Order postponed" : isBlocked ? "Needs attention" : "Now"}
            </p>
            <p className="text-sm font-semibold text-slate-950">
              {displayLabel}
              <span className="font-normal text-slate-600"> · {ownerLabel}{lastStamp ? \` · last update \${lastStamp}\` : ""}</span>
            </p>
            {nextStage && (
              <p className="mt-0.5 text-xs text-slate-600">
                Then: <span className="font-medium text-slate-800">{nextStage.label}</span> ({stageOwner(nextStage, isClient)})
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button size="sm" onClick={() => scrollToSection(currentSectionId)} className="h-8 gap-1.5">
              Go to this step <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => scrollToSection("section-timeline")} className="h-8 gap-1.5 bg-white">
              <Activity className="h-3.5 w-3.5" /> Timeline
            </Button>
            {canJumpToMySection && (
              <Button size="sm" variant="outline" onClick={() => scrollToSection(mySectionId)} className="h-8 bg-white">
                My section
              </Button>
            )}
          </div>
        </div>
        {lastLoadedAt && (
          <p className="mt-2 text-right text-[11px] text-slate-400 print:hidden">
            Updated {lastLoadedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </section>
  );
}

`;
s=s.slice(0,a)+nu+s.slice(b);
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
