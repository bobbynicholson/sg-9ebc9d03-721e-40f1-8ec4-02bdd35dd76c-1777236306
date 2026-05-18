import { Button } from "@/components/ui/button";
import { Tag, Truck, Trash2, X } from "lucide-react";

interface Props {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkReassignSupplier: () => void;
  onBulkReassignCategory: () => void;
  onBulkDelete: () => void;
}

/**
 * Sticky bar that appears at the top of the table when one or more items
 * are selected. All actions operate on the current selection. Mirrors the
 * Stripe / Linear pattern - multi-select feels free and reversible because
 * Clear is always one click away.
 */
export function BulkActionsBar({
  selectedCount,
  onClearSelection,
  onBulkReassignSupplier,
  onBulkReassignCategory,
  onBulkDelete,
}: Props) {
  if (selectedCount === 0) return null;
  return (
    <div className="sticky top-2 z-20 mb-3 rounded-lg border border-slate-900 bg-slate-900 text-white shadow-lg flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">
          {selectedCount} selected
        </span>
        <button
          type="button"
          onClick={onClearSelection}
          className="text-xs text-slate-300 hover:text-white inline-flex items-center gap-1"
        >
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBulkReassignSupplier}
          className="text-white hover:bg-slate-800 gap-1.5 h-8"
        >
          <Truck className="w-3.5 h-3.5" />
          Reassign supplier
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBulkReassignCategory}
          className="text-white hover:bg-slate-800 gap-1.5 h-8"
        >
          <Tag className="w-3.5 h-3.5" />
          Recategorise
        </Button>
        <div className="w-px h-5 bg-slate-700" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onBulkDelete}
          className="text-red-300 hover:bg-red-900 hover:text-red-200 gap-1.5 h-8"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}
