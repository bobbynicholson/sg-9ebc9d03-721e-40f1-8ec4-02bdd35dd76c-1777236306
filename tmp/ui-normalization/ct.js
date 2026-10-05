const fs=require('fs');const p='src/pages/admin/contacts.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const startMarker='                                {/* Ported from the retired /admin/client-search';
const endMarker='                                  <Trash2 className="w-3.5 h-3.5" />\n                                </Button>\n';
const a=s.indexOf(startMarker);const b=s.indexOf(endMarker,a);
if(a<0||b<0) throw 'x';
const nu=`                                {/* Secondary row actions live in one menu so each
                                    row stays a single line. Orders / invoices only
                                    exist for registered clients (clientId set). */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      aria-label={\`More actions for \${c.name}\`}
                                      title="More actions"
                                    >
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    {c.clientId && (
                                      <>
                                        <DropdownMenuItem onSelect={() => router.push(withSlug(\`/admin/orders?clientId=\${c.clientId}\`))}>
                                          <Package className="mr-2 w-3.5 h-3.5" /> View orders
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => router.push(withSlug(\`/admin/invoices?clientId=\${c.clientId}\`))}>
                                          <Receipt className="mr-2 w-3.5 h-3.5" /> View invoices
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    <DropdownMenuItem onSelect={() => { setEditing(c); setFormOpen(true); }}>
                                      <Pencil className="mr-2 w-3.5 h-3.5" /> {c.clientId ? "Edit" : "Save as client"}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={() => setConfirmDelete(c)} className="text-rose-600 focus:text-rose-700">
                                      <Trash2 className="mr-2 w-3.5 h-3.5" /> Delete contact
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
`;
s=s.slice(0,a)+nu+s.slice(b+endMarker.length);
s=s.replace('<div className="ml-auto flex min-w-[14rem] max-w-[16rem] flex-wrap items-center justify-end gap-1.5">','<div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">');
s=s.replace('Package, Receipt, Banknote } from "lucide-react";','Package, Receipt, Banknote, MoreHorizontal } from "lucide-react";\nimport { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";');
// Win-back only makes sense for people who ordered before.
s=s.replace('            c.suggestion = { tone: "warm", label: "Win-back nudge", reason: `${c.daysSinceLastTouch}d quiet` };',
'            c.suggestion = c.orderCount > 0\n              ? { tone: "warm", label: "Win-back nudge", reason: `${c.daysSinceLastTouch}d quiet` }\n              : { tone: "neutral", label: "Say hello", reason: c.daysSinceLastTouch != null ? `No orders yet · ${c.daysSinceLastTouch}d quiet` : "No orders yet" };');
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok', s.includes('Say hello'), s.includes('flex-nowrap items-center justify-end'));
