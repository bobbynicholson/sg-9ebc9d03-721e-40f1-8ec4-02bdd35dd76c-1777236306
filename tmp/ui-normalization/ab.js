const fs=require('fs');const p='src/components/order/OrderAlertBanners.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a=s.indexOf('      const parts: string[] = [];\n      if (days > 0)');
const endStr=`          </div>
        ),
      });
    }
  }`;
const b=s.indexOf(endStr,a);
if(a<0||b<0) throw 'x';
s=s.slice(0,a)+`      // Plain words instead of "T-24d 13h 13m": whole days when the event
      // is 2+ days out, hours and minutes when it is close.
      const when = days >= 2
        ? \`\${days} days\`
        : days === 1
          ? \`1 day \${hours}h\`
          : hours > 0
            ? \`\${hours}h \${mins}m\`
            : \`\${mins} min\`;
      const phrase = isOverdue ? \`Event was \${when} ago\` : \`Event in \${when}\`;
      banners.push({
        key: "countdown",
        node: (
          <div className={\`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 \${tone}\`}>
            <Clock className="h-4 w-4 flex-shrink-0" />
            <p className="min-w-0 flex-1 text-sm font-semibold tabular-nums">
              {phrase}
              <span className="ml-2 text-xs font-normal opacity-75">
                {eventStart.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}
                {order.event_time ? \`, \${order.event_time.slice(0, 5)}\` : ""}
              </span>
            </p>
`+s.slice(b);
s=s.replace('    let label = "Time to event";\n','');
s=s.replace('        label = "Event was";\n','');
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
