const fs=require('fs');const p='src/components/cleaning/CleaningDutyWidget.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a=`                    <p className="text-xs text-slate-500 tabular-nums">
                      On for {formatDuration(s.duty_started_at)}
                    </p>`;
if(!s.includes(a)) throw 'x';
s=s.replace(a,`                    {(() => {
                      // Over 16 hours means a clock-out was missed.
                      const started = s.duty_started_at ? new Date(s.duty_started_at) : null;
                      if (started && Date.now() - started.getTime() > 16 * 3600_000) {
                        return (
                          <p className="text-xs text-amber-700" title={\`On for \${formatDuration(s.duty_started_at)}\`}>
                            Clocked in since {started.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · clock-out missed?
                          </p>
                        );
                      }
                      return (
                        <p className="text-xs text-slate-500 tabular-nums">
                          On for {formatDuration(s.duty_started_at)}
                        </p>
                      );
                    })()}`);
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
