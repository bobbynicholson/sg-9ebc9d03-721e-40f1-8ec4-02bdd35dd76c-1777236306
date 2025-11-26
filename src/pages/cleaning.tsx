import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ClipboardCheck, Droplets, AlertTriangle, Users } from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { CleaningDutyWidget } from "@/components/cleaning/CleaningDutyWidget";
import { EquipmentVerificationPanel } from "@/components/cleaning/EquipmentVerificationPanel";
import { CleaningWorkflowTracker } from "@/components/cleaning/CleaningWorkflowTracker";
import { BrokenEquipmentDashboard } from "@/components/cleaning/BrokenEquipmentDashboard";
import { useAuth } from "@/contexts/AuthContext";

export default function CleaningPage() {
  const [activeTab, setActiveTab] = useState("verification");
  const [tasks, setTasks] = useState<any[]>([]);

  return (
    <>
      <NoIndexMeta />
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50">
        <div className="container mx-auto px-4 py-6 md:py-8 lg:py-12 max-w-7xl">
          {/* Header Section */}
          <div className="mb-6 md:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center shadow-lg">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold text-slate-900">Cleaning Portal</h1>
                  <p className="text-sm md:text-base text-slate-600">
                    Equipment verification & cleaning workflow
                  </p>
                </div>
              </div>

              {/* Duty Widget - Quick Access */}
              <div className="sm:ml-auto">
                <CleaningDutyWidget />
              </div>
            </div>
          </div>

          {/* Main Content Tabs */}
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

            {/* Verification Tab */}
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

            {/* Workflow Tab */}
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

            {/* Damages Tab */}
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

            {/* Team Tab */}
            <TabsContent value="team" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-green-50 to-teal-50">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-green-600" />
                    Cleaning Team Status
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    View who is currently on duty and their cleaning assignments
                  </p>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Card className="bg-gradient-to-br from-green-50 to-emerald-50">
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-green-100 rounded-lg">
                              <Users className="h-6 w-6 text-green-600" />
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Currently On Duty</p>
                              <p className="text-2xl font-bold text-green-600">
                                {user?.full_name || "You"}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-blue-50 to-cyan-50">
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-100 rounded-lg">
                              <Droplets className="h-6 w-6 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Active Tasks</p>
                              <p className="text-2xl font-bold text-blue-600">--</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center py-8">
                          <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                          <p className="font-medium text-muted-foreground">Team tracking coming soon</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            View real-time team status and assignments
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Quick Stats Footer */}
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
    </>
  );
}
