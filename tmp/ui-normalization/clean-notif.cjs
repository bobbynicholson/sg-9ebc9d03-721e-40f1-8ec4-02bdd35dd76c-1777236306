const fs = require('fs');
const p = 'src/pages/team-portal/cleaning/notifications.tsx';
let s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); s = s.replace(a, b); };

// Group identical reminders (same title + type): newest first, with a count.
rep(`            {visible.map((n) => {`, `            {(() => {
              const groups = new Map<string, Notification[]>();
              for (const item of visible) {
                const key = \`\${item.type ?? item.notification_type ?? ""}|\${item.title ?? ""}\`;
                const list = groups.get(key);
                if (list) list.push(item); else groups.set(key, [item]);
              }
              return Array.from(groups.values());
            })().map((group) => {
              const n = group[0];
              const unreadInGroup = group.filter((g) => !g.is_read);
              const typeCode = n.type ?? n.notification_type;
              const typeLabel = typeCode ? typeCode.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase()) : null;`);
rep(`                <li key={n.id} className={\`p-4 flex items-start gap-3 \${n.is_read ? "bg-white dark:bg-transparent" : "bg-amber-50/50 dark:bg-amber-950/20"}\`}>`,
    `                <li key={n.id} className={\`p-4 flex items-start gap-3 \${unreadInGroup.length === 0 ? "bg-white dark:bg-transparent" : "bg-amber-50/50 dark:bg-amber-950/20"}\`}>`);
rep(`                      {(n.type || n.notification_type) && (
                        <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">{n.type ?? n.notification_type}</Badge>
                      )}
                      {!n.is_read && (
                        <Button size="sm" variant="ghost" className="h-6 text-[11px]" disabled={pendingIds.has(n.id)} onClick={() => markRead(n.id)}>
                          <Check className="h-3 w-3 mr-1" />
                          {pendingIds.has(n.id) ? "Marking..." : "Mark read"}
                        </Button>
                      )}`,
`                      {typeLabel && (
                        <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">{typeLabel}</Badge>
                      )}
                      {group.length > 1 && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400" title="The same reminder was sent more than once">
                          Repeated {group.length}×
                        </span>
                      )}
                      {unreadInGroup.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px]"
                          disabled={unreadInGroup.some((g) => pendingIds.has(g.id))}
                          onClick={() => { unreadInGroup.forEach((g) => void markRead(g.id)); }}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          {unreadInGroup.some((g) => pendingIds.has(g.id)) ? "Marking..." : unreadInGroup.length > 1 ? \`Mark \${unreadInGroup.length} read\` : "Mark read"}
                        </Button>
                      )}`);

fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
