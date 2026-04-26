import { useState, useEffect } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Mail, 
  Clock, 
  CheckCircle, 
  XCircle, 
  TrendingUp, 
  Calendar,
  AlertCircle,
  RefreshCw,
  Eye
} from "lucide-react";
import {
  getEmailQueues,
  getEmailStatistics,
  getUpcomingEmails,
  processEmailQueue,
  type AfterSalesEmailQueue,
  type ScheduledEmail
} from "@/lib/afterSalesAutomation";
import { defaultAfterSalesTemplates } from "@/lib/afterSalesTemplates";
import { Footer } from "@/components/Footer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute"; // Assuming this is where the component is imported
import {  UserRole  } from "@/types/app"; // Assuming this is where UserRole is imported

export default function ProtectedEmailAutomationDashboard() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <EmailAutomationDashboard />
    </ProtectedRoute>
  );
}

function EmailAutomationDashboard() {
  const [queues, setQueues] = useState<AfterSalesEmailQueue[]>([]);
  const [statistics, setStatistics] = useState({
    totalScheduled: 0,
    totalSent: 0,
    totalPending: 0,
    totalFailed: 0,
    totalCancelled: 0,
    successRate: 0,
  });
  const [upcomingEmails, setUpcomingEmails] = useState<ScheduledEmail[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastProcessed, setLastProcessed] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const emailQueues = getEmailQueues();
    const stats = getEmailStatistics(emailQueues);
    const upcoming = getUpcomingEmails(emailQueues, 30);

    setQueues(emailQueues);
    setStatistics(stats);
    setUpcomingEmails(upcoming);
  };

  const handleProcessQueue = async () => {
    setIsProcessing(true);
    const result = await processEmailQueue(queues);
    setLastProcessed(new Date().toLocaleString());
    setIsProcessing(false);
    loadData();
  };

  const getTemplateInfo = (templateId: string) => {
    return defaultAfterSalesTemplates.find(t => t.id === templateId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "sent":
        return "bg-green-100 text-green-700 border-green-200";
      case "pending":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "failed":
        return "bg-red-100 text-red-700 border-red-200";
      case "cancelled":
        return "bg-slate-100 text-slate-700 border-slate-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sent":
        return <CheckCircle className="h-4 w-4" />;
      case "pending":
        return <Clock className="h-4 w-4" />;
      case "failed":
        return <XCircle className="h-4 w-4" />;
      case "cancelled":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Mail className="h-4 w-4" />;
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Email Automation Dashboard | Catering Platform</title>
      </Head>

      <AdminNav />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 lg:pl-64">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <Button
              variant="outline"
              onClick={() => window.history.back()}
              className="mb-4"
            >
              ← Back
            </Button>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                  Email Automation Dashboard
                </h1>
                <p className="text-slate-600">
                  Monitor and manage your after-sales email sequences
                </p>
              </div>
              <Button
                onClick={handleProcessQueue}
                disabled={isProcessing}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isProcessing ? "animate-spin" : ""}`} />
                {isProcessing ? "Processing..." : "Process Queue"}
              </Button>
            </div>
            {lastProcessed && (
              <p className="text-sm text-slate-500 mt-2">
                Last processed: {lastProcessed}
              </p>
            )}
          </div>

          <div className="grid md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Total Scheduled
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-700">{statistics.totalScheduled}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Sent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{statistics.totalSent}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">{statistics.totalPending}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Success Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-indigo-600">
                  {statistics.successRate.toFixed(1)}%
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="upcoming" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upcoming">Upcoming Emails</TabsTrigger>
              <TabsTrigger value="all-queues">All Queues</TabsTrigger>
              <TabsTrigger value="statistics">Statistics</TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Next 30 Days
                  </CardTitle>
                  <CardDescription>
                    Emails scheduled to be sent in the next month
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {upcomingEmails.length === 0 ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        No emails scheduled for the next 30 days.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-3">
                      {upcomingEmails.map((email) => {
                        const template = getTemplateInfo(email.templateId);
                        return (
                          <div
                            key={email.id}
                            className="flex items-center gap-4 p-4 border rounded-lg bg-white hover:shadow-md transition-shadow"
                          >
                            <div className="flex-shrink-0">
                              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                                <Mail className="h-6 w-6 text-blue-600" />
                              </div>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold">
                                  {email.clientName} - {email.eventType}
                                </h3>
                                <Badge variant="outline" className="text-xs">
                                  Email {template?.sequence}
                                </Badge>
                              </div>
                              <p className="text-sm text-slate-600 mb-1">{template?.subject}</p>
                              <div className="flex items-center gap-4 text-xs text-slate-500">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(email.scheduledDate).toLocaleDateString()}
                                </span>
                                <span>{email.clientEmail}</span>
                              </div>
                            </div>
                            <Badge className={getStatusColor(email.status)}>
                              {email.status}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="all-queues">
              <Card>
                <CardHeader>
                  <CardTitle>All Email Queues</CardTitle>
                  <CardDescription>
                    Complete overview of all scheduled email sequences
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {queues.length === 0 ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        No email queues found. Queues are automatically created when events are completed.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-6">
                      {queues.map((queue) => (
                        <div key={queue.orderId} className="border rounded-lg p-4 bg-white">
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="font-semibold text-lg">
                                {queue.clientName} - {queue.eventType}
                              </h3>
                              <Badge variant="outline">{queue.orderId}</Badge>
                            </div>
                            <p className="text-sm text-slate-600">
                              Event Date: {new Date(queue.eventDate).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="space-y-2">
                            {queue.scheduledEmails.map((email) => {
                              const template = getTemplateInfo(email.templateId);
                              return (
                                <div
                                  key={email.id}
                                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                                >
                                  <div className="flex-shrink-0">
                                    {getStatusIcon(email.status)}
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium">
                                      Email {template?.sequence}: {template?.subject.substring(0, 50)}...
                                    </p>
                                    <p className="text-xs text-slate-600">
                                      Scheduled: {new Date(email.scheduledDate).toLocaleDateString()}
                                      {email.sentDate && ` | Sent: ${new Date(email.sentDate).toLocaleDateString()}`}
                                    </p>
                                  </div>
                                  <Badge className={getStatusColor(email.status)}>
                                    {email.status}
                                  </Badge>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="statistics">
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Status Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <span className="font-medium">Sent</span>
                        </div>
                        <span className="text-2xl font-bold text-green-600">
                          {statistics.totalSent}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Clock className="h-5 w-5 text-blue-600" />
                          <span className="font-medium">Pending</span>
                        </div>
                        <span className="text-2xl font-bold text-blue-600">
                          {statistics.totalPending}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-5 w-5 text-red-600" />
                          <span className="font-medium">Failed</span>
                        </div>
                        <span className="text-2xl font-bold text-red-600">
                          {statistics.totalFailed}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-5 w-5 text-slate-600" />
                          <span className="font-medium">Cancelled</span>
                        </div>
                        <span className="text-2xl font-bold text-slate-600">
                          {statistics.totalCancelled}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Performance Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Success Rate</span>
                          <span className="text-sm text-slate-600">
                            {statistics.successRate.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-3">
                          <div
                            className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all"
                            style={{ width: `${statistics.successRate}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Completion Rate</span>
                          <span className="text-sm text-slate-600">
                            {statistics.totalScheduled > 0
                              ? (((statistics.totalSent + statistics.totalFailed) / statistics.totalScheduled) * 100).toFixed(1)
                              : 0}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-3">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all"
                            style={{
                              width: `${
                                statistics.totalScheduled > 0
                                  ? ((statistics.totalSent + statistics.totalFailed) / statistics.totalScheduled) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="pt-4 border-t">
                        <div className="grid grid-cols-2 gap-4 text-center">
                          <div>
                            <div className="text-2xl font-bold text-slate-700">
                              {queues.length}
                            </div>
                            <div className="text-xs text-slate-600">Active Queues</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-slate-700">
                              {statistics.totalScheduled > 0
                                ? (statistics.totalScheduled / queues.length).toFixed(1)
                                : 0}
                            </div>
                            <div className="text-xs text-slate-600">Avg Emails/Queue</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <Footer />
      </div>
    </>
  );
}