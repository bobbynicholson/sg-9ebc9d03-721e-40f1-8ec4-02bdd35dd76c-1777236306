import * as React from "react";
import { Filter, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AdminSearchField({
  value,
  onChange,
  placeholder,
  inputRef,
  className,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        ref={inputRef}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn("h-10 w-full pl-9 pr-9", inputClassName)}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          title="Clear search"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function AdminControlGroup({
  label,
  icon: Icon = Filter,
  children,
  className,
  contentClassName,
  ...rest
}: {
  label?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("rounded-lg border border-slate-200/80 bg-slate-50/70 p-3", className)} {...rest}>
      {label && (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
      )}
      <div className={cn("flex min-w-0 flex-wrap items-center gap-2", contentClassName)}>
        {children}
      </div>
    </section>
  );
}

const CHIP_TONES = {
  slate: {
    active: "border-slate-800 bg-slate-800 text-white",
    idle: "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
  },
  brand: {
    active: "border-brand-primary bg-brand-primary text-white",
    idle: "border-brand-primary/20 bg-white text-brand-primary hover:bg-brand-primary/10",
  },
  rose: {
    active: "border-rose-600 bg-rose-600 text-white",
    idle: "border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
  },
  amber: {
    active: "border-amber-500 bg-amber-500 text-white",
    idle: "border-amber-200 bg-white text-amber-700 hover:bg-amber-50",
  },
  blue: {
    active: "border-blue-600 bg-blue-600 text-white",
    idle: "border-blue-200 bg-white text-blue-700 hover:bg-blue-50",
  },
  emerald: {
    active: "border-brand-primary bg-brand-primary text-white",
    idle: "border-brand-primary/20 bg-white text-brand-primary hover:bg-brand-primary/10",
  },
} as const;

export type AdminChipTone = keyof typeof CHIP_TONES;

export function AdminFilterChip({
  active,
  label,
  count,
  helper,
  icon: Icon,
  tone = "slate",
  onClick,
  title,
  className,
  chatTag,
}: {
  active: boolean;
  label: React.ReactNode;
  count?: React.ReactNode;
  helper?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: AdminChipTone;
  onClick: () => void;
  title?: string;
  className?: string;
  chatTag?: string;
}) {
  const palette = CHIP_TONES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-chat-tag={chatTag || undefined}
      className={cn(
        "inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        active ? palette.active : palette.idle,
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span className="min-w-0 truncate">{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums",
            active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600",
          )}
        >
          {count}
        </span>
      )}
      {helper && (
        <span className={cn("shrink-0 border-l pl-1.5 text-[10px] font-semibold", active ? "border-white/30 opacity-90" : "border-slate-200 text-slate-500")}>
          {helper}
        </span>
      )}
    </button>
  );
}

export function AdminSavedViewChips<T extends { id: string; name: string }>({
  views,
  onApply,
  onRemove,
  onSave,
  getTitle,
  saveLabel = "Save view",
  className,
}: {
  views: T[];
  onApply: (view: T) => void;
  onRemove: (id: string) => void;
  onSave: () => void;
  getTitle?: (view: T) => string;
  saveLabel?: string;
  className?: string;
}) {
  return (
    <AdminControlGroup
      label="Saved views"
      icon={Filter}
      className={className}
      contentClassName="gap-1.5"
    >
      {views.map((view) => (
        <span key={view.id} className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-700">
          <button
            type="button"
            onClick={() => onApply(view)}
            className="min-w-0 truncate px-2.5 py-1 hover:underline"
            title={getTitle ? getTitle(view) : `Apply ${view.name}`}
          >
            {view.name}
          </button>
          <button
            type="button"
            onClick={() => onRemove(view.id)}
            className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Remove this view"
            aria-label={`Remove ${view.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onSave}
        className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-800"
        title="Save the current filters as a named view"
      >
        + {saveLabel}
      </button>
    </AdminControlGroup>
  );
}

export function AdminSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-grid w-full grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-1 sm:w-auto", className)}>
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold transition",
              active ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
