
import { useState } from "react";
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
      resolved: "bg-green-100 text-green-800",
      closed: "bg-slate-100 text-slate-800",
    };
    return colors[status];
  };

  const getPriorityColor = (priority: Complaint["priority"]) => {
    const colors = {
      low: "bg-slate-100 text-slate-800",
      medium: "bg-orange-100 text-orange-800",
      high: "bg-red-100 text-red-800",
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
    <div className="space-y-6">
      <Card className="border-0 shadow-lg bg-gradient-to-br from-red-50 to-orange-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl">Complaint Portal</CardTitle>
                <p className="text-sm text-slate-600">We take your feedback seriously</p>
              </div>
            </div>
            <Dialog open={showNewComplaintForm} onOpenChange={setShowNewComplaintForm}>
              <DialogTrigger asChild>
                <Button className="bg-red-600 hover:bg-red-700">
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Submit Complaint
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Submit a Complaint</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Order ID</Label>
                    <Input
                      placeholder="ORD-001"
                      value={newComplaint.orderId || ""}
                      onChange={(e) =>
                        setNewComplaint({ ...newComplaint, orderId: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={newComplaint.category}
                      onValueChange={(value) =>
                        setNewComplaint({ ...newComplaint, category: value as Complaint["category"] })
                      }
                    >
                      <SelectTrigger>
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
                    <Label>Priority</Label>
                    <Select
                      value={newComplaint.priority}
                      onValueChange={(value) =>
                        setNewComplaint({ ...newComplaint, priority: value as Complaint["priority"] })
                      }
                    >
                      <SelectTrigger>
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
                    <Label>Subject</Label>
                    <Input
                      placeholder="Brief description of the issue"
                      value={newComplaint.subject || ""}
                      onChange={(e) =>
                        setNewComplaint({ ...newComplaint, subject: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Detailed Description</Label>
                    <Textarea
                      placeholder="Please provide as much detail as possible about your complaint..."
                      rows={6}
                      value={newComplaint.description || ""}
                      onChange={(e) =>
                        setNewComplaint({ ...newComplaint, description: e.target.value })
                      }
                    />
                  </div>

                  <Alert>
                    <AlertDescription>
                      We aim to respond to all complaints within 24 hours. High priority issues will be addressed immediately.
                    </AlertDescription>
                  </Alert>

                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => setShowNewComplaintForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmitComplaint}
                      className="bg-red-600 hover:bg-red-700"
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

      <div className="space-y-4">
        {complaints.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-12 pb-12 text-center">
              <CheckCircle2 className="w-16 h-16 mx-auto text-green-500 mb-4" />
              <p className="text-lg font-semibold text-slate-900 mb-2">No complaints submitted</p>
              <p className="text-slate-600">We're glad everything is going smoothly!</p>
            </CardContent>
          </Card>
        ) : (
          complaints.map((complaint) => (
            <Card key={complaint.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{complaint.subject}</h3>
                      <Badge className={getStatusColor(complaint.status)}>
                        {getStatusIcon(complaint.status)}
                        <span className="ml-1">{complaint.status.replace("_", " ")}</span>
                      </Badge>
                      <Badge className={getPriorityColor(complaint.priority)}>
                        {complaint.priority} priority
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        Order: {complaint.orderId}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(complaint.submittedAt).toLocaleDateString()}
                      </span>
                      <Badge variant="outline">{getCategoryLabel(complaint.category)}</Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-1">Description:</p>
                  <p className="text-slate-600">{complaint.description}</p>
                </div>

                {complaint.adminResponse && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="w-5 h-5 text-green-600" />
                      <p className="font-semibold text-green-900">Admin Response</p>
                      {complaint.resolvedAt && (
                        <span className="text-sm text-green-700">
                          • Resolved {new Date(complaint.resolvedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700">{complaint.adminResponse}</p>
                  </div>
                )}

                {complaint.status === "submitted" && (
                  <Alert>
                    <Clock className="w-4 h-4" />
                    <AlertDescription>
                      Your complaint has been received. Our team will review it and respond within 24 hours.
                    </AlertDescription>
                  </Alert>
                )}

                {complaint.status === "in_review" && (
                  <Alert>
                    <MessageSquare className="w-4 h-4" />
                    <AlertDescription>
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
