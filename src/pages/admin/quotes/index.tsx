import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  DollarSign,
  Plus,
  Calendar,
  Mail,
  Users,
  FileText,
  Edit,
  Send,
  Copy,
  ExternalLink,
  Search,
} from "lucide-react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Quote } from "@/types";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { quoteService } from "@/services/quoteService";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useToast } from "@/hooks/use-toast";
import { composeEmail, templateForQuote, type QuoteStatus } from "@/lib/composeEmail";

const fmtMoney = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

/**
 * Maps a Quote row -> the QuoteStatus our compose templates know about.
 * Folds in an "expired" check based on valid_until so an old "sent" quote
 * gets the urgency template instead of the default follow-up.
 */
function deriveQuoteStatus(quote: Quote): QuoteStatus {
  const validUntil = (quote as any).valid_until as string | null | undefined;
  const status = quote.status as QuoteStatus;
  if ((status === "sent" || status === "revised") && validUntil) {
    if (new Date(validUntil).getTime() < Date.now()) return "expired";
  }
  return status;
}

export default function AdminQuotes() {
  const { user, profile } = useAuth() as any;
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [composeQuote, setComposeQuote] = useState<Quote | null>(null);
  const [companyName, setCompanyName] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");

  // Smart fuzzy search across client name, email, event name, venue, ref
  // and the formatted total so a query like "12000" or "wedding" works.
  const filteredQuotes = useFuzzyItems(
    quotes,
    search,
    [
      { key: "client_name" as any, weight: 3 },
      { key: "client_email" as any, weight: 2 },
      { key: ((q: Quote) => (q as any).event_name) as any, weight: 2, label: "event_name" },
      { key: ((q: Quote) => (q as any).venue || (q as any).venue_address) as any, weight: 1, label: "venue" },
      { key: ((q: Quote) => (q as any).quote_number || q.id) as any, weight: 2, label: "quote_ref" },
      { key: ((q: Quote) => q.total != null ? `R${q.total} ${q.total}` : "") as any, weight: 1, label: "total" },
    ],
    { limit: 0 },
  );

  useEffect(() => {
    if (!user?.company_id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const fetched = await quoteService.getQuotes(user.company_id!);
      if (!cancelled) {
        setQuotes(fetched);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.company_id]);

  // Pull the catering company's display name once so the email signature
  // reads as "Best, Spit Braai Delivery" rather than "Best, the team".
  useEffect(() => {
    setCompanyName(profile?.company_name || (user as any)?.company_name);
  }, [profile, user]);

  const handleSend = async (quoteId: string) => {
    setSendingId(quoteId);
    try {
      const ok = await quoteService.sendQuoteToClient(quoteId);
      if (ok) {
        toast({ title: "Quote sent", description: "Email queued and status updated to Sent." });
        setQuotes((prev) => prev.map((q) =>
          q.id === quoteId ? { ...q, status: "sent", sent_at: new Date().toISOString() } as Quote : q
        ));
      } else {
        toast({ title: "Send failed", description: "Could not send the quote. Check the client email.", variant: "destructive" });
      }
    } catch (err) {
      console.error("Send quote failed:", err);
      toast({ title: "Send failed", description: "Something went wrong sending this quote.", variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const getStatusColor = (status: Quote["status"]) => {
    switch (status) {
      case "draft": return "bg-gray-100 text-gray-700 border-gray-200";
      case "sent": return "bg-blue-100 text-blue-700 border-blue-200";
      case "revised": return "bg-orange-100 text-orange-700 border-orange-200";
      case "accepted": return "bg-green-100 text-green-700 border-green-200";
      case "rejected": return "bg-red-100 text-red-700 border-red-200";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Quote Management - CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-6 md:py-8 lg:py-12 max-w-full">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl shadow-lg">
                  <DollarSign className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    Quote Management
                  </h1>
                  <p className="text-slate-600 mt-1">Create and manage client quotes</p>
                </div>
              </div>
              <Link href="/admin/quotes/new">
                <Button size="lg" className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700">
                  <Plus className="w-5 h-5 mr-2" />
                  New Quote
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 mb-1 flex items-center gap-1.5">Total Quotes <InfoTooltip content={"Every quote on file for your company, across every status."} /></p>
                <p className="text-2xl font-bold text-slate-900">{quotes.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 mb-1 flex items-center gap-1.5">Sent <InfoTooltip content={"Quotes you have sent to a client and are waiting on a response for."} /></p>
                <p className="text-2xl font-bold text-blue-600">
                  {quotes.filter(q => q.status === "sent").length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 mb-1 flex items-center gap-1.5">Accepted <InfoTooltip content={"Quotes the client has approved. The next step is usually converting them into orders."} /></p>
                <p className="text-2xl font-bold text-green-600">
                  {quotes.filter(q => q.status === "accepted").length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 mb-1 flex items-center gap-1.5">Total Value <InfoTooltip content={"Total value of every quote in the list, no matter the status."} /></p>
                <p className="text-2xl font-bold text-emerald-600">
                  R{quotes.reduce((sum, q) => sum + (q.total ?? 0), 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Quick-mail banner mirrors the Clients CRM pattern: explains why
              the "Compose" buttons open Gmail / Outlook / default mail rather
              than firing through a server. Personal mail, not bulk. */}
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-slate-900">Personal follow-ups, not bulk.</p>
              <p className="text-slate-600 mt-0.5">
                Compose opens a draft in Gmail / Outlook / your default mail app pre-filled from this quote, so it actually arrives from <span className="font-medium">your address</span>. Subject and body update automatically based on the quote's status.
              </p>
            </div>
          </div>

          {/* Smart search across client, event, ref + total. Debounced. */}
          {quotes.length > 0 && (
            <div className="mb-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by client, event, venue, quote ref or total..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {search.trim() && (
                <p className="text-xs text-slate-500 mt-1.5">
                  Showing {filteredQuotes.length} of {quotes.length} quotes.
                </p>
              )}
            </div>
          )}

          <div className="space-y-4">
            {quotes.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="p-12 text-center">
                  <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">No quotes yet</h3>
                  <p className="text-slate-600 mb-6">Create your first quote from a lead</p>
                  <Link href="/admin/leads">
                    <Button>View Leads</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : filteredQuotes.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="p-12 text-center">
                  <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No quotes match your search</h3>
                  <p className="text-slate-600">Try a different client name, event or quote reference.</p>
                </CardContent>
              </Card>
            ) : (
              filteredQuotes.map((quote) => {
                const canCompose = !!quote.client_email && quote.status !== "draft";
                const composeHint = !quote.client_email
                  ? "No email on this quote -- add one to enable compose"
                  : quote.status === "draft"
                    ? "Send the quote first, then you can follow up"
                    : "Open a follow-up draft in Gmail / Outlook / mail app";
                return (
                  <Card key={quote.id} className="border-0 shadow-lg hover:shadow-xl transition-all">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <h3 className="text-xl font-semibold text-slate-900">{quote.client_name}</h3>
                            <Badge className={`${getStatusColor(quote.status)} border`}>
                              {quote.status}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                            <div className="flex items-center gap-2 text-slate-600">
                              <Mail className="w-4 h-4" />
                              <span className="text-sm">{quote.client_email}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <Calendar className="w-4 h-4" />
                              <span className="text-sm">{quote.event_date ? new Date(quote.event_date).toLocaleDateString() : "—"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <Users className="w-4 h-4" />
                              <span className="text-sm">{quote.guest_count} guests</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <DollarSign className="w-4 h-4" />
                              <span className="text-sm font-semibold text-green-600">
                                R{(quote.total ?? 0).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-slate-600">
                              {Array.isArray(quote.menu_items) ? quote.menu_items.length : 0} menu items
                            </span>
                            <span className="text-slate-600">
                              {Array.isArray(quote.equipment_items) ? quote.equipment_items.length : 0} equipment items
                            </span>
                          </div>

                          <div className="space-y-2 mt-4">
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Subtotal</span>
                              <span className="font-medium">R{quote.subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">VAT (15%)</span>
                              <span className="font-medium">R{(quote.tax ?? 0).toFixed(2)}</span>
                            </div>
                            <div className="h-px bg-slate-200" />
                            <div className="flex justify-between font-bold">
                              <span>Total</span>
                              <span className="text-green-600">R{(quote.total ?? 0).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 ml-4 items-end">
                          {quote.status === "draft" && (
                            <Button
                              size="sm"
                              onClick={() => handleSend(quote.id)}
                              disabled={sendingId === quote.id}
                            >
                              <Send className="w-4 h-4 mr-2" />
                              {sendingId === quote.id ? "Sending..." : "Send"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canCompose}
                            title={composeHint}
                            onClick={() => setComposeQuote(quote)}
                          >
                            <Mail className="w-4 h-4 mr-2" />
                            Compose
                          </Button>
                          <Link href={`/admin/quotes/${quote.id}`}>
                            <Button variant="outline" size="sm">
                              <Edit className="w-4 h-4 mr-2" />
                              View
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        <Footer />
      </div>

      {/* Compose drawer -- mirrors the Clients CRM pattern. Status-aware
          template, four send channels, no server-side mail sending. */}
      <Sheet open={!!composeQuote} onOpenChange={(o) => !o && setComposeQuote(null)}>
        <SheetContent side="right" className="w-full sm:w-[520px] overflow-y-auto">
          {composeQuote && (
            <QuoteComposeDrawer
              quote={composeQuote}
              fromName={profile?.full_name || companyName}
              companyName={companyName}
              onClose={() => setComposeQuote(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
    </>
  );
}

function QuoteComposeDrawer({
  quote, fromName, companyName, onClose,
}: {
  quote: Quote;
  fromName?: string;
  companyName?: string;
  onClose: () => void;
}) {
  const derivedStatus = useMemo(() => deriveQuoteStatus(quote), [quote]);
  const initial = useMemo(() => templateForQuote(derivedStatus, {
    contactName: quote.client_name,
    eventName: (quote as any).event_name || undefined,
    eventDate: quote.event_date
      ? new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
      : undefined,
    guestCount: quote.guest_count,
    total: quote.total ?? undefined,
    quoteRef: (quote as any).quote_number || quote.id?.slice(0, 8).toUpperCase(),
    fromName,
    companyName,
  }), [quote, derivedStatus, fromName, companyName]);

  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [copied, setCopied] = useState(false);

  // If the quote in the drawer changes, reset the composer to the new
  // template instead of leaving stale text from a previous client.
  useEffect(() => {
    setSubject(initial.subject);
    setBody(initial.body);
  }, [initial.subject, initial.body]);

  const payload = { to: quote.client_email || "", subject, body, fromName };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Send className="w-5 h-5 text-emerald-600" />
          Compose to {quote.client_name}
        </SheetTitle>
        <SheetDescription>
          Personal follow-up. Sent through your own inbox so it looks like it came from you.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 mt-4">
        {/* Quote summary */}
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="py-3 px-4 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Email</span>
              <span className="font-medium text-slate-900">{quote.client_email || "(none)"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status</span>
              <span className="font-medium text-slate-900 capitalize">{derivedStatus}</span>
            </div>
            {quote.event_date && (
              <div className="flex justify-between">
                <span className="text-slate-500">Event date</span>
                <span className="font-medium text-slate-900">
                  {new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
                </span>
              </div>
            )}
            {quote.guest_count != null && (
              <div className="flex justify-between">
                <span className="text-slate-500">Guests</span>
                <span className="font-medium text-slate-900">{quote.guest_count}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Total</span>
              <span className="font-medium text-slate-900">{fmtMoney.format(quote.total ?? 0)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Editable template */}
        <div>
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Subject</label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Edit freely -- the template's just a starting point based on this quote's status.
          </p>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
          <Button
            variant="default"
            disabled={!quote.client_email}
            onClick={() => {
              window.open(composeEmail.gmailUrl(payload), "_blank", "noopener");
            }}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <ExternalLink className="w-4 h-4" /> Open in Gmail
          </Button>
          <Button
            variant="outline"
            disabled={!quote.client_email}
            onClick={() => {
              window.open(composeEmail.outlookUrl(payload), "_blank", "noopener");
            }}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Open in Outlook
          </Button>
          <Button
            variant="outline"
            disabled={!quote.client_email}
            onClick={() => {
              window.location.href = composeEmail.mailto(payload);
            }}
            className="gap-2"
          >
            <Mail className="w-4 h-4" /> Default mail app
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const ok = await composeEmail.copyToClipboard(payload);
              if (ok) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
            className="gap-2"
          >
            <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy"}
          </Button>
        </div>

        <p className="text-[11px] text-slate-500 text-center">
          Direct send via your own SMTP / Gmail OAuth coming soon. Until then these four options keep the email looking like it came from you, not from us.
        </p>

        <Button variant="ghost" onClick={onClose} className="w-full">Close</Button>
      </div>
    </>
  );
}
