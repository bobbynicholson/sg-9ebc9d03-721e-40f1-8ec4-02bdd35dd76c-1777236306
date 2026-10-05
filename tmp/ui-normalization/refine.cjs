const fs = require('fs');
const p = 'src/components/portal/ui.tsx';
let s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); s = s.replace(a, b); };

// Softer, more refined elevation for every portal card.
rep(`  "shadow-[0_1px_2px_rgba(15,23,42,0.05),0_8px_16px_-8px_rgba(15,23,42,0.08),0_24px_48px_-24px_rgba(15,23,42,0.16)]";`,
    `  "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_-6px_rgba(15,23,42,0.08)]";`);

// Stat tile: sentence-case label, neutral icon chip, larger value, gentle hover.
rep(`        "group relative overflow-hidden rounded-xl border border-slate-200/90 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900/95",
        SOFT_SHADOW,
        className,
      )}
    >
      {/* Hairline brand tick in the top corner - reads as a designed
          object without shouting. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-[2px] w-10 rounded-br-full bg-gradient-to-r from-brand-primary/70 to-transparent"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase leading-4 tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        {Icon && (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-primary/20 bg-gradient-to-br from-brand-primary/12 to-brand-secondary/8 text-brand-primary dark:border-brand-primary/30 dark:from-brand-primary/15 dark:to-brand-secondary/10 dark:text-brand-primary">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold leading-none tracking-tight tabular-nums text-slate-950 dark:text-white">`,
`        "group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 transition-[border-color,box-shadow] duration-200 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/95 dark:hover:border-slate-700",
        SOFT_SHADOW,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium leading-5 text-slate-500 dark:text-slate-400">{label}</p>
        {Icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors group-hover:bg-brand-primary/10 group-hover:text-brand-primary dark:bg-slate-800 dark:text-slate-400">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p className="text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums text-slate-950 dark:text-white">`);
rep(`      {hint && <p className="mt-1 text-xs leading-4 text-slate-600 dark:text-slate-400">{hint}</p>}`,
    `      {hint && <p className="mt-1.5 text-xs leading-4 text-slate-500 dark:text-slate-400">{hint}</p>}`);

// Card header: quieter, slightly larger title; no repeated red accent bar.
rep(`      <h2 className="flex items-center gap-2 text-sm font-semibold leading-5 tracking-normal text-slate-950 dark:text-white">
        <span aria-hidden="true" className="h-3.5 w-1 shrink-0 rounded-full bg-brand-primary/60" />
        {title}
      </h2>
      {description && <p className="mt-1.5 text-sm leading-5 text-muted-foreground">{description}</p>}`,
`      <h2 className="flex items-center gap-2 text-[15px] font-semibold leading-5 tracking-tight text-slate-950 dark:text-white">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{description}</p>}`);
rep(`        "mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800",`,
    `        "mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800",`);
fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
