import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";

interface Props {
  selectedCount: number;
  busy: boolean;
  onBulkUpdateStatus: (status: string) => void;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
}

/**
 * Sticky toolbar shown above the timeline list when at least one
 * order row is ticked. Bulk status update fans out a single
 * UPDATE..WHERE id IN (...) query via the parent's bulkUpdateStatus
 * handler. Cancellation stays on the per-order cancel dialog (refund
 * semantics don't suit a quick fan-out).
 *
 * Self-contained: takes the count + handlers as props so it can be
 * lifted out of the page without dragging closure state.
 *
 * Extracted from inline in src/pages/admin/orders.tsx (P2-13
 * orders Phase D3 partial split).
 */
export function OrdersBulkActionsBar({
  selectedCount,
  busy,
  onBulkUpdateStatus,
  onSelectAllVisible,
  onClearSelection,
}: Props) {
  if (selectedCount <= 0) return null;

  return (
    <div className="sticky top-0 z-10 bg-white border border-blue-200 rounded-lg shadow-sm p-3 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-blue-900">
        {selectedCount} selected
      </span>
      <div className="flex items-center gap-2 ml-auto flex-wrap">
        <Select onValueChange={onBulkUpdateStatus} disabled={busy}>
          <SelectTrigger className="w-48 h-9">
            <SelectValue placeholder="Move to status..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="preparing">In prep</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="in_transit">In transit</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={onSelectAllVisible} disabled={busy}>
          Select all visible
        </Button>
        <Button variant="ghost" size="sm" onClick={onClearSelection} disabled={busy}>
          <X className="w-4 h-4 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
