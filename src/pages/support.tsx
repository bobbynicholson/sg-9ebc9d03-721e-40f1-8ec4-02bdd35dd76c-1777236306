import { useState, useEffect } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Plus, Search, MessageSquare, Clock, Send, ArrowLeft, LifeBuoy, Lock } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, cardBase, btnPress, iconChip, Eyebrow } from "@/components/motion/marketing";
import { supportTicketService } from "@/services/supportTicketService";
import type { Database } from "@/integrations/supabase/types";

type SupportTicket = Database["public"]["Tables"]["support_tickets"]["Row"];

export default function SupportPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const [newTicket, setNewTicket] = useState({
    subject: "",
    category: "general",
    priority: "medium",
    description: "",
    companyName: "",
    contactEmail: user?.email || "",
    contactPhone: "",
  });

  useEffect(() => {
    if (user) {
      loadTickets();
    }
  }, [user]);

  const loadTickets = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const data = await supportTicketService.getUserTickets(user.id);
      setTickets(data);
    } catch (error) {
      console.error("Error loading tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTicketMessages = async (ticketId: string) => {
    try {
      const data = await supportTicketService.getTicketMessages(ticketId);
      setMessages(data);
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  const handleCreateTicket = async () => {
    if (!user?.id || !newTicket.subject || !newTicket.description) return;

    try {
      await supportTicketService.createTicket({
        userId: user.id,
        ...newTicket,
      });
      
      setCreateDialogOpen(false);
      setNewTicket({
        subject: "",
        category: "general",
        priority: "medium",
        description: "",
        companyName: "",
        contactEmail: user.email || "",
        contactPhone: "",
      });
      
      await loadTickets();
    } catch (error) {
      console.error("Error creating ticket:", error);
      alert("Failed to create support ticket. Please try again.");
    }
  };

  const handleSendMessage = async () => {
    if (!selectedTicket || !user?.id || !newMessage.trim()) return;

    try {
      await supportTicketService.addMessage(selectedTicket.id, user.id, newMessage);
      setNewMessage("");
      await loadTicketMessages(selectedTicket.id);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleSelectTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    await loadTicketMessages(ticket.id);
  };

  const filteredTickets = useFuzzyItems(
    tickets,
    searchQuery,
    [
      { key: "subject" as any, weight: 3 },
      { key: "ticket_number" as any, weight: 2 },
      { key: "description" as any, weight: 1 },
      { key: "status" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  if (!user) {
    return (
      <>
        <Header />
        <div className="flex min-h-screen items-center justify-center bg-white px-4 text-slate-900">
          <Reveal className="w-full max-w-sm">
            <div className={`${cardBase} p-8 text-center`}>
              <div className={`${iconChip} mx-auto mb-5 h-14 w-14 bg-gradient-to-br from-violet-500 to-fuchsia-500`}>
                <Lock className="h-7 w-7 text-white" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Authentication Required</h1>
              <p className="mt-2 text-slate-600">Please sign in to access support</p>
              <Button onClick={() => router.push("/auth/login")} className="mt-6 h-11 w-full rounded-full">
                Sign In
              </Button>
            </div>
          </Reveal>
        </div>
        <Footer />
      </>
    );
  }

  if (selectedTicket) {
    return (
      <>
        <Header />
        <div className="mx-auto max-w-4xl px-4 py-10 md:py-14">
          <Head>
            <title>{selectedTicket.subject} - Support - CateringMS</title>
            <meta name="robots" content="noindex, nofollow" />
          </Head>

          <Reveal>
          <Button variant="ghost" onClick={() => setSelectedTicket(null)} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tickets
          </Button>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{supportTicketService.getCategoryIcon(selectedTicket.category)}</span>
                    <CardTitle className="text-2xl">{selectedTicket.subject}</CardTitle>
                  </div>
                  <CardDescription>Ticket #{selectedTicket.ticket_number}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge className={supportTicketService.getStatusColor(selectedTicket.status)}>
                    {supportTicketService.formatStatus(selectedTicket.status)}
                  </Badge>
                  <Badge className={supportTicketService.getPriorityColor(selectedTicket.priority)}>
                    {selectedTicket.priority.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="bg-slate-50 rounded-lg p-4 mb-6">
                <p className="text-sm font-medium text-slate-600 mb-2">Original Request</p>
                <p className="text-slate-900 whitespace-pre-wrap">{selectedTicket.description}</p>
                <p className="text-xs text-slate-500 mt-2">
                  Created {new Date(selectedTicket.created_at).toLocaleString()}
                </p>
              </div>

              <Separator className="my-6" />

              <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                {messages.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No messages yet. Our support team will respond soon.</p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.is_from_staff ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-4 ${
                          message.is_from_staff
                            ? "bg-blue-50 border border-blue-200"
                            : "bg-purple-50 border border-purple-200"
                        }`}
                      >
                        <p className="text-sm font-medium mb-1">
                          {message.is_from_staff ? "CateringMS Support" : "You"}
                        </p>
                        <p className="text-slate-900 whitespace-pre-wrap">{message.message}</p>
                        <p className="text-xs text-slate-500 mt-2">
                          {new Date(message.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <Textarea
                  placeholder="Type your message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={3}
                  className="flex-1"
                />
                <Button onClick={handleSendMessage} disabled={!newMessage.trim()}>
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>
          </Reveal>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <Head>
          <title>Support - CateringMS</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>

        <Reveal className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Eyebrow icon={LifeBuoy} className="border-violet-200 bg-violet-50 text-violet-700">
                Support Center
              </Eyebrow>
              <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Get help from our support team
              </h1>
            </div>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="h-11 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 font-semibold text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  New Ticket
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Support Ticket</DialogTitle>
                  <DialogDescription>
                    Describe your issue or feature request and our team will get back to you soon.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      placeholder="Brief description of your issue..."
                      value={newTicket.subject}
                      onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="category">Category</Label>
                      <Select value={newTicket.category} onValueChange={(value) => setNewTicket({ ...newTicket, category: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">💬 General</SelectItem>
                          <SelectItem value="billing">💳 Billing</SelectItem>
                          <SelectItem value="technical">🔧 Technical</SelectItem>
                          <SelectItem value="feature_request">💡 Feature Request</SelectItem>
                          <SelectItem value="bug_report">🐛 Bug Report</SelectItem>
                          <SelectItem value="onboarding">🚀 Onboarding</SelectItem>
                          <SelectItem value="training">📚 Training</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="priority">Priority</Label>
                      <Select value={newTicket.priority} onValueChange={(value) => setNewTicket({ ...newTicket, priority: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Please provide as much detail as possible..."
                      value={newTicket.description}
                      onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                      rows={6}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Contact Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newTicket.contactEmail}
                        onChange={(e) => setNewTicket({ ...newTicket, contactEmail: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Contact Phone (Optional)</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+27 XX XXX XXXX"
                        value={newTicket.contactPhone}
                        onChange={(e) => setNewTicket({ ...newTicket, contactPhone: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateTicket}
                    disabled={!newTicket.subject || !newTicket.description}
                  >
                    Create Ticket
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="relative mt-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </Reveal>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Loading tickets...</p>
            </div>
          </div>
        ) : filteredTickets.length === 0 ? (
          <Reveal>
            <div className={`${cardBase} flex flex-col items-center justify-center p-12 text-center`}>
              <div className={`${iconChip} mb-5 h-16 w-16 bg-gradient-to-br from-violet-100 to-fuchsia-100`}>
                <MessageSquare className="h-8 w-8 text-violet-600" />
              </div>
              <p className="mb-2 text-lg font-semibold text-slate-900">No support tickets yet</p>
              <p className="mb-5 text-slate-600">Create your first ticket to get help from our team</p>
              <Button onClick={() => setCreateDialogOpen(true)} className="h-11 rounded-full px-6">
                <Plus className="h-4 w-4 mr-2" />
                Create Ticket
              </Button>
            </div>
          </Reveal>
        ) : (
          <Stagger className="grid gap-4" gap={0.05}>
            {filteredTickets.map((ticket) => (
              <StaggerItem key={ticket.id}>
              <div
                className={`${cardBase} cursor-pointer`}
                onClick={() => handleSelectTicket(ticket)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="text-3xl">{supportTicketService.getCategoryIcon(ticket.category)}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg text-slate-900">{ticket.subject}</h3>
                          <Badge variant="outline" className="text-xs">
                            #{ticket.ticket_number}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600 mb-3 line-clamp-2">{ticket.description}</p>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(ticket.created_at).toLocaleDateString()}
                          </span>
                          <span>•</span>
                          <span className="capitalize">{ticket.category.replace("_", " ")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className={supportTicketService.getStatusColor(ticket.status)}>
                        {supportTicketService.formatStatus(ticket.status)}
                      </Badge>
                      <Badge className={supportTicketService.getPriorityColor(ticket.priority)}>
                        {ticket.priority.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </div>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
      <Footer />
    </>
  );
}
