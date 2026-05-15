import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, ClipboardCheck, Droplets, AlertTriangle, Users, Activity, CheckCircle, Truck, Clock, Package } from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { CleaningDutyWidget } from "@/components/cleaning/CleaningDutyWidget";
import { CleaningJobsQueue } from "@/components/cleaning/CleaningJobsQueue";
import { KitchenStaffTileBoard } from "@/components/kitchen/KitchenStaffTileBoard";
import { EquipmentVerificationPanel } from "@/components/cleaning/EquipmentVerificationPanel";
import { CleaningWorkflowTracker } from "@/components/cleaning/CleaningWorkflowTracker";
import { BrokenEquipmentDashboard } from "@/components/cleaning/BrokenEquipmentDashboard";
import { unitsInActiveCleaning } from "@/services/cleaningJobsService";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { DynamicNav } from "@/components/DynamicNav";
import { TeamWelcomeBanner } from "@/components/portal/TeamWelcomeBanner";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { ProtectedRoute } from "@/components/ProtectedRoute";

type EquipmentStatus = "available" | "in_use" | "cleaning" | "damaged";

interface EquipmentRow {
  id: string;
  name: string;
  status: EquipmentStatus;
  quantity: number;
  available_quantity: number;
}

function CleaningDashboardInner() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("verification");
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [loadingEquipment, setLoadingEquipment] = useState(true);

  useEffect(() => {
    if (!user?.company_id) return;

    const loadEquipment = async () => {
      setLoadingEquipment(true);
      const { data: equipmentData, error: equipmentErr } = await supabase
        .from("equipment")
        .select("id, name, condition, quantity, available_quantity")
        .eq("company_id", user.company_id);

      if (equipmentErr) {
        console.error("Error loading equipment:", equipmentErr);
        setEquipment([]);
        setLoadingEquipment(false);
        return;
      }

      // Wave 41 Phase 2: cleaning_jobs is now the source of truth
      // for "what's currently being cleaned" (units, not just a
      // boolean flag on the equipment). Falls back gracefully if
      // the company hasn't started using cleaning_jobs yet -- the
      // map will simply be empty.
      const cleaningUnitsMap = await unitsInActiveCleaning(supabase as any, user.company_id);

      const rows: EquipmentRow[] = (equipmentData || []).map((eq: any) => {
        const inCleaning = cleaningUnitsMap.get(eq.id) || 0;
        // Subtract active-cleaning units from nominal availability
        // so the operator sees what's truly available right now.
        const trueAvailable = Math.max(0, (eq.available_quantity ?? 0) - inCleaning);
        let status: EquipmentStatus;
        if (eq.condition === "damaged" || eq.condition === "broken") {
          status = "damaged";
        } else if (inCleaning > 0) {
          status = "cleaning";
        } else if (trueAvailable < (eq.quantity ?? 0)) {
          status = "in_use";
        } else {
          status = "available";
        }
        return {
          id: eq.id,
          name: eq.name,
          status,
          quantity: eq.quantity ?? 0,
          available_quantity: trueAvailable,
        };
      });

      setEquipment(rows);
      setLoadingEquipment(false);
    };

    loadEquipment();
  }, [user?.company_id]);

  return (
    <>
      <Head>
        <title>Cleaning Dashboard - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <DynamicNav userRole={UserRole.CLEANING_STAFF} />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-cyan-50 py-8 lg:pl-72 xl:pl-80">
        <div className="max-w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Cleaning Dashboard</h1>
              <p className="text-slate-600">Equipment maintenance and tracking</p>
            </div>
          </div>

          <TeamWelcomeBanner role="cleaning" userId={user?.id} />

          {/* Wave 39: live duty + clock-in surface. Component existed
              but was imported and never rendered. Wave 39 also fixed
              4 stacked bugs in the widget itself (company_id scoped
              wrong, missing schema columns added via migration). */}
          <CleaningDutyWidget />

          {/* Wave 41 Phase 2: equipment-availability ledger. Lists
              every active cleaning_jobs row with method chip + ETA
              back into inventory + start/complete actions. Operator
              also gets a "New job" button to log fresh batches. */}
          <CleaningJobsQueue />

          <Card className="border-0 shadow-lg mb-8 bg-gradient-to-r from-cyan-50 to-blue-50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-600" />
                Equipment Status Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-white rounded-lg">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    {equipment.filter(e => e.status === 'available').length}
                  </p>
                  <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                    Available
                    <InfoTooltip content="Equipment that's clean, in good condition, and ready to send out on the next event." />
                  </p>
                </div>
                
                <div className="text-center p-4 bg-white rounded-lg">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-2">
                    <Truck className="w-6 h-6 text-blue-600" />
                  </div>
                  <p className="text-2xl font-bold text-blue-600">
                    {equipment.filter(e => e.status === 'in_use').length}
                  </p>
                  <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                    In Use
                    <InfoTooltip content="Equipment that's currently out on a job.\n\nIt comes back here once dispatch logs the collection." />
                  </p>
                </div>
                
                <div className="text-center p-4 bg-white rounded-lg">
                  <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-2">
                    <Clock className="w-6 h-6 text-orange-600" />
                  </div>
                  <p className="text-2xl font-bold text-orange-600">
                    {equipment.filter(e => e.status === 'cleaning').length}
                  </p>
                  <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                    Cleaning
                    <InfoTooltip content="Items that came back from a job and are sitting in the cleaning queue.\n\nTick each one off as you finish it." />
                  </p>
                </div>
                
                <div className="text-center p-4 bg-white rounded-lg">
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-2">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                  </div>
                  <p className="text-2xl font-bold text-red-600">
                    {equipment.filter(e => e.status === 'damaged').length}
                  </p>
                  <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                    Damaged
                    <InfoTooltip content="Equipment flagged as damaged or broken.\n\nIt's out of rotation until someone repairs or replaces it." />
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg mb-8">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-cyan-600" />
                Today's Priority Inspections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {loadingEquipment ? (
                  <div className="text-center py-8 text-slate-500">Loading equipment...</div>
                ) : (
                  <>
                    {equipment
                      .filter(e => e.status === 'cleaning' || e.status === 'damaged')
                      .slice(0, 5)
                      .map(item => (
                        <div key={item.id} className="flex items-center justify-between p-3 bg-cyan-50 rounded-lg border-l-4 border-cyan-500">
                          <div className="flex items-center gap-3">
                            <Package className="w-5 h-5 text-cyan-600" />
                            <div>
                              <p className="font-semibold text-slate-900">{item.name}</p>
                              <p className="text-xs text-slate-600">
                                {item.available_quantity} of {item.quantity} available
                              </p>
                            </div>
                          </div>
                          <Button size="sm" variant="outline">
                            Inspect
                          </Button>
                        </div>
                      ))}
                    {equipment.filter(e => e.status === 'cleaning' || e.status === 'damaged').length === 0 && (
                      <div className="text-center py-8 text-slate-500">
                        <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                        <p>All equipment inspections complete for today!</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 gap-2 bg-white/50 p-1 rounded-lg">
              <TabsTrigger 
                value="verification" 
                className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <ClipboardCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Equipment Verification</span>
                <span className="sm:hidden">Verify</span>
              </TabsTrigger>
              <TabsTrigger 
                value="workflow" 
                className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <Droplets className="h-4 w-4" />
                <span className="hidden sm:inline">Cleaning Workflow</span>
                <span className="sm:hidden">Workflow</span>
              </TabsTrigger>
              <TabsTrigger 
                value="damages" 
                className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <AlertTriangle className="h-4 w-4" />
                <span className="hidden sm:inline">Damages & Losses</span>
                <span className="sm:hidden">Damages</span>
              </TabsTrigger>
              <TabsTrigger 
                value="team" 
                className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Team Status</span>
                <span className="sm:hidden">Team</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="verification" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50">
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-blue-600" />
                    Equipment Verification
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Verify returned equipment from functions and report any damages or losses
                  </p>
                </CardHeader>
                <CardContent className="pt-6">
                  <EquipmentVerificationPanel />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="workflow" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50">
                  <CardTitle className="flex items-center gap-2">
                    <Droplets className="h-5 w-5 text-purple-600" />
                    Cleaning Workflow Tracker
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Track equipment through the cleaning pipeline: Return → Cleaning → Drying → Ready
                  </p>
                </CardHeader>
                <CardContent className="pt-6">
                  <CleaningWorkflowTracker />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="damages" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    Equipment Damages & Losses
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Track broken, lost, or damaged equipment with cost breakdown and analysis
                  </p>
                </CardHeader>
                <CardContent className="pt-6">
                  <BrokenEquipmentDashboard />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="team" className="space-y-6">
              {/* Cleaning duty board -- same tile-board the kitchen
                  uses, scoped to the cleaning department. Manager
                  taps each cleaner's tile to clock them in / out;
                  staff don't need their own logins. Cross-over staff
                  (kitchen + cleaning) appear on both boards because
                  their departments[] array contains both. */}
              <KitchenStaffTileBoard department="cleaning" />
            </TabsContent>
          </Tabs>

          <Card className="mt-6 border-0 shadow-lg bg-gradient-to-r from-pink-50 via-purple-50 to-blue-50">
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-white">
                    <ClipboardCheck className="h-3 w-3 mr-1" />
                    Verification
                  </Badge>
                  <span className="text-muted-foreground">Check returned equipment</span>
                </div>
                <div className="hidden sm:block h-4 w-px bg-slate-300" />
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-white">
                    <Droplets className="h-3 w-3 mr-1" />
                    Workflow
                  </Badge>
                  <span className="text-muted-foreground">Track cleaning progress</span>
                </div>
                <div className="hidden sm:block h-4 w-px bg-slate-300" />
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-white">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Damages
                  </Badge>
                  <span className="text-muted-foreground">Monitor costs</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

      <ChatBot userRole="cleaning" companyId={user?.company_id} />
    </>
  );
}

/**
 * Wave 41 (CRITICAL FIX): wrap in ProtectedRoute. The page was
 * previously reachable by any authenticated user -- a kitchen_staff
 * (or driver, or anyone with a session) could hit
 * /team-portal/cleaning/dashboard and clock in as a cleaner via the
 * embedded CleaningDutyWidget. Restrict to cleaning + admin roles.
 */
/**
 * Wave 41 Phase 2 -- the dashboard now reads from cleaning_jobs
 * (the new equipment-availability ledger) for the "Cleaning" tile
 * and subtracts active-job units from "Available". Brings the
 * overview into line with what the new CleaningJobsQueue surface
 * shows the team.
 */
export default function CleaningDashboard() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.CLEANING_STAFF,
        UserRole.COMPANY_ADMIN,
        UserRole.ADMIN,
        UserRole.SUPER_ADMIN,
      ]}
    >
      <CleaningDashboardInner />
    </ProtectedRoute>
  );
}