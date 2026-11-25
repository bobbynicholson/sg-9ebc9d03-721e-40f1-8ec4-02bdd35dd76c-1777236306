import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, X } from "lucide-react";

export function useVisibleBulkSelection(visibleIds: readonly string[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const visibleKey = visibleIds.join("\u0000");

  useEffect(() => {
    const visible = new Set(visibleIds);
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
    // `visibleKey` makes selection follow filters, search, sorting pages,
    // and refreshed data without reacting to a newly allocated ID array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);

  const toggle = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => setSelectedIds(new Set(visibleIds));
  const clear = () => setSelectedIds(new Set());

  return { selectedIds, selectedCount: selectedIds.size, toggle, selectAllVisible, clear };
}

export function BulkDeleteToolbar({
  selectedCount,
  itemLabel,
  busy = false,
  onSelectAllVisible,
  onClear,
  onDelete,
}: {
  selectedCount: number;
  itemLabel: string;
  busy?: boolean;
  onSelectAllVisible: () => void;
  onClear: () => void;
  onDelete: () => void;
}) {
  if (selectedCount === 0) return null;
  const plural = selectedCount === 1 ? itemLabel : `${itemLabel}s`;

  return (
    <div aria-live="polite" aria-atomic="true" className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-primary/25 bg-brand-primary/10 px-3 py-2.5 text-slate-900 shadow-sm sm:px-4">
      <span className="mr-auto text-sm font-semibold text-slate-900">{selectedCount} {plural} selected</span>
      <Button type="button" variant="ghost" size="sm" onClick={onSelectAllVisible} disabled={busy} className="text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary dark:text-brand-primary dark:hover:text-brand-primary">
        Select all visible
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDelete} disabled={busy} className="gap-1.5 border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-200 dark:bg-white dark:text-rose-700 dark:hover:bg-rose-50 dark:hover:text-rose-800">
        <Trash2 className="h-4 w-4" /> Delete selected
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={busy} className="gap-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-600 dark:hover:bg-slate-100 dark:hover:text-slate-900">
        <X className="h-4 w-4" /> Clear
      </Button>
    </div>
  );
}

export function BulkDeleteConfirmDialog({
  open,
  onOpenChange,
  selectedCount,
  itemLabel,
  details,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  itemLabel: string;
  details: string;
  busy?: boolean;
  onConfirm: () => void;
}) {
  const plural = selectedCount === 1 ? itemLabel : `${itemLabel}s`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-slate-200 bg-white text-slate-900 dark:border-slate-200 dark:bg-white dark:text-slate-900">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-slate-950 dark:text-slate-950">Delete {selectedCount} {plural}?</AlertDialogTitle>
          <AlertDialogDescription className="text-slate-600 dark:text-slate-600">{details}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-300 dark:bg-white dark:text-slate-800 dark:hover:bg-slate-50">Cancel</AlertDialogCancel>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={busy || selectedCount === 0}>
            {busy ? "Deleting..." : `Delete ${selectedCount} ${plural}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
