import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface KitchenMenuItemPreviewData {
  url: string | null;
  itemName: string;
  quantity: number | null;
  description: string | null;
  category: string | null;
  dietaryTags: string[];
  allergens: string[];
  specialInstructions: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  isBuyAndSell: boolean;
  isOutsourced: boolean;
}

interface Props {
  item: KitchenMenuItemPreviewData | null;
  onOpenChange: (open: boolean) => void;
}

export function KitchenMenuItemPreviewDialog({ item, onOpenChange }: Props) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [item?.url, item?.itemName]);

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-3 sm:p-5">
        <DialogHeader>
          <DialogTitle>{item?.itemName || "Menu item"}</DialogTitle>
          <DialogDescription>Reference photo and kitchen details for this order item.</DialogDescription>
        </DialogHeader>
        {item && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.75fr)]">
            <div className="flex min-h-52 items-center justify-center overflow-hidden rounded-md bg-slate-50 p-2 dark:bg-slate-900 sm:min-h-72">
              {item.url && !imageFailed ? (
                <img
                  src={item.url}
                  alt={`Kitchen reference for ${item.itemName}`}
                  onError={() => setImageFailed(true)}
                  className="max-h-[60vh] max-w-full object-contain"
                />
              ) : (
                <div
                  role="img"
                  aria-label={`No photo available for ${item.itemName}`}
                  className="flex flex-col items-center gap-2 p-6 text-center text-slate-500 dark:text-slate-400"
                >
                  <ImageIcon className="h-8 w-8 text-slate-400" />
                  <span className="text-sm">No photo is available for this menu item.</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {item.quantity != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-orange-50 px-2.5 py-1.5 text-sm font-semibold text-orange-900 dark:bg-orange-950/40 dark:text-orange-200">
                    <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Order quantity</span>
                    {item.quantity}
                  </span>
                )}
                {item.isBuyAndSell && (
                  <span className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">Buy-and-sell</span>
                )}
                {item.isOutsourced && (
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Outsourced</span>
                )}
              </div>

              {item.description && (
                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Description</h3>
                  <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">{item.description}</p>
                </section>
              )}

              {(item.category || item.dietaryTags.length > 0 || item.allergens.length > 0) && (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Category and dietary information</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {item.category && (
                      <span className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">{item.category}</span>
                    )}
                    {item.dietaryTags.map((tag) => (
                      <span key={tag} className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">{tag}</span>
                    ))}
                    {item.allergens.map((allergen) => (
                      <span key={allergen} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Allergen: {allergen}</span>
                    ))}
                  </div>
                </section>
              )}

              {item.specialInstructions && (
                <section className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">Special instructions</h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-amber-950 dark:text-amber-100">{item.specialInstructions}</p>
                </section>
              )}

              {!item.isBuyAndSell && (item.prepMinutes || item.cookMinutes) && (
                <section className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-200 pt-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {item.prepMinutes ? <p><span className="font-medium text-slate-800 dark:text-slate-100">Prep:</span> {item.prepMinutes} min</p> : null}
                  {item.cookMinutes ? <p><span className="font-medium text-slate-800 dark:text-slate-100">Cook:</span> {item.cookMinutes} min</p> : null}
                </section>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
