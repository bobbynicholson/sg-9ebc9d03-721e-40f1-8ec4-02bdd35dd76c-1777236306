import type { RefObject } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, Download } from "lucide-react";
import type { SavedView } from "./types";

interface Props {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement>;

  statusFilter: string;
  onStatusFilterChange: (value: string) => void;

  dateFilter: string;
  onDateFilterChange: (value: string) => void;

  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;

  myOrdersOnly: boolean;
  onMyOrdersOnlyChange: (value: boolean) => void;

  savedViews: SavedView[];
  onApplySavedView: (view: SavedView) => void;
  onRemoveSavedView: (id: string) => void;
  onSaveCurrentView: () => void;

  /** Export the currently-filtered list to CSV. When omitted the button
   *  is hidden (rather than rendering a dead control). */
  onExport?: () => void;
}

const QUICK_DATE_FILTERS: Array<{ key: string; label: string }> = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "next30", label: "Next 30 days" },
  { key: "past", label: "Past events" },
];

/**
 * Filters bar at the top of /admin/orders: search input, status +
 * date dropdowns, custom-range pickers, the export button, and the
 * saved-views / quick-filter chip strip with the "Mine only" toggle.
 *
 * State lives in the parent so other surfaces (the table, the stats
 * derivation, the URL sync effect, the localStorage persistence)
 * keep reading from the same source. This component is pure
 * presentation - it exposes change callbacks for every input.
 *
 * Extracted from inline in src/pages/admin/orders.tsx (P2-13 orders
 * Phase D2 split).
 */
export function OrderFiltersBar({
  searchTerm,
  onSearchTermChange,
  searchRef,
  statusFilter,
  onStatusFilterChange,
  dateFilter,
  onDateFilterChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  myOrdersOnly,
  onMyOrdersOnlyChange,
  savedViews,
  onApplySavedView,
  onRemoveSavedView,
  onSaveCurrentView,
  onExport,
}: Props) {
  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="pt-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              ref={searchRef}
              placeholder="Search by client, order ID, venue or event... (press /)"
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              className="pl-10 pr-10"
            />
            {/* Phase 24 #7: clear-search affordance. Common across
                SaaS search inputs but missing here - operators kept
                selecting + deleting the whole string by hand to
                reset the view. */}
            {searchTerm && (
              <button
                type="button"
                onClick={() => onSearchTermChange("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="w-full md:w-[200px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              {/* Wave 54.5 - sentence-case + add Paused + Cancelled
                  so paused orders are filterable and cancelled
                  orders are reachable from this page (pre-Wave-54
                  they were excluded from default views with no
                  filter route in). */}
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="preparing">In prep</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="in_transit">In transit</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={onDateFilterChange}>
            <SelectTrigger className="w-full md:w-[200px]">
              <SelectValue placeholder="All Dates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="next30">Next 30 days</SelectItem>
              <SelectItem value="past">Past events</SelectItem>
              <SelectItem value="custom">Custom range...</SelectItem>
            </SelectContent>
          </Select>
          {dateFilter === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                className="w-[150px]"
                title="From"
              />
              <span className="text-slate-400 text-xs">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                className="w-[150px]"
                title="To"
              />
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2"
                  onClick={() => {
                    onDateFromChange("");
                    onDateToChange("");
                  }}
                  title="Clear range"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          )}
          {onExport && (
            <Button variant="outline" className="gap-2" onClick={onExport}>
              <Download className="w-4 h-4" />
              Export
            </Button>
          )}
        </div>
        {/* Phase 13 #5 + 13 #8: saved views chip strip with a 'Mine
            only' toggle. Saved views snap back to named filter
            snapshots; mine-only restricts the list to orders where
            I'm the chef or driver. */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {/* Phase 16 #5: quick-filter chips. One-tap shortcuts to
              common date scopes - sets dateFilter without opening
              the dropdown. Highlights when active so it doubles as
              a status indicator. */}
          {QUICK_DATE_FILTERS.map((q) => (
            <button
              key={q.key}
              type="button"
              onClick={() => onDateFilterChange(dateFilter === q.key ? "all" : q.key)}
              className={`inline-flex items-center rounded-full text-xs px-2.5 py-0.5 border ${
                dateFilter === q.key
                  ? "border-brand-primary bg-brand-primary/15 text-brand-primary"
                  : "border-slate-200 bg-white text-slate-600 hover:border-brand-primary/30 hover:text-brand-primary"
              }`}
              title={`Filter to ${q.label.toLowerCase()}`}
            >
              {q.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onMyOrdersOnlyChange(!myOrdersOnly)}
            className={`inline-flex items-center gap-1 rounded-full text-xs px-2.5 py-0.5 border ${
              myOrdersOnly
                ? "border-blue-500 bg-blue-100 text-blue-800"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
            }`}
            title="Restrict to orders where I'm the chef or driver"
          >
            Mine only
          </button>
          {savedViews.map((v) => (
            <span
              key={v.id}
              className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-xs"
            >
              <button
                type="button"
                onClick={() => onApplySavedView(v)}
                className="px-2.5 py-0.5 hover:underline"
                title="Apply this saved view"
              >
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => onRemoveSavedView(v.id)}
                className="pr-1.5 text-purple-500 hover:text-purple-800"
                title="Remove this view"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onSaveCurrentView}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 text-slate-500 text-xs px-2.5 py-0.5 hover:border-purple-300 hover:text-purple-700"
            title="Save the current filter combination as a named view"
          >
            + Save view
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
