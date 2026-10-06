const fs=require('fs');
function rep(p,a,b){let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');if(!s.includes(a))throw p;s=s.replace(a,b);fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok',p);}
rep('src/pages/admin/financial-dashboard.tsx',`            <Card className="mb-6 border-2 border-brand-primary/20 bg-brand-primary/10">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-md bg-brand-primary/15 text-brand-primary flex items-center justify-center shrink-0">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Cashflow forecast moved</p>
                    <p className="text-sm text-slate-600">
                      The 30-day projected balance chart, payables and fixed costs now live on the Cashflow dashboard.
                    </p>
                  </div>
                </div>
                <Link href={withSlug("/admin/cashflow-dashboard")}>
                  <Button size="sm" className="bg-brand-primary hover:bg-brand-primary/90 whitespace-nowrap">
                    Open cashflow dashboard
                  </Button>
                </Link>
              </CardContent>
            </Card>`,`            <p className="mb-4 flex items-center gap-1.5 text-xs text-slate-500">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              The 30-day forecast, payables and fixed costs are on the{" "}
              <Link href={withSlug("/admin/cashflow-dashboard")} className="font-semibold text-brand-primary hover:underline">Cashflow page</Link>.
            </p>`);
rep('src/pages/admin/tax-purchases.tsx',`            <Card className="bg-brand-primary/10 mb-4">
              <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
                <ShoppingCart className="w-5 h-5 text-brand-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-brand-primary">All edits happen on the Shopping dashboard</p>
                  <p className="text-xs text-brand-primary/80">
                    Add slips, mark lines deductible, rescan with AI and intake stock all in one place. This page is read-only on purpose.
                  </p>
                </div>
                <Link href={withSlug("/admin/shopping?tab=receipts")} className="text-brand-primary hover:text-brand-primary inline-flex items-center gap-1 text-xs font-semibold">
                  Go to receipts tab <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </CardContent>
            </Card>`,`            <p className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
              This page is read-only. Add and edit slips on{" "}
              <Link href={withSlug("/admin/shopping?tab=receipts")} className="inline-flex items-center gap-1 font-semibold text-brand-primary hover:underline">
                Shopping receipts <ExternalLink className="h-3 w-3" />
              </Link>
            </p>`);
