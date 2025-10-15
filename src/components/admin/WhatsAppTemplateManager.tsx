import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Edit, Save, X, Eye } from "lucide-react";
import { whatsappTemplateService, WhatsAppTemplate } from "@/services/whatsappTemplateService";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function WhatsAppTemplateManager() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<WhatsAppTemplate | null>(null);
  const [stats, setStats] = useState({ total: 0, enabled: 0, disabled: 0, enabledPercentage: 0 });

  useEffect(() => {
    loadTemplates();
    loadStats();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await whatsappTemplateService.getAllTemplates();
      setTemplates(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load templates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await whatsappTemplateService.getTemplateStats();
      setStats(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      await whatsappTemplateService.toggleTemplate(id, !currentStatus);
      await loadTemplates();
      await loadStats();
      toast({
        title: "Success",
        description: `Template ${!currentStatus ? 'enabled' : 'disabled'} successfully`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update template",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (template: WhatsAppTemplate) => {
    setEditingId(template.id);
    setEditContent(template.template_content);
  };

  const handleSave = async (id: string) => {
    try {
      await whatsappTemplateService.updateTemplate(id, {
        template_content: editContent
      });
      await loadTemplates();
      setEditingId(null);
      toast({
        title: "Success",
        description: "Template updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save template",
        variant: "destructive",
      });
    }
  };

  const handlePreview = (template: WhatsAppTemplate) => {
    setPreviewTemplate(template);
    setPreviewOpen(true);
  };

  const getSampleData = (template: WhatsAppTemplate): Record<string, string> => {
    const samples: Record<string, string> = {
      client_name: "John Smith",
      order_number: "ORD-12345",
      event_date: "December 25, 2025",
      event_time: "6:00 PM",
      venue_name: "Grand Ballroom",
      venue_address: "123 Main St, City",
      driver_name: "Mike Johnson",
      tracking_link: "https://example.com/track/12345",
      eta: "30 minutes",
      company_name: "Premier Catering"
    };

    return samples;
  };

  if (loading) {
    return <div className="p-4">Loading templates...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Enabled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.enabled}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Disabled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-400">{stats.disabled}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.enabledPercentage}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Templates List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            WhatsApp Message Templates
          </CardTitle>
          <CardDescription>
            Customize and enable/disable automated WhatsApp messages sent to clients
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {templates.map((template) => (
            <div key={template.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold">{template.template_name}</h3>
                  <Badge variant={template.is_enabled ? "default" : "secondary"}>
                    {template.is_enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePreview(template)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Switch
                    checked={template.is_enabled}
                    onCheckedChange={() => handleToggle(template.id, template.is_enabled)}
                  />
                </div>
              </div>

              {template.description && (
                <p className="text-sm text-muted-foreground">{template.description}</p>
              )}

              {editingId === template.id ? (
                <div className="space-y-2">
                  <Label>Template Content</Label>
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={6}
                    className="font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleSave(template.id)}>
                      <Save className="h-4 w-4 mr-1" />
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="bg-muted p-3 rounded text-sm font-mono whitespace-pre-wrap">
                    {template.template_content}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleEdit(template)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit Template
                  </Button>
                </div>
              )}

              {template.variables.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground">Variables:</span>
                  {template.variables.map((variable) => (
                    <Badge key={variable} variant="outline" className="text-xs">
                      {`{{${variable}}}`}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preview: {previewTemplate?.template_name}</DialogTitle>
            <DialogDescription>
              This is how the message will appear to clients (with sample data)
            </DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm whitespace-pre-wrap">
                  {whatsappTemplateService.previewTemplate(
                    previewTemplate,
                    getSampleData(previewTemplate)
                  )}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
