import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { Save, Send, Settings, Mail, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";

interface EmailConfig {
  provider: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
}

interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  delayDays: number;
  enabled: boolean;
  subject: string;
  body: string;
}

export default function ProtectedEmailAutomationSettings() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <EmailAutomationSettings />
    </ProtectedRoute>
  );
}

function EmailAutomationSettings() {
  const { user } = useAuth();
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    provider: "smtp",
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPassword: "",
    fromEmail: "",
    fromName: "",
    enabled: false
  });

  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([
    {
      id: "quote-sent",
      name: "Quote Sent",
      trigger: "quote_created",
      delayDays: 0,
      enabled: true,
      subject: "Your Catering Quote #{quoteNumber}",
      body: "Dear {clientName},\n\nThank you for your interest in our catering services. Please find attached your personalized quote for {eventDate}.\n\nQuote Details:\n- Event: {eventType}\n- Guest Count: {guestCount}\n- Total: {currency}{totalAmount}\n\nThis quote is valid for 14 days. To accept, simply click the link below:\n{acceptLink}\n\nBest regards,\n{companyName}"
    },
    {
      id: "quote-followup-1",
      name: "First Follow-up",
      trigger: "quote_no_response",
      delayDays: 3,
      enabled: true,
      subject: "Following up on your catering quote",
      body: "Hi {clientName},\n\nI wanted to follow up on the quote we sent for {eventDate}. Do you have any questions about our services or pricing?\n\nI'm here to help customize the perfect menu for your event.\n\nBest regards,\n{companyName}"
    },
    {
      id: "quote-followup-2",
      name: "Second Follow-up with Offer",
      trigger: "quote_no_response",
      delayDays: 7,
      enabled: true,
      subject: "Special offer for your event",
      body: "Hi {clientName},\n\nI noticed we haven't heard back about your {eventDate} event. If the date is still available, we'd love to offer you a 5% discount if you book within the next 48 hours.\n\nYour new total would be: {currency}{discountedAmount}\n\nLet me know if you have any questions!\n\nBest regards,\n{companyName}"
    },
    {
      id: "booking-confirmed",
      name: "Booking Confirmation",
      trigger: "booking_confirmed",
      delayDays: 0,
      enabled: true,
      subject: "Booking Confirmed - {eventDate}",
      body: "Dear {clientName},\n\nWonderful news! Your event is now confirmed for {eventDate}.\n\nBooking Details:\n- Event: {eventType}\n- Guest Count: {guestCount}\n- Location: {eventLocation}\n- Time: {eventTime}\n\nWhat happens next:\n1. You'll receive reminder emails leading up to your event\n2. Our team will prepare everything fresh on the day\n3. You can track delivery in real-time on your dashboard\n\nThank you for choosing us!\n\n{companyName}"
    },
    {
      id: "payment-received",
      name: "Payment Confirmation",
      trigger: "payment_received",
      delayDays: 0,
      enabled: true,
      subject: "Payment Received - Thank You!",
      body: "Hi {clientName},\n\nThank you! We've received your payment of {currency}{paymentAmount}.\n\nPayment Details:\n- Invoice: #{invoiceNumber}\n- Amount: {currency}{paymentAmount}\n- Date: {paymentDate}\n- Method: {paymentMethod}\n\nYour event is fully confirmed and we're excited to serve you on {eventDate}.\n\nBest regards,\n{companyName}"
    },
    {
      id: "reminder-14days",
      name: "14-Day Reminder",
      trigger: "event_upcoming",
      delayDays: -14,
      enabled: true,
      subject: "Your event is 2 weeks away!",
      body: "Hi {clientName},\n\nYour event is coming up in 2 weeks on {eventDate}. Just checking in to confirm:\n\n- Guest count: {guestCount}\n- Menu: {menuDetails}\n- Delivery time: {eventTime}\n- Location: {eventLocation}\n\nIf you need to make any changes, please let us know by {changeDeadline}.\n\nLooking forward to serving you!\n\n{companyName}"
    },
    {
      id: "reminder-7days",
      name: "7-Day Reminder",
      trigger: "event_upcoming",
      delayDays: -7,
      enabled: true,
      subject: "One week until your event",
      body: "Hi {clientName},\n\nYour event is one week away! Everything is on track for {eventDate}.\n\nFinal Details:\n- Guest count: {guestCount}\n- Delivery time: {eventTime}\n- Contact: {contactPhone}\n\nYou can track your delivery in real-time on the day through your dashboard.\n\nSee you soon!\n\n{companyName}"
    },
    {
      id: "reminder-3days",
      name: "3-Day Reminder",
      trigger: "event_upcoming",
      delayDays: -3,
      enabled: true,
      subject: "Almost here - your event in 3 days!",
      body: "Hi {clientName},\n\nJust 3 days until your event on {eventDate}! Our team is preparing to make it perfect.\n\nQuick reminder:\n- Be ready for delivery at: {eventTime}\n- Contact number: {contactPhone}\n- Special instructions: {specialInstructions}\n\nIf you have any last-minute questions, just reply to this email.\n\nBest regards,\n{companyName}"
    },
    {
      id: "reminder-1day",
      name: "Day Before Reminder",
      trigger: "event_upcoming",
      delayDays: -1,
      enabled: true,
      subject: "Tomorrow is the big day!",
      body: "Hi {clientName},\n\nYour event is tomorrow! We're all set and excited to serve you.\n\nFinal Checklist:\n✓ Food is being prepared fresh\n✓ Equipment is ready\n✓ Driver is assigned\n✓ Delivery at: {eventTime}\n\nYou'll receive a notification when your driver is on the way, and you can track them live on your dashboard.\n\nSee you tomorrow!\n\n{companyName}"
    },
    {
      id: "post-event-review",
      name: "Request Review",
      trigger: "event_completed",
      delayDays: 1,
      enabled: true,
      subject: "How was your event?",
      body: "Hi {clientName},\n\nWe hope your event yesterday was a success! We'd love to hear about your experience.\n\nCould you spare 2 minutes to share your feedback?\n{reviewLink}\n\nYour feedback helps us serve you better and helps other clients make their decision.\n\nThank you for choosing us!\n\n{companyName}"
    }
  ]);

  const [testEmail, setTestEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedRule, setSelectedRule] = useState<string>("quote-sent");

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      localStorage.setItem("emailConfig", JSON.stringify(emailConfig));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving config:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRule = async (rule: AutomationRule) => {
    setSaving(true);
    try {
      const updatedRules = automationRules.map(r => r.id === rule.id ? rule : r);
      setAutomationRules(updatedRules);
      localStorage.setItem("automationRules", JSON.stringify(updatedRules));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving rule:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) return;
    alert(`Test email would be sent to: ${testEmail}\n\nNote: Configure SMTP settings to enable actual email sending.`);
  };

  const currentRule = automationRules.find(r => r.id === selectedRule);

  useEffect(() => {
    const savedConfig = localStorage.getItem("emailConfig");
    if (savedConfig) {
      setEmailConfig(JSON.parse(savedConfig));
    }

    const savedRules = localStorage.getItem("automationRules");
    if (savedRules) {
      setAutomationRules(JSON.parse(savedRules));
    }
  }, []);

  if (user?.role !== "admin" && user?.role !== "company_admin" && user?.role !== "super_admin") {
    return (
      <>
        <NoIndexMeta />
        <div className="flex items-center justify-center min-h-screen">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You do not have permission to access this page.
            </AlertDescription>
          </Alert>
        </div>
      </>
    );
  }

  return (
    <>
      <NoIndexMeta />
      <AdminNav />
      <div className="p-6 max-w-full lg:pl-64 xl:pl-72">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Email Automation Settings</h1>
            <p className="text-muted-foreground">
              Configure email service provider and automation rules
            </p>
          </div>
          {saveSuccess && (
            <Alert className="w-auto">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>Settings saved successfully!</AlertDescription>
            </Alert>
          )}
        </div>

        <Tabs defaultValue="smtp" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="smtp">
              <Settings className="mr-2 h-4 w-4" />
              SMTP Configuration
            </TabsTrigger>
            <TabsTrigger value="automation">
              <Clock className="mr-2 h-4 w-4" />
              Automation Rules
            </TabsTrigger>
            <TabsTrigger value="test">
              <Send className="mr-2 h-4 w-4" />
              Test & Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="smtp" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Email Service Provider</CardTitle>
                <CardDescription>
                  Configure your SMTP settings to enable automated emails
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="email-enabled">Enable Email Automation</Label>
                    <p className="text-sm text-muted-foreground">
                      Turn on to start sending automated emails
                    </p>
                  </div>
                  <Switch
                    id="email-enabled"
                    checked={emailConfig.enabled}
                    onCheckedChange={(checked) =>
                      setEmailConfig({ ...emailConfig, enabled: checked })
                    }
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="provider">Email Provider</Label>
                    <Select
                      value={emailConfig.provider}
                      onValueChange={(value) =>
                        setEmailConfig({ ...emailConfig, provider: value })
                      }
                    >
                      <SelectTrigger id="provider">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="smtp">Custom SMTP</SelectItem>
                        <SelectItem value="sendgrid">SendGrid</SelectItem>
                        <SelectItem value="mailgun">Mailgun</SelectItem>
                        <SelectItem value="ses">Amazon SES</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="from-email">From Email</Label>
                    <Input
                      id="from-email"
                      type="email"
                      placeholder="noreply@yourcompany.com"
                      value={emailConfig.fromEmail}
                      onChange={(e) =>
                        setEmailConfig({ ...emailConfig, fromEmail: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="from-name">From Name</Label>
                    <Input
                      id="from-name"
                      placeholder="Your Company Name"
                      value={emailConfig.fromName}
                      onChange={(e) =>
                        setEmailConfig({ ...emailConfig, fromName: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-host">SMTP Host</Label>
                    <Input
                      id="smtp-host"
                      placeholder="smtp.gmail.com"
                      value={emailConfig.smtpHost}
                      onChange={(e) =>
                        setEmailConfig({ ...emailConfig, smtpHost: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-port">SMTP Port</Label>
                    <Input
                      id="smtp-port"
                      placeholder="587"
                      value={emailConfig.smtpPort}
                      onChange={(e) =>
                        setEmailConfig({ ...emailConfig, smtpPort: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-user">SMTP Username</Label>
                    <Input
                      id="smtp-user"
                      placeholder="your-email@gmail.com"
                      value={emailConfig.smtpUser}
                      onChange={(e) =>
                        setEmailConfig({ ...emailConfig, smtpUser: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="smtp-password">SMTP Password</Label>
                    <Input
                      id="smtp-password"
                      type="password"
                      placeholder="Your SMTP password or app password"
                      value={emailConfig.smtpPassword}
                      onChange={(e) =>
                        setEmailConfig({ ...emailConfig, smtpPassword: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      For Gmail, use an App Password instead of your regular password
                    </p>
                  </div>
                </div>

                <Button onClick={handleSaveConfig} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Saving..." : "Save Configuration"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Setup Guides</CardTitle>
                <CardDescription>
                  Popular email service provider configurations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">Gmail</h3>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>Host: smtp.gmail.com</li>
                      <li>Port: 587</li>
                      <li>Enable 2FA and create App Password</li>
                    </ul>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">Outlook/Office 365</h3>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>Host: smtp.office365.com</li>
                      <li>Port: 587</li>
                      <li>Use your email and password</li>
                    </ul>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">SendGrid</h3>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>Host: smtp.sendgrid.net</li>
                      <li>Port: 587</li>
                      <li>Username: apikey</li>
                      <li>Password: Your API key</li>
                    </ul>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">Amazon SES</h3>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>Host: email-smtp.region.amazonaws.com</li>
                      <li>Port: 587</li>
                      <li>Use SMTP credentials from console</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="automation" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Automation Rules</CardTitle>
                  <CardDescription>
                    Select a rule to edit
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {automationRules.map((rule) => (
                    <button
                      key={rule.id}
                      onClick={() => setSelectedRule(rule.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedRule === rule.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{rule.name}</span>
                        {rule.enabled ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {rule.delayDays === 0
                          ? "Immediate"
                          : rule.delayDays > 0
                          ? `${rule.delayDays} days after`
                          : `${Math.abs(rule.delayDays)} days before`}
                      </p>
                    </button>
                  ))}
                </CardContent>
              </Card>

              {currentRule && (
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>{currentRule.name}</CardTitle>
                    <CardDescription>
                      Customize the email template and settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Enable this automation</Label>
                        <p className="text-sm text-muted-foreground">
                          Turn on to activate this email
                        </p>
                      </div>
                      <Switch
                        checked={currentRule.enabled}
                        onCheckedChange={(checked) => {
                          const updated = { ...currentRule, enabled: checked };
                          handleSaveRule(updated);
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="delay">Timing</Label>
                      <Select
                        value={currentRule.delayDays.toString()}
                        onValueChange={(value) => {
                          const updated = { ...currentRule, delayDays: parseInt(value) };
                          handleSaveRule(updated);
                        }}
                      >
                        <SelectTrigger id="delay">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Immediately</SelectItem>
                          <SelectItem value="1">1 day after</SelectItem>
                          <SelectItem value="3">3 days after</SelectItem>
                          <SelectItem value="7">7 days after</SelectItem>
                          <SelectItem value="14">14 days after</SelectItem>
                          <SelectItem value="-1">1 day before</SelectItem>
                          <SelectItem value="-3">3 days before</SelectItem>
                          <SelectItem value="-7">7 days before</SelectItem>
                          <SelectItem value="-14">14 days before</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subject">Email Subject</Label>
                      <Input
                        id="subject"
                        value={currentRule.subject}
                        onChange={(e) => {
                          const updated = { ...currentRule, subject: e.target.value };
                          setAutomationRules(
                            automationRules.map(r => r.id === currentRule.id ? updated : r)
                          );
                        }}
                        onBlur={() => handleSaveRule(currentRule)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="body">Email Body</Label>
                      <Textarea
                        id="body"
                        rows={12}
                        value={currentRule.body}
                        onChange={(e) => {
                          const updated = { ...currentRule, body: e.target.value };
                          setAutomationRules(
                            automationRules.map(r => r.id === currentRule.id ? updated : r)
                          );
                        }}
                        onBlur={() => handleSaveRule(currentRule)}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Available variables: {"{clientName}"}, {"{eventDate}"}, {"{quoteNumber}"},
                        {"{currency}"}, {"{totalAmount}"}, {"{companyName}"}, {"{eventType}"},
                        {"{guestCount}"}, {"{eventLocation}"}, {"{eventTime}"}
                      </p>
                    </div>

                    <Button onClick={() => handleSaveRule(currentRule)} disabled={saving}>
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? "Saving..." : "Save Template"}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="test" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Test Email Delivery</CardTitle>
                <CardDescription>
                  Send a test email to verify your configuration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="test-email">Test Email Address</Label>
                  <div className="flex gap-2">
                    <Input
                      id="test-email"
                      type="email"
                      placeholder="test@example.com"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                    />
                    <Button onClick={handleTestEmail} disabled={!testEmail || !emailConfig.enabled}>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Test
                    </Button>
                  </div>
                </div>

                {!emailConfig.enabled && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Email automation is disabled. Enable it in the SMTP Configuration tab to send emails.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Email Preview</CardTitle>
                <CardDescription>
                  Preview how your emails will look to recipients
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg p-6 bg-white">
                  <div className="border-b pb-4 mb-4">
                    <div className="text-sm text-muted-foreground mb-1">From:</div>
                    <div className="font-medium">
                      {emailConfig.fromName || "Your Company"} &lt;{emailConfig.fromEmail || "noreply@example.com"}&gt;
                    </div>
                  </div>
                  <div className="border-b pb-4 mb-4">
                    <div className="text-sm text-muted-foreground mb-1">Subject:</div>
                    <div className="font-medium">{currentRule?.subject || "Email Subject"}</div>
                  </div>
                  <div className="whitespace-pre-wrap text-sm">
                    {currentRule?.body || "Email body will appear here..."}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

// Disable static generation - this page requires authentication
export async function getServerSideProps() {
  return {
    props: {}
  };
}