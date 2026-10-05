const fs = require('fs');
const p = 'src/pages/client-portal/notifications.tsx';
let s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); s = s.replace(a, b); };

// Overview: keep the two real numbers.
rep(`              { label: "Filter", value: tab === "unread" ? "Unread" : "All", helper: "Current view", icon: AlertCircle, tone: "neutral" },
              { label: "Clean up", value: "Delete", helper: "Row-level action", icon: Trash2, tone: "neutral" },\n`, ``);

// Group identical messages (same title + text): newest shown, count + bulk actions.
rep(`                {visible.map((n) => {
                  const created = n.created_at ? new Date(n.created_at) : null;`, `                {(() => {
                  const groups = new Map<string, typeof visible>();
                  for (const item of visible) {
                    const key = \`\${item.title ?? ""}|\${item.message ?? ""}\`;
                    const list = groups.get(key);
                    if (list) list.push(item); else groups.set(key, [item]);
                  }
                  return Array.from(groups.values());
                })().map((group) => {
                  const n = group[0];
                  const unreadInGroup = group.filter((g) => !g.is_read);
                  const busy = group.some((g) => actingId === g.id);
                  const created = n.created_at ? new Date(n.created_at) : null;`);
rep(`                        className={n.is_read ? "" : "border-amber-200 dark:border-amber-900/60"}`,
    `                        className={unreadInGroup.length === 0 ? "" : "border-amber-200 dark:border-amber-900/60"}`);
rep(`                          {!n.is_read && (
                            <div className="w-2 h-2 mt-2 rounded-full bg-amber-500 flex-shrink-0" aria-label="Unread" />
                          )}`, `                          {unreadInGroup.length > 0 && (
                            <div className="w-2 h-2 mt-2 rounded-full bg-amber-500 flex-shrink-0" aria-label="Unread" />
                          )}`);
rep(`                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">{ago}</p>`,
    `                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                              {ago}
                              {group.length > 1 && <span> · sent {group.length} times</span>}
                            </p>`);
rep(`                            {!n.is_read && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); onMarkRead(n.id); }}
                                disabled={actingId === n.id}
                                title="Mark as read"`, `                            {unreadInGroup.length > 0 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={async (e) => { e.stopPropagation(); for (const g of unreadInGroup) await onMarkRead(g.id); }}
                                disabled={busy}
                                title={unreadInGroup.length > 1 ? \`Mark all \${unreadInGroup.length} as read\` : "Mark as read"}`);
rep(`                              onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
                              disabled={actingId === n.id}
                              title="Delete"`, `                              onClick={async (e) => { e.stopPropagation(); for (const g of group) await onDelete(g.id); }}
                              disabled={busy}
                              title={group.length > 1 ? \`Delete all \${group.length}\` : "Delete"}`);
rep(`                    <li key={n.id}>`, `                    <li key={n.id}>`);
// Priority chip only when it matters.
rep(`                              <Badge variant="outline" className={\`text-[10px] capitalize \${tone}\`}>
                                {n.priority || "normal"}
                              </Badge>`, `                              {isUrgent && (
                                <Badge variant="outline" className={\`text-[10px] capitalize \${tone}\`}>
                                  {n.priority}
                                </Badge>
                              )}`);
fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
