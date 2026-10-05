const fs=require('fs');const p='src/components/admin/TeamManagerWorkspace.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a='<p className={`mt-1 flex items-center gap-1 text-xs ${member.status.on_duty ? "text-emerald-700" : "text-slate-500"}`}>{member.status.on_duty ? <><Activity className="h-3 w-3" /> On duty{member.status.started_at ? ` · ${elapsed(member.status.started_at)}` : ""}</> : <><Clock className="h-3 w-3" /> Off duty</>}</p>';
if(!s.includes(a)) throw 'x';
const b=`{(() => {
                  // A clock-in older than 16 hours was almost certainly never
                  // closed; say so plainly instead of showing "671h".
                  const started = member.status.started_at ? new Date(member.status.started_at) : null;
                  const stale = !!(member.status.on_duty && started && Date.now() - started.getTime() > 16 * 3600_000);
                  if (stale && started) {
                    return (
                      <p className="mt-1 flex items-center gap-1 text-xs text-amber-700" title={\`On duty for \${elapsed(member.status.started_at)}\`}>
                        <Clock className="h-3 w-3" /> Clocked in since {started.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · clock out if they&apos;ve left
                      </p>
                    );
                  }
                  return (
                    <p className={\`mt-1 flex items-center gap-1 text-xs \${member.status.on_duty ? "text-emerald-700" : "text-slate-500"}\`}>{member.status.on_duty ? <><Activity className="h-3 w-3" /> On duty{member.status.started_at ? \` · \${elapsed(member.status.started_at)}\` : ""}</> : <><Clock className="h-3 w-3" /> Off duty</>}</p>
                  );
                })()}`;
s=s.replace(a,b);fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
