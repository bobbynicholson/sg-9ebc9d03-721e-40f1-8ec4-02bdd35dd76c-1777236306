const fs=require('fs');const p='src/components/portal/ui.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const rep=(a,b)=>{if(!s.includes(a))throw new Error('missing '+a.slice(0,60));s=s.replace(a,b);};
// One-line description (full text on hover), tighter tiles.
rep(`        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
          {description}
        </p>`,`        <p
          className="mt-1 max-w-3xl line-clamp-1 text-sm leading-6 text-slate-600 dark:text-slate-400"
          title={typeof description === "string" ? description : undefined}
        >
          {description}
        </p>`);
rep(`      <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950 dark:text-white">`,`      <h2 className="mt-0.5 text-base font-semibold leading-tight text-slate-950 dark:text-white sm:text-lg">`);
rep(`        <div className="mt-4 flex flex-wrap items-center gap-2">
          {actions}`,`        <div className="mt-3 flex flex-wrap items-center gap-2">
          {actions}`);
rep(`          <div key={index} className={cn("min-w-0 rounded-lg border border-l-2 px-3 py-3", OVERVIEW_TONES[tone])}>`,`          <div key={index} className={cn("min-w-0 rounded-lg border border-l-2 px-3 py-2.5", OVERVIEW_TONES[tone])}>`);
rep(`            <p className="mt-2 truncate text-xl font-semibold leading-none tabular-nums">{item.value}</p>
            {item.helper && <p className="mt-1 line-clamp-2 text-xs leading-4 opacity-80">{item.helper}</p>}`,`            <p className="mt-1.5 truncate text-lg font-semibold leading-none tabular-nums">{item.value}</p>
            {item.helper && <p className="mt-1 truncate text-xs leading-4 opacity-80" title={typeof item.helper === "string" ? item.helper : undefined}>{item.helper}</p>}`);
rep(`        "mb-6 rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/95 sm:p-5",
        SOFT_SHADOW,
        className,
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">`,`        "mb-5 rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/95",
        SOFT_SHADOW,
        className,
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">`);
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
