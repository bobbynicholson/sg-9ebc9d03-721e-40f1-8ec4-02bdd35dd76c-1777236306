/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * "Copy client link" button for an order. Drop it anywhere we render an
 * order in the admin (orders list, calendar day sheet, order modal).
 *
 *   <ClientLinkButton orderId={order.id} companyId={order.company_id} />
 *
 * On click, opens a dialog that:
 *  - Shows existing active tokens with their expiry + a Revoke button
 *  - Has "Generate new link" - creates a fresh token, copies the URL
 *    to clipboard, shows the URL once for the admin to paste anywhere
 *    (WhatsApp, Gmail, SMS)
 *
 * Token is stored hashed; raw value is shown ONCE on creation. If the
 * admin loses it before the dialog closes, they can revoke and create
 * another - old tokens become useless instantly.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Link2, Copy, Check, Plus, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TokenRow {
  id: string;
  token_prefix: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  label: string | null;
}

interface Props {
  orderId: string;
  companyId?: string;
  /** Optional compact look (icon only). */
  compact?: boolean;
  /** Callback for when a token is generated, in case parent wants to react. */
  onGenerated?: (rawLink: string) => void;
}

export function ClientLinkButton({ orderId, compact, onGenerated }: Props) {
  // companyId prop kept on the interface for forward-compat with
  // callers (Kanban card, OrderDetailsModal) but no longer used:
  // generate() now routes through /api/orders/[id]/preview-as-client
  // which derives company_id from the order row server-side.
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_access_tokens")
      .select("id, token_prefix, expires_at, revoked_at, created_at, label")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[ClientLinkButton] client_access_tokens fetch failed:", error);
    }
    setTokens(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const generate = async () => {
    setBusy(true);
    try {
      // Route through the server-side preview-as-client endpoint
      // (which calls mint_client_order_token SECURITY DEFINER RPC).
      // The previous browser-side INSERT into client_access_tokens
      // was failing intermittently for owners on /admin/orders -
      // the generated link looked fine in the dialog but validation
      // on /c/order/[id] returned invalid_token because the row
      // never landed (RLS edge case under certain session shapes).
      // The server path uses elevated privileges, guarantees insert,
      // and matches the same path the OrderDetailsModal "Copy link"
      // button already uses.
      const resp = await fetch(`/api/orders/${orderId}/preview-as-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await resp.json();
      if (!resp.ok || !data?.url) {
        throw new Error(data?.error || "Token mint failed");
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const path = String(data.url);
      // data.url is the relative path /c/order/{id}?t={raw}. Build the
      // full URL so the operator pastes a complete shareable link.
      const link = path.startsWith("http") ? path : `${origin.replace(/\/$/, "")}${path}`;
      setFreshLink(link);
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      } catch {
        /* manual copy */
      }
      onGenerated?.(link);
      reload();
    } catch (e: any) {
      toast({ title: "Couldn't generate link", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this link? The client won't be able to open it any more.")) return;
    await supabase
      .from("client_access_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    reload();
  };

  const activeTokens = tokens.filter((t) => !t.revoked_at && new Date(t.expires_at) > new Date());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <Button size="sm" variant="ghost" className="gap-1" title="Client link">
            <Link2 className="w-3.5 h-3.5" />
            {activeTokens.length > 0 && <span className="text-[10px]">{activeTokens.length}</span>}
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5">
            <Link2 className="w-3.5 h-3.5" />
            Client link
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-slate-700" />
            Share with the client
          </DialogTitle>
          <DialogDescription>
            Generates a private link to this booking. No login needed, the link is the access. Send it via WhatsApp, email, SMS, however you usually reach this client.
          </DialogDescription>
        </DialogHeader>

        {/* Fresh link reveal */}
        {freshLink && (
          <div className="rounded-lg border-2 border-brand-primary/30 bg-brand-primary/10 p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="font-semibold text-brand-primary text-sm flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                Link copied to clipboard
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await navigator.clipboard.writeText(freshLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2200);
                }}
                className="gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy again"}
              </Button>
            </div>
            <code className="block bg-white border border-brand-primary/20 rounded px-3 py-2 text-xs font-mono break-all">
              {freshLink}
            </code>
            <p className="text-xs text-brand-primary mt-2">
              Paste this into your usual channel. They open it, see their booking, no account needed.
            </p>
          </div>
        )}

        {/* Generate */}
        {!freshLink && (
          <Button onClick={generate} disabled={busy} className="w-full gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Generate fresh link
          </Button>
        )}

        {/* Existing active links */}
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            Active links ({activeTokens.length})
          </p>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400 mx-auto my-2" />
          ) : activeTokens.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-2">No active links yet.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {activeTokens.map((t) => {
                const days = Math.ceil(
                  (new Date(t.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                );
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-slate-200 bg-slate-50">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-slate-700">{t.token_prefix}***</p>
                      <p className="text-[11px] text-slate-500">
                        Created {new Date(t.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} · expires in {days}d
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => revoke(t.id)} className="text-rose-600 gap-1">
                      <Trash2 className="w-3.5 h-3.5" />
                      Revoke
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Privacy footer */}
        <div className="text-[11px] text-slate-500 bg-slate-50 rounded-md p-3 flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Tokens are stored hashed. The raw link is shown only at the moment of creation. Each link is scoped to <strong>this one order</strong>, the client can't see anything else. Default expiry is 60 days.
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
