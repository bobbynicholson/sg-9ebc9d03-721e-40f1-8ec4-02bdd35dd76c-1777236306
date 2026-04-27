import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Edit, Trash2, Plus, Send, Copy, ArrowLeft, CheckCircle, AlertCircle, DollarSign, Calendar, MessageSquare, Eye, Save } from "lucide-react";
import Head from "next/head";
import { GetServerSideProps } from "next";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { useAuth } from "@/contexts/AuthContext";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: "quote" | "followup" | "payment" | "reminder" | "review";
  trigger: string;
  delayDays?: number;
}

const defaultTemplates: EmailTemplate[] = [
  {
    id: "quote_initial",
    name: "Initial Quote Email",
    subject: "Your Catering Quote {quote_id} - {client_name}",
    body: `Dear {client_name},

Thank you for your interest in our catering services!

Your quote {quote_id} has been created with a total of R{total_amount}.

Event Details:
- Date: {event_date}
- Guests: {guest_count}
- Venue: {venue}

You can review and accept your quote online. Simply log in to your client portal to:
- View detailed breakdown
- Make changes to your order
- Confirm and make payment
- Track your event

If you have any questions, please don't hesitate to reach out.

Best regards,
{company_name}`,
    category: "quote",
    trigger: "quote_created",
  },
  {
    id: "followup_1",
    name: "First Follow-up (No Response)",
    subject: "Following up on your quote {quote_id}",
    body: `Hi {client_name},

I wanted to follow up on the catering quote we sent you on {quote_date}.

Just a friendly reminder that your quote {quote_id} is still available:
- Event Date: {event_date}
- Total: R{total_amount}
- {guest_count} guests

We'd love to cater your event! Do you have any questions or would you like to make any changes?

Looking forward to hearing from you.

Best regards,
{company_name}`,
    category: "followup",
    trigger: "no_response",
    delayDays: 3,
  },
  {
    id: "followup_2",
    name: "Second Follow-up with Offer",
    subject: "Special offer for your upcoming event - {quote_id}",
    body: `Hi {client_name},

I hope this email finds you well!

I wanted to reach out one more time about quote {quote_id} for your event on {event_date}.

{date_availability_message}

As a special offer, we'd like to extend a {discount_percentage}% discount if you book within the next 48 hours.

Original Total: R{total_amount}
Your Special Price: R{discounted_amount}

This is a limited-time offer to help make your event truly special.

Would you like to take advantage of this offer?

Best regards,
{company_name}`,
    category: "followup",
    trigger: "no_response_2",
    delayDays: 7,
  },
  {
    id: "order_accepted",
    name: "Order Accepted - Thank You",
    subject: "Thank you for your order! {order_id}",
    body: `Dear {client_name},

Fantastic news! Your catering order {order_id} has been confirmed!

We're thrilled to be part of your special event on {event_date}.

Order Summary:
- {guest_count} guests
- Venue: {venue}
- Total: R{total_amount}

What happens next:
1. Our kitchen team will start preparation 48 hours before your event
2. You'll receive updates throughout the process
3. Track your order status in real-time through your client portal
4. Our driver will deliver everything fresh on the day

We're committed to making your event amazing!

Best regards,
{company_name}`,
    category: "quote",
    trigger: "order_accepted",
  },
  {
    id: "payment_thank_you",
    name: "Payment Received - Thank You",
    subject: "Payment Confirmed - Order {order_id}",
    body: `Dear {client_name},

Thank you! We've received your payment of R{amount} for order {order_id}.

Your event is now fully confirmed and our team is preparing everything to make it perfect!

Payment Details:
- Amount: R{amount}
- Order: {order_id}
- Event Date: {event_date}

Track your order status in real-time through your client portal.

We appreciate your business!

Best regards,
{company_name}`,
    category: "payment",
    trigger: "payment_received",
  },
  {
    id: "reminder_14_days",
    name: "14-Day Event Reminder",
    subject: "Your event is 2 weeks away! - {order_id}",
    body: `Hi {client_name},

Your event is coming up in just 2 weeks!

Event Details:
- Date: {event_date}
- Time: {event_time}
- Venue: {venue}
- Guests: {guest_count}

Everything is on track! Here's what you need to know:

✓ Kitchen prep begins in 48 hours before delivery
✓ All equipment has been reserved
✓ Your driver will be assigned 24 hours before delivery

Need to make any last-minute changes? Let us know within the next 7 days.

Looking forward to serving you!

Best regards,
{company_name}`,
    category: "reminder",
    trigger: "event_reminder_14",
    delayDays: -14,
  },
  {
    id: "reminder_7_days",
    name: "7-Day Event Reminder",
    subject: "One week until your event! - {order_id}",
    body: `Hi {client_name},

Your event is just one week away!

Quick reminder:
- Date: {event_date}
- Time: {event_time}
- Location: {venue}

Final Checklist:
□ Venue access confirmed?
□ Serving time confirmed?
□ Special setup requirements?

If you need to make any final adjustments, please let us know within the next 48 hours.

We're excited to serve you next week!

Best regards,
{company_name}`,
    category: "reminder",
    trigger: "event_reminder_7",
    delayDays: -7,
  },
  {
    id: "reminder_3_days",
    name: "3-Day Event Reminder",
    subject: "Your event is in 3 days! - {order_id}",
    body: `Hi {client_name},

Your event is just 3 days away!

Final Confirmation:
- Date: {event_date}
- Time: {event_time}
- Venue: {venue}
- Guests: {guest_count}

Our kitchen team will start preparation tomorrow. Everything is confirmed and ready to go!

{payment_status_message}

You'll be able to track your driver in real-time on the day of delivery.

See you soon!

Best regards,
{company_name}`,
    category: "reminder",
    trigger: "event_reminder_3",
    delayDays: -3,
  },
  {
    id: "reminder_1_day",
    name: "1-Day Event Reminder",
    subject: "Tomorrow is the big day! - {order_id}",
    body: `Hi {client_name},

Tomorrow is your event!

Final Details:
- Date: Tomorrow, {event_date}
- Delivery Time: {delivery_time}
- Venue: {venue}

Everything is ready:
✓ Food prepared fresh
✓ Equipment packed and cleaned
✓ Driver assigned
✓ GPS tracking active

You'll receive a notification when:
- Our driver starts the journey
- Delivery is on the way (with live GPS tracking)
- Delivery is complete

Have an amazing event!

Best regards,
{company_name}`,
    category: "reminder",
    trigger: "event_reminder_1",
    delayDays: -1,
  },
  {
    id: "review_request",
    name: "Review Request",
    subject: "How was your event? Share your feedback",
    body: `Dear {client_name},

We hope your event on {event_date} was absolutely amazing!

We'd love to hear about your experience with our catering service for order {order_id}.

Your feedback helps us improve and serve you better. It only takes 2 minutes:

[Leave Review]

As a thank you for your feedback, we'll send you a 10% discount code for your next event!

Thank you for choosing us!

Best regards,
{company_name}`,
    category: "review",
    trigger: "delivery_completed",
    delayDays: 1,
  },
];

export default function ProtectedEmailTemplatesPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <EmailTemplatesPage />
    </ProtectedRoute>
  );
}

function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showTemplateList, setShowTemplateList] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("email_templates");
    setTemplates(stored ? JSON.parse(stored) : defaultTemplates);
  }, []);

  const saveTemplates = (updatedTemplates: EmailTemplate[]) => {
    setTemplates(updatedTemplates);
    localStorage.setItem("email_templates", JSON.stringify(updatedTemplates));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleSelectTemplate = (template: EmailTemplate) => {
    setSelectedTemplate({ ...template });
    setEditMode(true);
    setPreviewMode(false);
    setShowTemplateList(false);
  };

  const handleBackToList = () => {
    setShowTemplateList(true);
    setSelectedTemplate(null);
    setEditMode(false);
    setPreviewMode(false);
  };

  const handleSaveTemplate = () => {
    if (!selectedTemplate) return;

    const updated = templates.map((t) =>
      t.id === selectedTemplate.id ? selectedTemplate : t
    );
    saveTemplates(updated);
    setEditMode(false);
  };

  const handlePreview = () => {
    setPreviewMode(true);
  };

  const renderPreview = () => {
    if (!selectedTemplate) return null;

    const sampleData = {
      client_name: "Sarah Johnson",
      quote_id: "Q-001",
      order_id: "ORD-001",
      total_amount: "38,500",
      event_date: "2025-12-15",
      guest_count: "150",
      venue: "Grand Palace Hotel",
      company_name: "Your Catering Company",
      quote_date: "2025-11-01",
      discount_percentage: "10",
      discounted_amount: "34,650",
      date_availability_message: "Good news! Your preferred date is still available.",
      event_time: "18:00",
      delivery_time: "16:30",
      amount: "38,500",
      payment_status_message: "Payment confirmed - thank you!",
    };

    let preview = selectedTemplate.body;
    Object.entries(sampleData).forEach(([key, value]) => {
      preview = preview.replace(new RegExp(`{${key}}`, "g"), value);
    });

    return preview;
  };

  const getCategoryColor = (category: EmailTemplate["category"]) => {
    const colors = {
      quote: "bg-blue-100 text-blue-800",
      followup: "bg-purple-100 text-purple-800",
      payment: "bg-green-100 text-green-800",
      reminder: "bg-orange-100 text-orange-800",
      review: "bg-pink-100 text-pink-800",
    };
    return colors[category];
  };

  const getCategoryIcon = (category: EmailTemplate["category"]) => {
    const icons = {
      quote: Mail,
      followup: Send,
      payment: DollarSign,
      reminder: Calendar,
      review: MessageSquare,
    };
    const Icon = icons[category];
    return <Icon className="w-3 h-3 md:w-4 md:h-4" />;
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Email Templates | CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-screen-2xl">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg flex-shrink-0">
                <Mail className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Email Templates</h1>
                <p className="text-sm md:text-base text-slate-600 hidden sm:block">Customize automated communications</p>
              </div>
            </div>
            {saved && (
              <Badge className="bg-green-100 text-green-800 border-green-200 text-xs md:text-sm">
                <CheckCircle className="w-3 h-3 md:w-4 md:h-4 mr-2" />
                Saved
              </Badge>
            )}
          </div>

          {/* Mobile: Toggle between list and editor */}
          <div className="lg:hidden">
            {showTemplateList ? (
              <Card className="border-0 shadow-lg">
                <CardHeader className="px-4 py-4">
                  <CardTitle className="text-lg">Templates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 px-4">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className="w-full text-left p-3 rounded-lg bg-slate-50 hover:bg-slate-100 border-2 border-transparent hover:border-purple-200 transition-all"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm truncate pr-2">{template.name}</span>
                        <Badge className={`text-xs flex-shrink-0 ${getCategoryColor(template.category)}`}>
                          {getCategoryIcon(template.category)}
                        </Badge>
                      </div>
                      {template.delayDays && (
                        <p className="text-xs text-slate-600">
                          {Math.abs(template.delayDays)} days {template.delayDays > 0 ? "after" : "before"}
                        </p>
                      )}
                    </button>
                  ))}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <Button variant="outline" onClick={handleBackToList} size="sm" className="w-full sm:w-auto">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Templates
                </Button>

                {selectedTemplate && (
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="px-4 py-4">
                      <div className="space-y-3">
                        <div>
                          <CardTitle className="text-lg">{selectedTemplate.name}</CardTitle>
                          <Badge className={`mt-2 text-xs ${getCategoryColor(selectedTemplate.category)}`}>
                            {selectedTemplate.category}
                          </Badge>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button variant="outline" onClick={handlePreview} size="sm" className="w-full sm:w-auto">
                            <Eye className="w-4 h-4 mr-2" />
                            Preview
                          </Button>
                          {editMode && (
                            <Button onClick={handleSaveTemplate} className="bg-purple-600 w-full sm:w-auto" size="sm">
                              <Save className="w-4 h-4 mr-2" />
                              Save
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4">
                      {previewMode ? (
                        <div className="space-y-4">
                          <Alert>
                            <AlertDescription className="text-xs md:text-sm">
                              Preview with sample data
                            </AlertDescription>
                          </Alert>
                          <div className="bg-white border rounded-lg p-4">
                            <div className="border-b pb-3 mb-3">
                              <p className="text-xs text-slate-600">Subject:</p>
                              <p className="font-semibold text-sm">{selectedTemplate.subject}</p>
                            </div>
                            <div className="whitespace-pre-wrap text-xs md:text-sm">{renderPreview()}</div>
                          </div>
                          <Button variant="outline" onClick={() => setPreviewMode(false)} size="sm" className="w-full">
                            Back to Edit
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label className="text-sm">Subject Line</Label>
                            <Input
                              value={selectedTemplate.subject}
                              onChange={(e) =>
                                setSelectedTemplate({ ...selectedTemplate, subject: e.target.value })
                              }
                              placeholder="Email subject"
                              className="text-sm"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm">Email Body</Label>
                            <Textarea
                              value={selectedTemplate.body}
                              onChange={(e) =>
                                setSelectedTemplate({ ...selectedTemplate, body: e.target.value })
                              }
                              rows={15}
                              className="font-mono text-xs"
                            />
                          </div>

                          <Alert>
                            <AlertDescription>
                              <p className="font-semibold mb-2 text-xs">Variables:</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <code>{"{client_name}"}</code>
                                <code>{"{quote_id}"}</code>
                                <code>{"{order_id}"}</code>
                                <code>{"{total_amount}"}</code>
                              </div>
                            </AlertDescription>
                          </Alert>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>

          {/* Desktop: Side-by-side layout */}
          <div className="hidden lg:grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Templates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className={`w-full text-left p-3 rounded-lg transition-all ${
                        selectedTemplate?.id === template.id
                          ? "bg-purple-100 border-2 border-purple-300"
                          : "bg-slate-50 hover:bg-slate-100 border-2 border-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{template.name}</span>
                        <Badge className={`text-xs ${getCategoryColor(template.category)}`}>
                          {getCategoryIcon(template.category)}
                        </Badge>
                      </div>
                      {template.delayDays && (
                        <p className="text-xs text-slate-600">
                          {Math.abs(template.delayDays)} days {template.delayDays > 0 ? "after" : "before"}
                        </p>
                      )}
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2">
              {selectedTemplate ? (
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{selectedTemplate.name}</CardTitle>
                        <Badge className={`mt-2 ${getCategoryColor(selectedTemplate.category)}`}>
                          {selectedTemplate.category}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={handlePreview}>
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </Button>
                        {editMode && (
                          <Button onClick={handleSaveTemplate} className="bg-purple-600">
                            <Save className="w-4 h-4 mr-2" />
                            Save
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {previewMode ? (
                      <div className="space-y-4">
                        <Alert>
                          <AlertDescription>
                            Preview with sample data
                          </AlertDescription>
                        </Alert>
                        <div className="bg-white border rounded-lg p-6">
                          <div className="border-b pb-4 mb-4">
                            <p className="text-sm text-slate-600">Subject:</p>
                            <p className="font-semibold">{selectedTemplate.subject}</p>
                          </div>
                          <div className="whitespace-pre-wrap text-sm">{renderPreview()}</div>
                        </div>
                        <Button variant="outline" onClick={() => setPreviewMode(false)}>
                          Back to Edit
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Subject Line</Label>
                          <Input
                            value={selectedTemplate.subject}
                            onChange={(e) =>
                              setSelectedTemplate({ ...selectedTemplate, subject: e.target.value })
                            }
                            placeholder="Email subject"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Email Body</Label>
                          <Textarea
                            value={selectedTemplate.body}
                            onChange={(e) =>
                              setSelectedTemplate({ ...selectedTemplate, body: e.target.value })
                            }
                            rows={20}
                            className="font-mono text-sm"
                          />
                        </div>

                        <Alert>
                          <AlertDescription>
                            <p className="font-semibold mb-2">Available Variables:</p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <code>{"{client_name}"}</code>
                              <code>{"{quote_id}"}</code>
                              <code>{"{order_id}"}</code>
                              <code>{"{total_amount}"}</code>
                              <code>{"{event_date}"}</code>
                              <code>{"{guest_count}"}</code>
                              <code>{"{venue}"}</code>
                              <code>{"{company_name}"}</code>
                            </div>
                          </AlertDescription>
                        </Alert>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-0 shadow-lg">
                  <CardContent className="pt-12 pb-12 text-center">
                    <Mail className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-600">Select a template to edit</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  return {
    props: {},
  };
};