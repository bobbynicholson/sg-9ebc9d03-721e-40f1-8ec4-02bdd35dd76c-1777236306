import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUTS: Array<{ section: string; items: Array<{ keys: string[]; label: string }> }> = [
  {
    section: "Quick actions",
    items: [
      { keys: ["R"], label: "Receive stock" },
      { keys: ["C"], label: "Cycle count" },
      { keys: ["W"], label: "Write off" },
      { keys: ["N"], label: "New item" },
    ],
  },
  {
    section: "Navigate",
    items: [
      { keys: ["/"], label: "Focus search" },
      { keys: ["1"], label: "All items" },
      { keys: ["2"], label: "Below reorder" },
      { keys: ["3"], label: "Out of stock" },
      { keys: ["4"], label: "Perishable" },
      { keys: ["Esc"], label: "Clear search / close" },
    ],
  },
  {
    section: "Help",
    items: [
      { keys: ["?"], label: "Show this dialog" },
    ],
  },
];

export function KeyboardShortcutsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-slate-600" />
            Keyboard shortcuts
          </DialogTitle>
          <p className="text-sm text-slate-500">
            Shortcuts work on this page when you're not typing in a field.
          </p>
        </DialogHeader>

        <div className="space-y-5">
          {SHORTCUTS.map(group => (
            <div key={group.section}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {group.section}
              </p>
              <ul className="space-y-1.5">
                {group.items.map(item => (
                  <li key={item.label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{item.label}</span>
                    <span className="flex items-center gap-1">
                      {item.keys.map(k => (
                        <kbd
                          key={k}
                          className="px-2 py-0.5 text-xs font-mono font-semibold text-slate-700 bg-slate-100 border border-slate-300 rounded shadow-[inset_0_-1px_0_0_#cbd5e1]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
