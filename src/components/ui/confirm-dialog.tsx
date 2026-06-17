/**
 * In-app replacements for the native window.confirm / window.prompt.
 *
 * Why: the browser primitives are unstyled OS chrome, block the JS
 * thread, can't carry brand styling, render badly inside an existing
 * Radix dialog, and on some embedded webviews are suppressed entirely
 * (so a "confirm" silently returns false and the action never runs).
 *
 * Both hooks expose an imperative, promise-based API so they drop
 * straight into the old call sites:
 *
 *   const { confirm, confirmDialog } = useConfirmDialog();
 *   const ok = await confirm({ title: "Discard?", description: "..." });
 *   if (!ok) return;
 *   // ...render {confirmDialog} once in the component tree.
 *
 *   const { prompt, promptDialog } = usePromptDialog();
 *   const name = await prompt({ title: "Name this view" });
 *   if (!name) return;
 */
import * as React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ConfirmOptions {
  title?: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in a destructive (rose) tone. */
  destructive?: boolean;
}

export function useConfirmDialog() {
  const [open, setOpen] = React.useState(false);
  const [opts, setOpts] = React.useState<ConfirmOptions>({});
  const resolver = React.useRef<((v: boolean) => void) | null>(null);

  const confirm = React.useCallback((options: ConfirmOptions = {}) => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  };

  const confirmDialog = (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) settle(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts.title || "Are you sure?"}</AlertDialogTitle>
          {opts.description != null && (
            <AlertDialogDescription className="whitespace-pre-line">
              {opts.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {opts.cancelLabel || "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={opts.destructive ? "bg-rose-600 hover:bg-rose-700 focus:ring-rose-600" : undefined}
          >
            {opts.confirmLabel || "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, confirmDialog };
}

export interface PromptOptions {
  title?: string;
  description?: React.ReactNode;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function usePromptDialog() {
  const [open, setOpen] = React.useState(false);
  const [opts, setOpts] = React.useState<PromptOptions>({});
  const [value, setValue] = React.useState("");
  const resolver = React.useRef<((v: string | null) => void) | null>(null);

  const prompt = React.useCallback((options: PromptOptions = {}) => {
    setOpts(options);
    setValue(options.defaultValue || "");
    setOpen(true);
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (result: string | null) => {
    setOpen(false);
    resolver.current?.(result);
    resolver.current = null;
  };

  const promptDialog = (
    <Dialog open={open} onOpenChange={(o) => { if (!o) settle(null); }}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            settle(value);
          }}
        >
          <DialogHeader>
            <DialogTitle>{opts.title || "Enter a value"}</DialogTitle>
            {opts.description != null && (
              <DialogDescription>{opts.description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-2 py-4">
            {opts.label && <Label htmlFor="prompt-dialog-input">{opts.label}</Label>}
            <Input
              id="prompt-dialog-input"
              autoFocus
              value={value}
              placeholder={opts.placeholder}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => settle(null)}>
              {opts.cancelLabel || "Cancel"}
            </Button>
            <Button type="submit">{opts.confirmLabel || "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return { prompt, promptDialog };
}
