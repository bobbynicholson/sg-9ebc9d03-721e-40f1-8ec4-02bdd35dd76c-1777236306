
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  Users,
  CheckCircle2,
  TrendingUp,
  Calendar,
  Filter,
  Download,
  Search,
} from "lucide-react";
import { kitchenDutyService } from "@/services/kitchenDutyService";
import { profileService } from "@/services/profileService";
import { AdminNav } from "@/components/admin/AdminNav";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

interface StaffMember {
  id: string;
  full_name: string;
  avatar_url?: string;
  email: string;
}

export default function KitchenDutyTrackingPage() {
  const { user } = useAuth();
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [dutyHistory, setDutyHistory] = useState<any[]>([]);
  const [taskHistory, setTaskHistory] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [performanceSummary, setPerformanceSummary] = useState<any>(null);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id, selectedStaff, dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [staff] = await Promise.all([
        profileService.getProfiles({
          role: "kitchen",
        }),
      ]);

      setStaffMembers(staff as any);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      const filters = {
        startDate: startDate.toISOString(),
        ...(selectedStaff !== "all" && { staffId: selectedStaff }),
      };

      const [shifts, tasks] = await Promise.all([
        kitchenDutyService.getDutyShiftHistory(filters),
        kitchenDutyService.getTaskCompletionHistory(filters),
      ]);

      setDutyHistory(shifts);
      setTaskHistory(tasks);

      if (selectedStaff !== "all") {
        const summary = await kitchenDutyService.getStaffPerformanceSummary(
          selectedStaff,
          parseInt(dateRange)
        );
        setPerformanceSummary(summary);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDutyHistory = dutyHistory.filter((shift) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      shift.staff?.full_name?.toLowerCase().includes(query) ||
      shift.order?.order_number?.toLowerCase().includes(query) ||
      shift.order?.client_name?.toLowerCase().includes(query)
    );
  });

  const filteredTaskHistory = taskHistory.filter((task) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      task.staff?.full_name?.toLowerCase().includes(query) ||
      task.order?.order_number?.toLowerCase().includes(query) ||
      task.order?.client_name?.toLowerCase().includes(query) ||
      task.task_type?.toLowerCase().includes(query)
    );
  });

  const getShiftDuration = (start: string, end?: string) => {
    const startTime = new Date(start);
    const endTime = end ? new Date(end) : new Date();
    const diff = endTime.getTime() - startTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTaskType = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const exportToCSV = () => {
    const csvData = filteredTaskHistory.map((task) => ({
      Date: new Date(task.completed_at).toLocaleDateString(),
      Time: new Date(task.completed_at).toLocaleTimeString(),
      Staff: task.staff?.full_name,
      Order: task.order?.order_number,
      Client: task.order?.client_name,
      Task: formatTaskType(task.task_type),
      Notes: task.notes || "",
    }));

    const csv = [
      Object.keys(csvData[0]).join(","),
      ...csvData.map((row) => Object.values(row).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kitchen-duty-tracking-${new Date().toISOString()}.csv`;
    a.click();
  };

  return (
    <ProtectedRoute allowedRoles={["admin", "owner"]}>
      <div className="flex min-h-screen bg-background">
        <AdminNav />
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <Clock className="h-8 w-8" />
                  Kitchen Duty Tracking
                </h1>
                <p className="text-muted-foreground mt-1">
                  Monitor staff duty shifts, task completions, and performance
                </p>
              </div>
              <Button onClick={exportToCSV} variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export Data
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Total Staff
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{staffMembers.length}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Total Shifts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{dutyHistory.length}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Tasks Completed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{taskHistory.length}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Avg Tasks/Shift
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">
                    {dutyHistory.length > 0
                      ? (taskHistory.length / dutyHistory.length).toFixed(1)
                      : "0"}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Staff Member</label>
                    <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Staff</SelectItem>
                        {staffMembers.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date Range</label>
                    <Select value={dateRange} onValueChange={setDateRange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Last 24 hours</SelectItem>
                        <SelectItem value="7">Last 7 days</SelectItem>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="90">Last 90 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, order..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {performanceSummary && selectedStaff !== "all" && (
              <Card>
                <CardHeader>
                  <CardTitle>Performance Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Shifts</p>
                      <p className="text-2xl font-bold">{performanceSummary.totalShifts}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Tasks Completed</p>
                      <p className="text-2xl font-bold">
                        {performanceSummary.totalTasksCompleted}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Shift Duration</p>
                      <p className="text-2xl font-bold">
                        {performanceSummary.averageShiftDuration.toFixed(1)}h
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Tasks per Shift</p>
                      <p className="text-2xl font-bold">
                        {performanceSummary.totalShifts > 0
                          ? (
                              performanceSummary.totalTasksCompleted /
                              performanceSummary.totalShifts
                            ).toFixed(1)
                          : "0"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Tabs defaultValue="shifts" className="space-y-4">
              <TabsList>
                <TabsTrigger value="shifts">Duty Shifts</TabsTrigger>
                <TabsTrigger value="tasks">Task Completions</TabsTrigger>
              </TabsList>

              <TabsContent value="shifts" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Duty Shift History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <p className="text-center py-8 text-muted-foreground">Loading...</p>
                    ) : filteredDutyHistory.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground">
                        No duty shifts found
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {filteredDutyHistory.map((shift) => (
                          <div
                            key={shift.id}
                            className="flex items-start gap-4 p-4 border rounded-lg"
                          >
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={shift.staff?.avatar_url} />
                              <AvatarFallback>
                                {getInitials(shift.staff?.full_name || "?")}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold">{shift.staff?.full_name}</p>
                                {shift.is_active ? (
                                  <Badge variant="default" className="bg-green-500">
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">Completed</Badge>
                                )}
                              </div>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4" />
                                  Started: {new Date(shift.shift_start).toLocaleString()}
                                </div>
                                {shift.shift_end && (
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    Ended: {new Date(shift.shift_end).toLocaleString()}
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4" />
                                  Duration: {getShiftDuration(shift.shift_start, shift.shift_end)}
                                </div>
                                {shift.order && (
                                  <p>
                                    Order: #{shift.order.order_number} - {shift.order.client_name}
                                  </p>
                                )}
                                {shift.notes && <p className="italic">Notes: {shift.notes}</p>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="tasks" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Task Completion History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <p className="text-center py-8 text-muted-foreground">Loading...</p>
                    ) : filteredTaskHistory.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground">
                        No task completions found
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {filteredTaskHistory.map((task) => (
                          <div
                            key={task.id}
                            className="flex items-start gap-4 p-4 border rounded-lg"
                          >
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={task.staff?.avatar_url} />
                              <AvatarFallback>
                                {getInitials(task.staff?.full_name || "?")}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold">{task.staff?.full_name}</p>
                                <Badge>{formatTaskType(task.task_type)}</Badge>
                              </div>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                  Completed: {new Date(task.completed_at).toLocaleString()}
                                </div>
                                {task.order && (
                                  <p>
                                    Order: #{task.order.order_number} - {task.order.client_name}
                                  </p>
                                )}
                                {task.task_description && <p>{task.task_description}</p>}
                                {task.notes && <p className="italic">Notes: {task.notes}</p>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
