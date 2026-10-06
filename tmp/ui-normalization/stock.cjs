const fs=require('fs');
function edit(p,pairs){let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');for(const [a,b] of pairs){if(!s.includes(a))throw new Error(p+' missing: '+a.slice(0,70));s=s.replace(a,b);}fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok',p);}
edit('src/pages/team-portal/shopping/buy-list.tsx',[
 [`      const enriched = ((outlookRes.data || []) as OutlookRow[]).map(r => ({
        ...r,
        cost_per_unit: costMap.get(r.inventory_item_id) ?? 0,
      }));`,`      const enriched = ((outlookRes.data || []) as OutlookRow[]).map(r => ({
        ...r,
        // Items AT their minimum need buying too (reorder point).
        status: effectiveOutlookStatus(r),
        cost_per_unit: costMap.get(r.inventory_item_id) ?? 0,
      }));`],
 [`  below_minimum: { label: "Below par",`,`  below_minimum: { label: "At or below minimum",`],
 [`  ok:            { label: "OK",         tone: "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30",`,
  `  ok:            { label: "OK",         tone: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",`],
]);
edit('src/hooks/useShoppingLiveCounts.ts',[
 [`        sb
          .from("inventory_demand_outlook")
          .select("inventory_item_id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .in("status", ["shortfall", "below_minimum", "low"]),`,`        // Same rule as the Buy list: items AT their minimum count too,
        // so the few columns needed are fetched and counted here.
        sb
          .from("inventory_demand_outlook")
          .select("inventory_item_id, status, current_stock, minimum_stock")
          .eq("company_id", companyId),`],
 [`      setShortItems(shortRes?.count || 0);`,`      setShortItems(
        ((shortRes?.data || []) as Array<{ status: string | null; current_stock: number | null; minimum_stock: number | null }>)
          .filter((r) => effectiveOutlookStatus(r) !== "ok").length,
      );`],
]);
