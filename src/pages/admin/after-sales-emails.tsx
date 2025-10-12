import { useState } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar, Mail, Clock, Edit, Save, X, AlertCircle, CheckCircle, TrendingUp } from "lucide-react";
import { defaultAfterSalesTemplates, interpolateEmailTemplate, getEmailVariables } from "@/lib/afterSalesTemplates";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Footer } from "@/components/Footer";

interface EmailTemplate {
  id: string;
  sequence: number;
  monthsAfterEvent: number;
  subject: string;
  body: string;
  callToAction: string;
  isActive: boolean;
  lastEdited: string;
}

export default function AfterSalesEmailsPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>(defaultAfterSalesTemplates);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewData, setPreviewData] = useState({
    clientName: "John Smith",
    eventType: "Corporate Gala",
    eventDate: new Date().toISOString(),
  });
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate({ ...template });
  };

  const handleSave = () => {
    if (editingTemplate) {
      setIsSaving(true);
      setTemplates(templates.map(t => 
        t.id === editingTemplate.id 
          ? { ...editingTemplate, lastEdited: new Date().toISOString() }
          : t
      ));
      
      setTimeout(() => {
        setIsSaving(false);
        setSavedMessage("Email template saved successfully!");
        setEditingTemplate(null);
        setTimeout(() => setSavedMessage(""), 3000);
      }, 500);
    }
  };

  const handleToggleActive = (templateId: string) => {
    setTemplates(templates.map(t => 
      t.id === templateId ? { ...t, isActive: !t.isActive } : t
    ));
  };

  const getPreviewEmail = (template: EmailTemplate) => {
    const variables = getEmailVariables(
      "ORD-001",
      previewData.clientName,
      previewData.eventType,
      previewData.eventDate
    );
    return {
      subject: interpolateEmailTemplate(template.subject, variables),
      body: interpolateEmailTemplate(template.body, variables),
    };
  };

  const getScheduleText = (monthsAfter: number) => {
    const months = [
      "immediately after event",
      "1 month after event",
      "2 months after event",
      "3 months after event",
      "4 months after event",
      "5 months after event",
      "6 months after event",
      "7 months after event",
      "8 months after event",
      "9 months after event",
      "10 months after event",
      "11 months after event",
      "12 months after event"
    ];
    return months[monthsAfter] || `${monthsAfter} months after event`;
  };

  const totalActiveEmails = templates.filter(t => t.isActive).length;

  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>After-Sales Email Automation | Catering Platform</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <Button
              variant="outline"
              onClick={() => window.history.back()}
              className="mb-4"
            >
              ← Back
            </Button>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
              After-Sales Email Automation
            </h1>
            <p className="text-slate-600">
              Manage intelligent follow-up emails sent over 12 months after each event
            </p>
          </div>

          {savedMessage && (
            <Alert className="mb-6 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{savedMessage}</AlertDescription>
            </Alert>
          )}

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Email Sequence</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">6 Emails</div>
                <p className="text-xs text-slate-600 mt-1">Over 12 months</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Active Templates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{totalActiveEmails}</div>
                <p className="text-xs text-slate-600 mt-1">Currently sending</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Email Frequency</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-indigo-600">Every 2 Mo</div>
                <p className="text-xs text-slate-600 mt-1">Consistent nurturing</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Email Journey Overview
              </CardTitle>
              <CardDescription>
                Strategic touchpoints to maintain client relationships and drive repeat business
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {templates.map((template, index) => (
                  <div
                    key={template.id}
                    className="flex items-center gap-4 p-4 rounded-lg border bg-white hover:shadow-md transition-shadow"
                  >
                    <div className="flex-shrink-0">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        template.isActive ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"
                      }`}>
                        <Mail className="h-6 w-6" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">Email {template.sequence}</h3>
                        <Badge variant={template.isActive ? "default" : "secondary"}>
                          {template.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 mb-1">{template.subject}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {getScheduleText(template.monthsAfterEvent)}
                        </span>
                        <span>Last edited: {new Date(template.lastEdited).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={template.isActive}
                        onCheckedChange={() => handleToggleActive(template.id)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(template)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Alert className="border-blue-200 bg-blue-50">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Pro Tip:</strong> Use variables like {"{"}{"{"} clientName {"}"}{"}"}, {"{"}{"{"} eventType {"}"}{"}"}, and {"{"}{"{"} eventDate {"}"}{"}"}  to personalize emails. 
              Toggle emails on/off based on your business needs. The system automatically schedules and sends these at the right intervals.
            </AlertDescription>
          </Alert>
        </div>

        <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Email {editingTemplate?.sequence}</DialogTitle>
              <DialogDescription>
                Customize this email template. Use variables to personalize content.
              </DialogDescription>
            </DialogHeader>

            {editingTemplate && (
              <Tabs defaultValue="edit" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="edit">Edit Template</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>

                <TabsContent value="edit" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email Subject</Label>
                    <Input
                      value={editingTemplate.subject}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                      placeholder="Email subject line"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Email Body</Label>
                    <Textarea
                      value={editingTemplate.body}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                      placeholder="Email body content"
                      rows={20}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Call to Action Button Text</Label>
                    <Input
                      value={editingTemplate.callToAction}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, callToAction: e.target.value })}
                      placeholder="Button text"
                    />
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-sm mb-2 text-blue-900">Available Variables:</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm text-blue-700">
                      <code>{"{"}{"{"} clientName {"}"}{"}"}  </code>
                      <code>{"{"}{"{"} eventType {"}"}{"}"}  </code>
                      <code>{"{"}{"{"} eventDate {"}"}{"}"}  </code>
                      <code>{"{"}{"{"} eventMonth {"}"}{"}"}  </code>
                      <code>{"{"}{"{"} orderId {"}"}{"}"}  </code>
                      <code>{"{"}{"{"} year {"}"}{"}"}  </code>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setEditingTemplate(null)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="preview" className="space-y-4">
                  <div className="bg-slate-50 border rounded-lg p-4 mb-4">
                    <h4 className="font-semibold mb-3">Preview Data</h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Client Name</Label>
                        <Input
                          value={previewData.clientName}
                          onChange={(e) => setPreviewData({ ...previewData, clientName: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Event Type</Label>
                        <Input
                          value={previewData.eventType}
                          onChange={(e) => setPreviewData({ ...previewData, eventType: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Event Date</Label>
                        <Input
                          type="date"
                          value={previewData.eventDate.split('T')[0]}
                          onChange={(e) => setPreviewData({ ...previewData, eventDate: new Date(e.target.value).toISOString() })}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  <Card>
                    <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                      <CardTitle className="text-lg">
                        {getPreviewEmail(editingTemplate).subject}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        From: Your Catering Company &lt;info@yourcatering.com&gt;
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="prose prose-sm max-w-none">
                        <div className="whitespace-pre-wrap">
                          {getPreviewEmail(editingTemplate).body}
                        </div>
                        <div className="mt-6">
                          <Button className="w-full">
                            {editingTemplate.callToAction}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>

        <Footer />
      </div>
    </>
  );
}
