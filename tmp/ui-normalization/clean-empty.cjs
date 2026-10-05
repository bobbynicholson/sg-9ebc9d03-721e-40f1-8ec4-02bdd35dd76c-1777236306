const fs=require('fs');
function edit(p,a,b){let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');if(!s.includes(a))throw new Error('missing in '+p);s=s.replace(a,b);fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok',p);}
edit('src/components/cleaning/CleaningEventBoard.tsx',`          <div className="text-center py-10">
            <Sparkles className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-medium text-slate-700">No events to track right now.</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              When an order moves to <span className="font-mono text-[11px]">confirmed</span>, a handover row lands in <span className="font-semibold">Expected</span>. When the equipment comes back, it flips to <span className="font-semibold">In progress</span>.
            </p>
          </div>`,`          <div className="flex items-start gap-3 py-2">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
            <div>
              <p className="text-sm font-medium text-slate-700">No events to track right now.</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Confirmed events appear here as <span className="font-semibold">Expected</span>, and move to <span className="font-semibold">In progress</span> when the equipment comes back.
              </p>
            </div>
          </div>`);
edit('src/components/cleaning/EquipmentVerificationPanel.tsx',`          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No Pending Verifications</p>
            <p className="text-sm">All equipment returns have been verified</p>
          </div>`,`          <div className="flex items-center gap-3 py-3 text-muted-foreground">
            <Package className="h-5 w-5 shrink-0 opacity-50" />
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Nothing waiting to be verified</p>
              <p className="text-xs">All returned equipment has been checked.</p>
            </div>
          </div>`);
