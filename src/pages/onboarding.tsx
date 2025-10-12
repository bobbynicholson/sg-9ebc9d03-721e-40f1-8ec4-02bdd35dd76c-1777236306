import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { onboardingService, OnboardingProgress } from "@/services/onboardingService";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  CheckCircle, 
  Circle, 
  ArrowRight, 
  Upload, 
  Download,
  FileSpreadsheet,
  AlertCircle,
  Sparkles,
  ChevronRight,
  X
} from "lucide-react";

export default function OnboardingPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<any>(null);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      loadProgress();
    } else if (!authLoading && !user) {
      // If auth is done and there's no user, redirect to login
      router.push('/auth/login');
    }
  }, [user, authLoading, router]);

  const loadProgress = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const data = await onboardingService.getOnboardingProgress(user.id);
      setProgress(data);
      
      const currentIndex = data.steps.findIndex(s => s.id === data.currentStep);
      setCurrentStepIndex(currentIndex >= 0 ? currentIndex : 0);
    } catch (error) {
      console.error("Error loading onboarding progress:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNextStep = async () => {
    if (!progress || !user) return;
    
    const currentStep = progress.steps[currentStepIndex];
    await onboardingService.updateStepStatus(user.id, currentStep.id, true);
    
    if (currentStepIndex < progress.steps.length - 1) {
      const nextStep = progress.steps[currentStepIndex + 1];
      await onboardingService.setCurrentStep(user.id, nextStep.id);
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      router.push("/");
    }
    
    await loadProgress();
  };

  const handleSkipStep = async () => {
    if (!progress || !user) return;
    
    if (currentStepIndex < progress.steps.length - 1) {
      const nextStep = progress.steps[currentStepIndex + 1];
      await onboardingService.setCurrentStep(user.id, nextStep.id);
      setCurrentStepIndex(currentStepIndex + 1);
    }
    
    await loadProgress();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setCsvFile(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = onboardingService.parseCSV(text);
      setCsvData(parsed);
      
      if (parsed.length > 0) {
        const headers = Object.keys(parsed[0]);
        const detectedMapping = onboardingService.detectCSVColumns(headers);
        setMapping(detectedMapping);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!user || !csvData.length) return;
    
    const currentStep = progress?.steps[currentStepIndex];
    let result;
    
    switch (currentStep?.id) {
      case "import_clients":
        result = await onboardingService.importClients(csvData, mapping, user.id);
        break;
      case "import_bookings":
        result = await onboardingService.importBookings(csvData, mapping, user.id);
        break;
      case "import_team":
        result = await onboardingService.importTeamMembers(csvData, mapping, "driver", user.id);
        break;
      case "import_inventory":
        result = await onboardingService.importInventory(csvData, mapping, user.id);
        break;
      default:
        result = { success: true, imported: 0, failed: 0, skipped: 0, errors: [], warnings: [] };
    }
    
    setImportResult(result);
    setShowResults(true);
  };

  const downloadSampleCSV = (type: "clients" | "bookings" | "team" | "inventory" | "equipment") => {
    onboardingService.downloadSampleCSV(type);
  };

  if (authLoading || loading || !progress) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading your onboarding...</p>
        </div>
      </div>
    );
  }

  const currentStep = progress.steps[currentStepIndex];
  const isLastStep = currentStepIndex === progress.steps.length - 1;

  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Welcome to CateringMS - Get Started</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Sparkles className="w-8 h-8 text-purple-600" />
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Welcome to CateringMS
              </h1>
            </div>
            <p className="text-lg text-slate-600 mb-6">
              Let's get your catering business set up. This will only take about {progress.steps.reduce((sum, s) => sum + s.estimatedMinutes, 0)} minutes.
            </p>
            
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium text-slate-700">Overall Progress</span>
                <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                  {progress.progress}% Complete
                </Badge>
              </div>
              <Progress value={progress.progress} className="h-3" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
            <div className="lg:col-span-1 space-y-2">
              {progress.steps.map((step, index) => (
                <button
                  key={step.id}
                  onClick={() => setCurrentStepIndex(index)}
                  className={`w-full text-left p-3 rounded-lg transition-all ${
                    index === currentStepIndex
                      ? "bg-purple-100 border-2 border-purple-500 shadow-md"
                      : step.completed
                      ? "bg-green-50 border-2 border-green-200"
                      : "bg-white border-2 border-slate-200 hover:border-purple-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl flex-shrink-0">{step.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-medium truncate ${
                          index === currentStepIndex ? "text-purple-900" : "text-slate-700"
                        }`}>
                          {step.label}
                        </span>
                        {step.completed && (
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                        )}
                        {!step.completed && index === currentStepIndex && (
                          <Circle className="w-4 h-4 text-purple-500 flex-shrink-0" />
                        )}
                      </div>
                      <span className="text-xs text-slate-500">{step.estimatedMinutes} min</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="lg:col-span-3">
              <Card className="border-0 shadow-xl">
                <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">{currentStep.icon}</div>
                      <div>
                        <CardTitle className="text-2xl">{currentStep.label}</CardTitle>
                        <CardDescription className="text-base">{currentStep.description}</CardDescription>
                      </div>
                    </div>
                    {!currentStep.required && (
                      <Badge variant="outline" className="text-xs">Optional</Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-6">
                  {currentStep.id === "welcome" && (
                    <div className="space-y-6">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                        <h3 className="font-semibold text-lg mb-3 text-blue-900">What to Expect</h3>
                        <ul className="space-y-2 text-sm text-blue-800">
                          <li className="flex items-start gap-2">
                            <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                            <span>Import your existing client database with one CSV upload</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                            <span>Migrate scheduled events and confirmed bookings</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                            <span>Add your team members (kitchen staff, drivers, cleaning crew)</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                            <span>Import your menu items, inventory, and equipment</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                            <span>Connect your payment gateway for online bookings</span>
                          </li>
                        </ul>
                      </div>

                      <Alert>
                        <AlertCircle className="w-5 h-5" />
                        <AlertDescription>
                          <strong>Don't have data ready?</strong> No problem! You can skip optional steps and come back later. We will provide sample CSV templates to make imports easy.
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}

                  {(currentStep.id === "import_clients" || 
                    currentStep.id === "import_bookings" || 
                    currentStep.id === "import_team" || 
                    currentStep.id === "import_inventory") && (
                    <div className="space-y-6">
                      {!showResults ? (
                        <>
                          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                              <FileSpreadsheet className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <h4 className="font-semibold text-blue-900 mb-2">Need a Template?</h4>
                                <p className="text-sm text-blue-800 mb-3">
                                  Download our sample CSV with the exact format we need. You can use Excel or Google Sheets to fill it in.
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => downloadSampleCSV(currentStep.id.replace("import_", "") as any)}
                                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                                >
                                  <Download className="w-4 h-4 mr-2" />
                                  Download Sample CSV
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <Label className="text-base font-semibold">Upload Your CSV File</Label>
                            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-purple-500 transition-colors">
                              <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileUpload}
                                className="hidden"
                                id="csv-upload"
                              />
                              <label htmlFor="csv-upload" className="cursor-pointer">
                                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                                <p className="text-sm text-slate-600 mb-2">
                                  {csvFile ? csvFile.name : "Click to upload or drag and drop"}
                                </p>
                                <p className="text-xs text-slate-500">CSV files only</p>
                              </label>
                            </div>

                            {csvData.length > 0 && (
                              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium text-green-900">File loaded successfully</p>
                                    <p className="text-sm text-green-700">
                                      {csvData.length} records found
                                    </p>
                                  </div>
                                  <Button
                                    onClick={handleImport}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Import Data
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="space-y-4">
                          <div className={`border-2 rounded-lg p-6 ${
                            importResult.failed === 0 
                              ? "bg-green-50 border-green-200" 
                              : "bg-orange-50 border-orange-200"
                          }`}>
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="font-semibold text-lg">Import Results</h4>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setShowResults(false);
                                  setCsvFile(null);
                                  setCsvData([]);
                                  setImportResult(null);
                                }}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>

                            <div className="grid grid-cols-3 gap-4 mb-4">
                              <div className="text-center">
                                <p className="text-3xl font-bold text-green-600">{importResult.imported}</p>
                                <p className="text-sm text-slate-600">Imported</p>
                              </div>
                              <div className="text-center">
                                <p className="text-3xl font-bold text-red-600">{importResult.failed}</p>
                                <p className="text-sm text-slate-600">Failed</p>
                              </div>
                              <div className="text-center">
                                <p className="text-3xl font-bold text-yellow-600">{importResult.warnings.length}</p>
                                <p className="text-sm text-slate-600">Warnings</p>
                              </div>
                            </div>

                            {importResult.errors.length > 0 && (
                              <div className="bg-white rounded border border-red-200 p-4 max-h-48 overflow-y-auto">
                                <h5 className="font-medium text-red-900 mb-2">Errors:</h5>
                                {importResult.errors.map((error: any, idx: number) => (
                                  <p key={idx} className="text-sm text-red-700 mb-1">
                                    Row {error.row}: {error.error} ({error.field})
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>

                          {importResult.imported > 0 && (
                            <Alert className="bg-green-50 border-green-200">
                              <CheckCircle className="w-5 h-5 text-green-600" />
                              <AlertDescription className="text-green-800">
                                Successfully imported {importResult.imported} records! You can now proceed to the next step.
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {currentStep.id === "company_info" && (
                    <div className="space-y-4">
                      <Alert>
                        <AlertCircle className="w-5 h-5" />
                        <AlertDescription>
                          You can complete your company profile later in Settings. For now, let's get you set up quickly.
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}

                  {currentStep.id === "setup_payment" && (
                    <div className="space-y-4">
                      <Alert>
                        <AlertCircle className="w-5 h-5" />
                        <AlertDescription>
                          Payment gateway setup can be completed later in Admin Settings. You can skip this step for now.
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}

                  {currentStep.id === "final_review" && (
                    <div className="space-y-6">
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-6">
                        <h3 className="font-semibold text-lg mb-3 text-green-900 flex items-center gap-2">
                          <CheckCircle className="w-6 h-6" />
                          You're All Set!
                        </h3>
                        <p className="text-green-800 mb-4">
                          Your catering business is now set up on CateringMS. Here's what you can do next:
                        </p>
                        <ul className="space-y-2 text-sm text-green-800">
                          <li className="flex items-center gap-2">
                            <ChevronRight className="w-4 h-4" />
                            Create your first quote and send it to a client
                          </li>
                          <li className="flex items-center gap-2">
                            <ChevronRight className="w-4 h-4" />
                            Explore the kitchen, driver, and cleaning portals
                          </li>
                          <li className="flex items-center gap-2">
                            <ChevronRight className="w-4 h-4" />
                            Customize your email templates
                          </li>
                          <li className="flex items-center gap-2">
                            <ChevronRight className="w-4 h-4" />
                            Set up payment gateway for online bookings
                          </li>
                        </ul>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-between items-center mt-6">
                <div className="flex gap-2">
                  {!currentStep.required && currentStep.id !== "welcome" && currentStep.id !== "final_review" && (
                    <Button variant="outline" onClick={handleSkipStep}>
                      Skip This Step
                    </Button>
                  )}
                </div>
                
                <Button
                  onClick={handleNextStep}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90"
                  size="lg"
                >
                  {isLastStep ? "Launch Dashboard" : "Continue"}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
