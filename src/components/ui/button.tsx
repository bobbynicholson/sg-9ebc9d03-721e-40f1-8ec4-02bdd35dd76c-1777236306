import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Press feedback (active:scale) is feedback, not decoration -- it belongs on
  // every pressable element so the UI feels like it heard the click. Easing is
  // the strong ease-out curve (matches --ease-out); transition lists exact
  // properties (never `all`) and stays snappy at 150ms.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-standard active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 dark:focus-visible:ring-brand-primary/50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-brand-primary text-white shadow-sm hover:bg-brand-primary/90 dark:bg-brand-primary dark:text-white dark:hover:bg-brand-primary/90",
        destructive:
          "bg-rose-600 text-white shadow-sm hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400",
        outline:
          "border border-slate-300 bg-white text-slate-800 shadow-xs hover:border-brand-primary/40 hover:bg-brand-primary/10 hover:text-brand-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-brand-primary/40 dark:hover:bg-brand-primary/10 dark:hover:text-brand-primary",
        secondary:
          "bg-slate-100 text-slate-900 shadow-sm hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
        ghost: "text-slate-700 hover:bg-brand-primary/10 hover:text-brand-primary dark:text-slate-300 dark:hover:bg-brand-primary/10 dark:hover:text-brand-primary",
        link: "text-brand-primary underline-offset-4 hover:underline dark:text-brand-primary",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        // 44px tap target - meets the >=44px touch-target rule on
        // team-portal tablets and driver phones. Visual on desktop
        // is unchanged (icon buttons read as standard chrome).
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
