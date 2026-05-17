/**
 * Shopping dashboard -- Wave 70.30 rework.
 *
 * Before: the page generated a synthetic "shopping list" from order
 * items + low-stock inventory and tracked tick state in localStorage.
 * That meant ticks were lost on device switch and never reached a
 * shopping_lists record. The synthetic list also competed with the
 * proper shopping_list workflow on /orders + /buy-list.
 *
 * Now: the page is the canonical "your active shopping list" view.
 * Reads shopping_list_items via useActiveShoppingList, ticks
 * persist to the DB (works across devices). The "what to buy"
 * surface lives on /buy-list -- the dashboard focuses on running
 * the list you've already chosen.
 *
 * Empty state directs to /buy-list to start a list. No more
 * silent auto-creation of synthetic lists.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ShoppingCart, CheckCircle, Clock, Package, ListChecks, Camera,
  ArrowRight, Loader2, User, Users as UsersIcon, AlertCircle, Sparkles,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { DynamicNav } from "@/components/DynamicNav";
import { TeamWelcomeBanner } from "@/components/portal/TeamWelcomeBanner";
import { UserRole } from "@/types/app";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { useActiveShoppingList } from "@/hooks/useActiveShoppingList";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";
import { useToast } from "@/hooks/use-toast";

export default function ShoppingDashboard() {
  const { user } = useAuth();
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const companyId = (user as any)?.company_id || null;
  const tenantCurrency = useTenantCurrency(companyId);
  const activeList = useActiveShoppingList();

  const [filter, setFilter] = useState<"all" | "pending" | "purchased">("pending");
  const [completing, setCompleting] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [actualTotalInput, setActualTotalInput] = useState("");

  const items = activeList.items;
  const bought = items.filter(i => i.purchased);
  const remaining = items.filter(i => !i.purchased);
  const filteredItems = items.filter(i => {
    if (filter === "pending") return !i.purchased;
    if (filter === "purchased") return i.purchased;
    return true;
  });

  // Rough estimate from the notes ("Need X unit, have Y") isn't
  // reliable, so we use the list's estimated_total if set,
  // otherwise leave blank.
  const estimatedTotal = activeList.list?.estimated_total ?? null;
  const yourList = activeList.list?.isYours ?? false;

  const handleToggle = async (itemId: string, currentValue: boolean) => {
    await activeList.togglePurchased(itemId, !currentValue);
  };

  const handleCompleteOpen = () => {
    setActualTotalInput("");
    setCompleteOpen(true);
  };

  const handleCompleteConfirm = async () => {
    const parsed = actualTotalInput.trim() ? Number(actualTotalInput) : undefined;
    if (actualTotalInput.trim() && (Number.isNaN(parsed) || (parsed ?? 0) < 0)) {
      toast({ title: "Enter a valid total", variant: "destructive" });
      return;
    }
    setCompleting(true);
    try {
      await activeList.completeList(parsed);
      toast({
        title: "List complete",
        description: "Snap the receipt to close it out.",
      });
      setCompleteOpen(false);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Shopping Dashboard - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <DynamicNav userRole={UserRole.SHOPPING_STAFF} />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 lg:py-12 max-w-screen-2xl">
          {/* Header */}
          <div className="flex items-center gap-2 sm:gap-3 mb-6 sm:mb-8">
            <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">Shopping Dashboard</h1>
              <p className="text-xs sm:text-sm md:text-base text-slate-600">
                {activeList.list
                  ? "Your active list -- tick items as you buy them"
                  : "Open the Buy list to start a new shopping run"}
              </p>
            </div>
          </div>

          <TeamWelcomeBanner role="shopping" userId={user?.id} />

          {/* Loading + empty states */}
          {activeList.loading ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="py-16 text-center text-slate-500">
                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                Loading your active list...
              </CardContent>
            </Card>
          ) : !activeList.list ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="py-16 text-center">
                <Sparkles className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <h2 className="text-lg font-semibold text-slate-900 mb-1">
                  No active shopping list
                </h2>
                <p className="text-sm text-slate-600 max-w-md mx-auto mb-5">
                  Open the Buy list to see what's short and start a new shopping run. Ticks save automatically once a list is going.
                </p>
                <Link href={withSlug("/team-portal/shopping/buy-list")}>
                  <Button className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 gap-1.5">
                    <ListChecks className="w-4 h-4" />
                    Open Buy list
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Active list hero */}
              <Card className="border-0 shadow-lg mb-6 sm:mb-8">
                <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
                    <Package className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                    <span>{activeList.list.title || "Your shopping list"}</span>
                    <Badge variant="outline" className={yourList
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"
                      : "bg-slate-50 text-slate-700 border-slate-200 gap-1"
                    }>
                      {yourList ? <User className="w-3 h-3" /> : <UsersIcon className="w-3 h-3" />}
                      {yourList ? "Your list" : "Team list"}
                    </Badge>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 capitalize text-[10px]">
                      {activeList.list.status.replace("_", " ")}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  <div className="p-3 sm:p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                      <div>
                        <p className="text-xs sm:text-sm text-slate-600">Items left to buy</p>
                        <p className="text-2xl sm:text-3xl font-bold text-green-600 tabular-nums">
                          {remaining.length}
                          <span className="text-base text-slate-500 font-normal">
                            {" "}of {items.length}
                          </span>
                        </p>
                      </div>
                      {estimatedTotal != null && (
                        <div className="text-left sm:text-right">
                          <p className="text-xs sm:text-sm text-slate-600">Estimated cost</p>
                          <p className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
                            {tenantCurrency.format(estimatedTotal, 0)}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Link href={withSlug("/team-portal/shopping/buy-list")} className="flex-1">
                        <Button variant="outline" className="w-full text-sm sm:text-base h-10 sm:h-11 gap-1.5">
                          <ListChecks className="w-4 h-4" />
                          Add more from Buy list
                        </Button>
                      </Link>
                      <Link href={withSlug("/team-portal/shopping/receipts")} className="flex-1">
                        <Button variant="outline" className="w-full text-sm sm:text-base h-10 sm:h-11 gap-1.5">
                          <Camera className="w-4 h-4" />
                          Snap a receipt
                        </Button>
                      </Link>
                      {remaining.length === 0 && items.length > 0 && (
                        <Button
                          onClick={handleCompleteOpen}
                          className="flex-1 text-sm sm:text-base h-10 sm:h-11 bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Mark list complete
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Metric cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6 md:mb-8">
                <MetricCard
                  icon={ShoppingCart}
                  iconColor="text-blue-600"
                  label="Total items"
                  value={items.length}
                  tooltip="Items on your active shopping list."
                />
                <MetricCard
                  icon={Clock}
                  iconColor="text-orange-600"
                  label="Remaining"
                  value={remaining.length}
                  tooltip="Items still to buy. Tick each one off as you grab it -- progress is saved to the database so it works across devices."
                />
                <MetricCard
                  icon={CheckCircle}
                  iconColor="text-green-600"
                  label="Bought"
                  value={bought.length}
                  tooltip="Items already bought. Tick the box to mark as bought, untick to undo."
                />
                <MetricCard
                  icon={AlertCircle}
                  iconColor="text-amber-600"
                  label="List date"
                  value={activeList.list.list_date ? new Date(activeList.list.list_date).getDate() : "--"}
                  tooltip={`List for ${activeList.list.list_date || "(no date)"}.`}
                />
              </div>

              {/* Filter chips */}
              <div className="flex gap-2 mb-4">
                {(["pending", "all", "purchased"] as const).map(f => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? "default" : "outline"}
                    onClick={() => setFilter(f)}
                    className={filter === f ? "bg-emerald-600 hover:bg-emerald-700 capitalize" : "capitalize"}
                  >
                    {f === "pending" ? "Remaining" : f === "purchased" ? "Bought" : "All"}
                  </Button>
                ))}
                {activeList.refresh && (
                  <Button size="sm" variant="ghost" onClick={activeList.refresh} className="ml-auto text-xs">
                    Refresh
                  </Button>
                )}
              </div>

              {/* Shopping list -- persisted */}
              <Card className="border-0 shadow-lg">
                <CardHeader className="px-3 sm:px-4 md:px-6">
                  <CardTitle className="text-base sm:text-lg md:text-xl">
                    {filter === "pending" ? "Still to buy" : filter === "purchased" ? "Already bought" : "All items"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-4 md:px-6">
                  <div className="space-y-2 sm:space-y-3">
                    {filteredItems.length === 0 ? (
                      <div className="text-center py-8 px-4">
                        <p className="text-sm sm:text-base font-medium text-slate-700">
                          {filter === "pending"
                            ? items.length > 0 ? "All ticked off. Nice work." : "Nothing on the list yet."
                            : filter === "purchased" ? "Nothing bought yet."
                            : "No items on the list."}
                        </p>
                        {items.length === 0 && (
                          <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
                            Head to the <Link href={withSlug("/team-portal/shopping/buy-list")} className="text-emerald-700 underline">Buy list</Link> to add items based on the next 7 days of demand.
                          </p>
                        )}
                      </div>
                    ) : (
                      filteredItems.map(item => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 p-3 sm:p-4 rounded-lg border-2 transition-colors ${
                            item.purchased
                              ? "bg-green-50 border-green-200"
                              : "bg-white border-slate-200 hover:border-emerald-300"
                          }`}
                        >
                          <Checkbox
                            checked={item.purchased}
                            onCheckedChange={() => handleToggle(item.id, item.purchased)}
                            className="w-5 h-5 flex-shrink-0"
                            aria-label={`Mark ${item.name} as ${item.purchased ? "not bought" : "bought"}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <h4 className={`font-semibold text-sm sm:text-base ${
                                item.purchased ? "line-through text-slate-500" : "text-slate-900"
                              }`}>
                                {item.name}
                              </h4>
                              <Badge variant="outline" className="text-xs tabular-nums">
                                {Number(item.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })} {item.unit || ""}
                              </Badge>
                            </div>
                            {item.notes && (
                              <p className="text-xs sm:text-sm text-slate-600 italic truncate">
                                {item.notes}
                              </p>
                            )}
                          </div>
                          {item.purchased ? (
                            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                          ) : (
                            <Clock className="w-5 h-5 text-orange-600 flex-shrink-0" />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {activeList.error && (
                <p className="text-xs text-rose-600 mt-3 text-center">
                  {activeList.error}
                </p>
              )}
            </>
          )}
        </div>

        <Footer />
      </div>

      {/* Complete-list dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark list complete</DialogTitle>
            <DialogDescription>
              Records the actual total spent and closes the list. You can still upload a receipt afterwards from the Receipts page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="total">Actual total spent ({tenantCurrency.symbol})</Label>
              <Input
                id="total"
                type="number"
                min="0"
                step="0.01"
                value={actualTotalInput}
                onChange={e => setActualTotalInput(e.target.value)}
                placeholder="Leave blank if not known yet"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)} disabled={completing}>
              Cancel
            </Button>
            <Button
              onClick={handleCompleteConfirm}
              disabled={completing}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {completing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving</> : "Mark complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChatBot userRole="shopping" companyId={companyId} />
    </>
  );
}
