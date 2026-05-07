import { useState, useEffect } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Clock, Users, TrendingUp, CheckCircle, DollarSign } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { timeClockService } from "@/services/timeClockService";
import { paymentLedgerService } from "@/services/paymentLedgerService";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {  UserRole  } from "@/types/app";
import { InfoTooltip } from "@/components/ui/info-tooltip";

export default function ProtectedStaffHoursPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <StaffHoursPage />
    </ProtectedRoute>
  );
}

function StaffHoursPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentData, setPaymentData] = useState({
    method: "cash" as "cash" | "bank_transfer" | "eft" | "other",
    reference: "",
    notes: "",
  });

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const startDate = new Date();
      
      if (period === "week") {
        startDate.setDate(now.getDate() - 7);
      } else {
        startDate.setMonth(now.getMonth() - 1);
      }

      const [sessionsData, ledgerData] = await Promise.all([
        timeClockService.getAllStaffWorkSessions(startDate, now, user?.company_id),
        paymentLedgerService.getAllPayments(startDate, now, user?.company_id),
      ]);

      setSessions(sessionsData);
      setLedger(ledgerData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const groupedSessions = sessions.reduce((acc, session) => {
    const staffId = session.staff_id;
    if (!acc[staffId]) {
      acc[staffId] = {
        staff: session.staff,
        sessions: [],
        totalHours: 0,
        totalEarnings: 0,
        unpaidSessions: [],
      };
    }
    acc[staffId].sessions.push(session);
    acc[staffId].totalHours += Number(session.total_hours || 0);
    acc[staffId].totalEarnings += Number(session.total_earnings || 0);
    if (session.payment_status === "unpaid") {
      acc[staffId].unpaidSessions.push(session);
    }
    return acc;
  }, {} as Record<string, any>);

  const handleProcessPayment = async (staffId: string, sessionIds: string[]) => {
    setLoading(true);
    try {
      await paymentLedgerService.processStaffPayment(
        staffId,
        sessionIds,
        paymentData.method,
        paymentData.reference,
        paymentData.notes
      );
      
      setPaymentDialog(false);
      setPaymentData({ method: "cash", reference: "", notes: "" });
      await loadData();
    } catch (error) {
      console.error("Error processing payment:", error);
      alert("Failed to process payment");
    } finally {
      setLoading(false);
    }
  };

  const summary = {
    totalStaff: Object.keys(groupedSessions).length,
    totalHours: Object.values(groupedSessions).reduce((sum: number, staff: any) => sum + staff.totalHours, 0),
    totalUnpaid: Object.values(groupedSessions).reduce((sum: number, staff: any) => {
      return sum + staff.unpaidSessions.reduce((s: number, session: any) => s + Number(session.total_earnings || 0), 0);
    }, 0),
    totalPaid: ledger.reduce((sum, payment) => sum + Number(payment.total_amount || 0), 0),
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Staff Hours Tracking | CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-screen-2xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Staff Hours</h1>
            <p className="text-muted-foreground">
              Working hours per staff member tracked against shifts and events. Drives the wages roll-up with overtime, Sunday, and public-holiday splits.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">Total Staff <InfoTooltip content={"Number of staff who clocked in at least once during this period."} /></CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.totalStaff}</div>
                <p className="text-xs text-muted-foreground">Active this {period}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">Total Hours <InfoTooltip content={"Total hours your team has clocked during this period."} /></CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Number(summary.totalHours || 0).toFixed(1)}h</div>
                <p className="text-xs text-muted-foreground">Worked this {period}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">Unpaid <InfoTooltip content={"What you still owe staff for shifts that have not yet been paid out."} /></CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">R {Number(summary.totalUnpaid || 0).toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">Pending payment</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">Paid Out <InfoTooltip content={"Total paid out to staff during this period."} /></CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">R {Number(summary.totalPaid || 0).toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">This {period}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-between mb-6">
            <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={loadData} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </Button>
          </div>

          <Tabs defaultValue="hours" className="space-y-6">
            <TabsList>
              <TabsTrigger value="hours">Staff Hours</TabsTrigger>
              <TabsTrigger value="ledger">Payment Ledger</TabsTrigger>
            </TabsList>

            <TabsContent value="hours" className="space-y-4">
              {Object.entries(groupedSessions).map(([staffId, data]: [string, any]) => (
                <Card key={staffId}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{data.staff?.full_name || "Unknown"}</CardTitle>
                        <CardDescription>
                          {data.staff?.role} • {data.staff?.email}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{Number(data.totalHours || 0).toFixed(1)}h</div>
                        <div className="text-sm text-muted-foreground">
                          R {Number(data.totalEarnings || 0).toFixed(2)} total
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {data.unpaidSessions.length > 0 && (
                      <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Unpaid Hours</span>
                          <span className="text-lg font-bold text-amber-600">
                            R {Number(data.unpaidSessions.reduce((sum: number, s: any) => sum + Number(s.total_earnings || 0), 0)).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>
                            {Number(data.unpaidSessions.reduce((sum: number, s: any) => sum + Number(s.total_hours || 0), 0)).toFixed(1)} hours
                          </span>
                          <Dialog open={paymentDialog && selectedStaff === staffId} onOpenChange={(open) => {
                            setPaymentDialog(open);
                            if (!open) setSelectedStaff(null);
                          }}>
                            <DialogTrigger asChild>
                              <Button size="sm" onClick={() => setSelectedStaff(staffId)}>
                                Process Payment
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Process Payment for {data.staff?.full_name}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="p-4 bg-muted rounded-lg">
                                  <div className="flex justify-between mb-2">
                                    <span>Total Hours:</span>
                                    <span className="font-bold">
                                      {Number(data.unpaidSessions.reduce((sum: number, s: any) => sum + Number(s.total_hours || 0), 0)).toFixed(1)}h
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Total Amount:</span>
                                    <span className="font-bold text-green-600">
                                      R {Number(data.unpaidSessions.reduce((sum: number, s: any) => sum + Number(s.total_earnings || 0), 0)).toFixed(2)}
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label>Payment Method</Label>
                                  <Select
                                    value={paymentData.method}
                                    onValueChange={(v: any) => setPaymentData({ ...paymentData, method: v })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="cash">Cash</SelectItem>
                                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                      <SelectItem value="eft">EFT</SelectItem>
                                      <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label>Reference (optional)</Label>
                                  <Input
                                    placeholder="Payment reference or transaction ID"
                                    value={paymentData.reference}
                                    onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>Notes (optional)</Label>
                                  <Textarea
                                    placeholder="Any additional notes about this payment"
                                    value={paymentData.notes}
                                    onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                                    rows={2}
                                  />
                                </div>

                                <Button
                                  onClick={() => handleProcessPayment(staffId, data.unpaidSessions.map((s: any) => s.id))}
                                  disabled={loading}
                                  className="w-full"
                                >
                                  {loading ? "Processing..." : "Confirm Payment"}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="text-sm font-medium mb-2">Recent Sessions</div>
                      {data.sessions.slice(0, 5).map((session: any) => (
                        <div key={session.id} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span>{new Date(session.clock_in_time).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span>{Number(session.total_hours || 0).toFixed(1)}h</span>
                            <span className="font-medium">R {Number(session.total_earnings || 0).toFixed(2)}</span>
                            <Badge variant={session.payment_status === "paid" ? "default" : "secondary"}>
                              {session.payment_status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="ledger" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5">Payment History <InfoTooltip content={"Every staff payment in this period, including the method, hours covered and rate paid."} /></CardTitle>
                  <CardDescription>
                    Complete record of all staff payments
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {ledger.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{payment.staff?.full_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(payment.payment_period_start).toLocaleDateString()} - {new Date(payment.payment_period_end).toLocaleDateString()}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {Number(payment.total_hours).toFixed(1)} hours @ R{Number(payment.hourly_rate).toFixed(2)}/hr
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-600">
                            R {Number(payment.total_amount).toFixed(2)}
                          </div>
                          <div className="text-sm text-muted-foreground capitalize">
                            {payment.payment_method.replace("_", " ")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(payment.payment_date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                    {ledger.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No payments recorded for this period</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card className="mt-8 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800">
            <CardHeader>
              <CardTitle className="text-blue-900 dark:text-blue-100">
                Looking for Full HR Management?
              </CardTitle>
              <CardDescription className="text-blue-700 dark:text-blue-300">
                CateringMS is not an HR solution. For comprehensive HR management, check out these specialized tools:
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <a href="/hr-solutions" target="_blank">
                  View HR Solutions →
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    </>
  );
}