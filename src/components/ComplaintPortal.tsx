import { useState } from "react";
import { formatLocalDate } from "@/lib/localFormat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  AlertTriangle, 
  MessageSquare, 
  CheckCircle2, 
  Clock, 
  Send,
  FileText,
  Calendar
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Complaint {
  id: string;
  orderId: string;
  subject: string;
  category: "food_quality" | "delivery" | "service" | "equipment" | "billing" | "other";
  description: string;
  status: "submitted" | "in_review" | "resolved" | "closed";
  priority: "low" | "medium" | "high";
  submittedAt: string;
  resolvedAt?: string;
  adminResponse?: string;
  attachments?: string[];
}

export function ComplaintPortal() {
  const [complaints, setComplaints] = useState<Complaint[]>([
    {
      id: "COMP-001",
      orderId: "ORD-001",
      subject: "Food arrived cold",
      category: "food_quality",
      description: "The main course arrived cold. Guests complained about the temperature.",
      status: "resolved",
      priority: "high",
      submittedAt: new Date(Date.now() - 172800000).toISOString(),
      resolvedAt: new Date(Date.now() - 86400000).toISOString(),
      adminResponse: "We sincerely apologize for this issue. We've identified that the heating equipment malfunctioned during transport. We've issued a 20% refund to your account and will ensure this doesn't happen again. We'd love the opportunity to make it right on your next event.",
    },
  ]);

  const [newComplaint, setNewComplaint] = useState<Partial<Complaint>>({
    category: "food_quality",
    priority: "medium",
  });
  const [showNewComplaintForm, setShowNewComplaintForm] = useState(false);

  const handleSubmitComplaint = () => {
    const complaint: Complaint = {
      id: `COMP-${String(complaints.length + 1).padStart(3, "0")}`,
      orderId: newComplaint.orderId || "",
      subject: newComplaint.subject || "",
      category: (newComplaint.category as Complaint["category"]) || "other",
      description: newComplaint.description || "",
      status: "submitted",
      priority: (newComplaint.priority as Complaint["priority"]) || "medium",
      submittedAt: new Date().toISOString(),
    };

    setComplaints([complaint, ...complaints]);
    setNewComplaint({ category: "food_quality", priority: "medium" });
    setShowNewComplaintForm(false);
  };

  const getStatusColor = (status: Complaint["status"]) => {
    const colors = {
      submitted: "bg-blue-100 text-blue-800",
      in_review: "bg-yellow-100 text-yellow-800",
      resolved: "bg-brand-primary/15 text-brand-primary",
      closed: "bg-slate-100 text-slate-800",
    };
    return colors[status];
  };

  const getPriorityColor = (priority: Complaint["priority"]) => {
    const colors = {
      low: "bg-slate-100 text-slate-800",
      medium: "bg-orange-100 text-orange-800",
      high: "bg-rose-100 text-rose-800",
    };
    return colors[priority];
  };

  const getStatusIcon = (status: Complaint["status"]) => {
    const icons = {
      submitted: Clock,
      in_review: MessageSquare,
      resolved: CheckCircle2,
      closed: FileText,
    };
    const Icon = icons[status];
    return <Icon className="w-4 h-4" />;
  };

  const getCategoryLabel = (category: Complaint["category"]) => {
    const labels = {
      food_quality: "Food Quality",
      delivery: "Delivery Issue",
      service: "Service",
      equipment: "Equipment",
      billing: "Billing",
      other: "Other",
    };
    return labels[category];
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card className="border-0 shadow-lg bg-gradient-to-br from-rose-50 to-orange-50">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl sm:text-2xl">Complaint Portal</CardTitle>
                <p className="text-xs sm:text-sm text-slate-600">We take your feedback seriously</p>
              </div>
            </div>
            <Dialog open={showNewComplaintForm} onOpenChange={setShowNewComplaintForm}>
              <DialogTrigger asChild>
                <Button className="bg-rose-600 hover:bg-rose-700 w-full sm:w-auto h-11">
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Submit Complaint
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="pb-4">
                  <DialogTitle className="text-lg sm:text-xl">Submit a Complaint</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm sm:text-base">Order ID</Label>
                    <Input
                      placeholder="ORD-001"
                      className="h-11"
                      value={newComplaint.orderId || ""}
                      onChange={(e) =>
                        setNewComplaint({ ...newComplaint, orderId: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm sm:text-base">Category</Label>
                    <Select
                      value={newComplaint.category}
                      onValueChange={(value) =>
                        setNewComplaint({ ...newComplaint, category: value as Complaint["category"] })
                      }
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="food_quality">Food Quality</SelectItem>
                        <SelectItem value="delivery">Delivery Issue</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                        <SelectItem value="equipment">Equipment</SelectItem>
                        <SelectItem value="billing">Billing</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm sm:text-base">Priority</Label>
                    <Select
                      value={newComplaint.priority}
                      onValueChange={(value) =>
                        setNewComplaint({ ...newComplaint, priority: value as Complaint["priority"] })
                      }
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm sm:text-base">Subject</Label>
                    <Input
                      placeholder="Brief description of the issue"
                      className="h-11"
                      value={newComplaint.subject || ""}
                      onChange={(e) =>
                        setNewComplaint({ ...newComplaint, subject: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm sm:text-base">Detailed Description</Label>
                    <Textarea
                      placeholder="Please provide as much detail as possible about your complaint..."
                      rows={6}
                      className="min-h-[120px]"
                      value={newComplaint.description || ""}
                      onChange={(e) =>
                        setNewComplaint({ ...newComplaint, description: e.target.value })
                      }
                    />
                  </div>

                  <Alert>
                    <AlertDescription className="text-xs sm:text-sm">
                      We aim to respond to all complaints within 24 hours. High priority issues will be addressed immediately.
                    </AlertDescription>
                  </Alert>

                  <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-4">
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto h-11"
                      onClick={() => setShowNewComplaintForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmitComplaint}
                      className="bg-rose-600 hover:bg-rose-700 w-full sm:w-auto h-11"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Submit Complaint
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      <div className="space-y-3 sm:space-y-4">
        {complaints.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="py-8 sm:py-12 text-center px-4">
              <CheckCircle2 className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-brand-primary mb-3 sm:mb-4" />
              <p className="text-base sm:text-lg font-semibold text-slate-900 mb-2">No complaints submitted</p>
              <p className="text-sm sm:text-base text-slate-600">We're glad everything is going smoothly!</p>
            </CardContent>
          </Card>
        ) : (
          complaints.map((complaint) => (
            <Card key={complaint.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <h3 className="font-semibold text-base sm:text-lg break-words">{complaint.subject}</h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={`${getStatusColor(complaint.status)} text-xs`}>
                          {getStatusIcon(complaint.status)}
                          <span className="ml-1">{complaint.status.replace("_", " ")}</span>
                        </Badge>
                        <Badge className={`${getPriorityColor(complaint.priority)} text-xs`}>
                          {complaint.priority} priority
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-slate-600">
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4 flex-shrink-0" />
                        Order: {complaint.orderId}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4 flex-shrink-0" />
                        {formatLocalDate(complaint.submittedAt)}
                      </span>
                      <Badge variant="outline" className="text-xs w-fit">{getCategoryLabel(complaint.category)}</Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-700 mb-1">Description:</p>
                  <p className="text-xs sm:text-sm text-slate-600 break-words">{complaint.description}</p>
                </div>

                {complaint.adminResponse && (
                  <div className="bg-brand-primary/10 border border-brand-primary/20 rounded-lg p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-brand-primary flex-shrink-0" />
                        <p className="font-semibold text-sm sm:text-base text-brand-primary">Admin Response</p>
                      </div>
                      {complaint.resolvedAt && (
                        <span className="text-xs sm:text-sm text-brand-primary">
                          • Resolved {formatLocalDate(complaint.resolvedAt)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 break-words">{complaint.adminResponse}</p>
                  </div>
                )}

                {complaint.status === "submitted" && (
                  <Alert>
                    <Clock className="w-4 h-4 flex-shrink-0" />
                    <AlertDescription className="text-xs sm:text-sm">
                      Your complaint has been received. Our team will review it and respond within 24 hours.
                    </AlertDescription>
                  </Alert>
                )}

                {complaint.status === "in_review" && (
                  <Alert>
                    <MessageSquare className="w-4 h-4 flex-shrink-0" />
                    <AlertDescription className="text-xs sm:text-sm">
                      Our team is currently reviewing your complaint and will provide a resolution soon.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
