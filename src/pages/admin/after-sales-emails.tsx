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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Mail, Clock, Edit, Save, X, AlertCircle, CheckCircle, TrendingUp, ArrowLeft } from "lucide-react";
import { defaultAfterSalesTemplates, interpolateEmailTemplate, getEmailVariables } from "@/lib/afterSalesTemplates";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute"; // Importing ProtectedRoute
import {  UserRole  } from "@/types/app"; // Importing UserRole

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

function AfterSalesEmailsPage() {
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
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>After-Sales Email Automation | Catering Platform</title>
      </Head>

      <AdminNav />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 lg:pl-64">
        <div className="container mx-auto px-4 py-6 md:py-8">
          {/* Header - Mobile Optimized */}
          <div className="mb-6 md:mb-8">
            <Button
              variant="outline"
              onClick={() => window.history.back()}
              className="mb-4"
              size="sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
              After-Sales Email Automation
            </h1>
            <p className="text-sm md:text-base text-slate-600">
              Manage intelligent follow-up emails sent over 12 months after each event
            </p>
          </div>

          {savedMessage && (
            <Alert className="mb-6 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm md:text-base text-green-800">{savedMessage}</AlertDescription>
            </Alert>
          )}

          {/* Stats Cards - Mobile Optimized Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-3 px-4 pt-4">
                <CardTitle className="text-sm md:text-base font-medium">Total Email Sequence</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl md:text-3xl font-bold text-blue-600">6 Emails</div>
                <p className="text-xs md:text-sm text-slate-600 mt-1">Over 12 months</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-3 px-4 pt-4">
                <CardTitle className="text-sm md:text-base font-medium">Active Templates</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl md:text-3xl font-bold text-green-600">{totalActiveEmails}</div>
                <p className="text-xs md:text-sm text-slate-600 mt-1">Currently sending</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-3 px-4 pt-4">
                <CardTitle className="text-sm md:text-base font-medium">Email Frequency</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl md:text-3xl font-bold text-indigo-600">Every 2 Mo</div>
                <p className="text-xs md:text-sm text-slate-600 mt-1">Consistent nurturing</p>
              </CardContent>
            </Card>
          </div>

          {/* Email Journey Overview - Mobile Optimized */}
          <Card className="mb-6 md:mb-8 border-0 shadow-lg">
            <CardHeader className="px-4 md:px-6">
              <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                <TrendingUp className="w-5 h-5" />
                Email Journey Overview
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Strategic touchpoints to maintain client relationships and drive repeat business
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 md:px-6">
              <div className="space-y-3">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 md:p-4 rounded-lg border bg-white hover:shadow-md transition-shadow"
                  >
                    {/* Icon and Info */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center ${
                          template.isActive ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"
                        }`}>
                          <Mail className="w-5 h-5 md:w-6 md:h-6" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-semibold text-sm md:text-base">Email {template.sequence}</h3>
                          <Badge variant={template.isActive ? "default" : "secondary"} className="text-xs">
                            {template.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="text-xs md:text-sm text-slate-600 mb-2 break-words">{template.subject}</p>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{getScheduleText(template.monthsAfterEvent)}</span>
                          </span>
                          <span className="hidden sm:inline">•</span>
                          <span>Last edited: {new Date(template.lastEdited).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:justify-center">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={template.isActive}
                          onCheckedChange={() => handleToggleActive(template.id)}
                        />
                        <span className="text-xs text-slate-600 sm:hidden">
                          {template.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(template)}
                        className="flex-1 sm:flex-initial"
                      >
                        <Edit className="h-4 w-4 sm:mr-0 md:mr-2" />
                        <span className="sm:hidden md:inline">Edit</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pro Tip - Mobile Optimized */}
          <Alert className="border-blue-200 bg-blue-50">
            <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <AlertDescription className="text-xs md:text-sm text-blue-800">
              <strong>Pro Tip:</strong> Use variables like {"{"}{"{"} clientName {"}"}{"}"}, {"{"}{"{"} eventType {"}"}{"}"}, and {"{"}{"{"} eventDate {"}"}{"}"}  to personalize emails. 
              Toggle emails on/off based on your business needs. The system automatically schedules and sends these at the right intervals.
            </AlertDescription>
          </Alert>
        </div>

        {/* Edit Dialog - Mobile Optimized */}
        <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
            <DialogHeader>
              <DialogTitle className="text-lg md:text-xl">Edit Email {editingTemplate?.sequence}</DialogTitle>
              <DialogDescription className="text-xs md:text-sm">
                Customize this email template. Use variables to personalize content.
              </DialogDescription>
            </DialogHeader>

            {editingTemplate && (
              <Tabs defaultValue="edit" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="edit" className="text-xs md:text-sm">Edit Template</TabsTrigger>
                  <TabsTrigger value="preview" className="text-xs md:text-sm">Preview</TabsTrigger>
                </TabsList>

                <TabsContent value="edit" className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm md:text-base">Email Subject</Label>
                    <Input
                      value={editingTemplate.subject}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                      placeholder="Email subject line"
                      className="text-sm md:text-base"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm md:text-base">Email Body</Label>
                    <Textarea
                      value={editingTemplate.body}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                      placeholder="Email body content"
                      rows={15}
                      className="font-mono text-xs md:text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm md:text-base">Call to Action Button Text</Label>
                    <Input
                      value={editingTemplate.callToAction}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, callToAction: e.target.value })}
                      placeholder="Button text"
                      className="text-sm md:text-base"
                    />
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 md:p-4">
                    <h4 className="font-semibold text-xs md:text-sm mb-2 text-blue-900">Available Variables:</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs md:text-sm text-blue-700">
                      <code className="break-all">{"{"}{"{"} clientName {"}"}{"}"}  </code>
                      <code className="break-all">{"{"}{"{"} eventType {"}"}{"}"}  </code>
                      <code className="break-all">{"{"}{"{"} eventDate {"}"}{"}"}  </code>
                      <code className="break-all">{"{"}{"{"} eventMonth {"}"}{"}"}  </code>
                      <code className="break-all">{"{"}{"{"} orderId {"}"}{"}"}  </code>
                      <code className="break-all">{"{"}{"{"} year {"}"}{"}"}  </code>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setEditingTemplate(null)}
                      className="w-full sm:w-auto text-sm"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="w-full sm:w-auto text-sm"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="preview" className="space-y-4">
                  <div className="bg-slate-50 border rounded-lg p-3 md:p-4 mb-4">
                    <h4 className="font-semibold mb-3 text-sm md:text-base">Preview Data</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs md:text-sm">Client Name</Label>
                        <Input
                          value={previewData.clientName}
                          onChange={(e) => setPreviewData({ ...previewData, clientName: e.target.value })}
                          className="mt-1 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs md:text-sm">Event Type</Label>
                        <Input
                          value={previewData.eventType}
                          onChange={(e) => setPreviewData({ ...previewData, eventType: e.target.value })}
                          className="mt-1 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs md:text-sm">Event Date</Label>
                        <Input
                          type="date"
                          value={previewData.eventDate.split('T')[0]}
                          onChange={(e) => setPreviewData({ ...previewData, eventDate: new Date(e.target.value).toISOString() })}
                          className="mt-1 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <Card>
                    <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-4">
                      <CardTitle className="text-base md:text-lg break-words">
                        {getPreviewEmail(editingTemplate).subject}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        From: Your Catering Company &lt;info@yourcatering.com&gt;
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 px-4">
                      <div className="prose prose-sm max-w-none">
                        <div className="whitespace-pre-wrap text-xs md:text-sm break-words">
                          {getPreviewEmail(editingTemplate).body}
                        </div>
                        <div className="mt-6">
                          <Button className="w-full text-sm">
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

export default function ProtectedAfterSalesEmailsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.OWNER]}>
      <AfterSalesEmailsPage />
    </ProtectedRoute>
  );
}