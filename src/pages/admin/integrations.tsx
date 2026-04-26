import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  ExternalLink,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  getAuthorizationUrl,
  disconnectAccountingIntegration,
  getIntegrationStatus,
} from "@/services/accountingIntegrationService";

export default function ProtectedIntegrationsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <IntegrationsPage />
    </ProtectedRoute>
  );
}

function IntegrationsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [xeroStatus, setXeroStatus] = useState<any>(null);
  const [qbStatus, setQbStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const companyId = profile?.company_id || "";

  useEffect(() => {
    if (companyId) {
      loadIntegrationStatus();
    }
  }, [companyId]);

  useEffect(() => {
    // Handle OAuth callback redirects
    const { success, error } = router.query;
    
    if (success) {
      const provider = success === "xero_connected" ? "Xero" : "QuickBooks";
      toast({
        title: `✅ ${provider} Connected`,
        description: `Successfully connected to ${provider}. You can now sync invoices.`,
      });
      // Clean URL
      router.replace("/admin/integrations", undefined, { shallow: true });
      loadIntegrationStatus();
    }

    if (error) {
      toast({
        title: "Connection Failed",
        description: error as string,
        variant: "destructive",
      });
      // Clean URL
      router.replace("/admin/integrations", undefined, { shallow: true });
    }
  }, [router.query]);

  async function loadIntegrationStatus() {
    try {
      setLoading(true);
      const [xero, qb] = await Promise.all([
        getIntegrationStatus(companyId, "xero"),
        getIntegrationStatus(companyId, "quickbooks"),
      ]);
      setXeroStatus(xero);
      setQbStatus(qb);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(provider: "xero" | "quickbooks") {
    try {
      // Set cookie for callback
      document.cookie = `oauth_company_id=${companyId}; path=/; max-age=600`; // 10 minutes
      
      const authUrl = getAuthorizationUrl(provider, companyId);
      window.location.href = authUrl;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  async function handleDisconnect(provider: "xero" | "quickbooks") {
    try {
      setDisconnecting(provider);
      
      const result = await disconnectAccountingIntegration(companyId, provider);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      toast({
        title: "Disconnected",
        description: `${provider === "xero" ? "Xero" : "QuickBooks"} has been disconnected`,
      });

      loadIntegrationStatus();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDisconnecting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Accounting Integrations</h1>
        <p className="text-muted-foreground mt-2">
          Connect your accounting system to automatically sync invoices and payments
        </p>
      </div>

      <Alert className="mb-8">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Note:</strong> Connecting an accounting system will automatically sync all new paid invoices. 
          Existing invoices can be synced manually from the Invoices page.
        </AlertDescription>
      </Alert>

      <div className="space-y-6">
        {/* Xero Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-3">
                  <img 
                    src="https://www.xero.com/content/dam/xero/pilot-images/logos/xero-logo.svg" 
                    alt="Xero"
                    className="h-8"
                  />
                  Xero
                  {xeroStatus?.connected && (
                    <Badge variant="default" className="ml-2">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-2">
                  {xeroStatus?.connected 
                    ? `Connected to ${xeroStatus.tenantName || "your organization"}` 
                    : "Cloud-based accounting software for small businesses"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {xeroStatus?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div>
                    <div className="font-medium text-green-900 dark:text-green-100">
                      ✅ Integration Active
                    </div>
                    {xeroStatus.lastSync && (
                      <div className="text-sm text-green-700 dark:text-green-300 mt-1">
                        Last synced: {new Date(xeroStatus.lastSync).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisconnect("xero")}
                    disabled={disconnecting === "xero"}
                  >
                    {disconnecting === "xero" ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Disconnecting...
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-2" />
                        Disconnect
                      </>
                    )}
                  </Button>
                </div>

                <div className="text-sm text-muted-foreground">
                  <strong>What syncs automatically:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Invoices when marked as paid</li>
                    <li>Client/customer information</li>
                    <li>Payment records</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect Xero to automatically sync your invoices, payments, and clients. 
                  All data is securely transferred using OAuth 2.0.
                </p>
                <Button onClick={() => handleConnect("xero")}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Connect Xero Account
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* QuickBooks Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-3">
                  <img 
                    src="https://static.intuit.com/content/dam/intuit/brand/logos/intuit/quickbooks/qbo-lockup-color.svg" 
                    alt="QuickBooks"
                    className="h-8"
                  />
                  QuickBooks Online
                  {qbStatus?.connected && (
                    <Badge variant="default" className="ml-2">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-2">
                  {qbStatus?.connected 
                    ? `Connected to ${qbStatus.tenantName || "your company"}` 
                    : "Popular accounting software for small to medium businesses"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {qbStatus?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div>
                    <div className="font-medium text-green-900 dark:text-green-100">
                      ✅ Integration Active
                    </div>
                    {qbStatus.lastSync && (
                      <div className="text-sm text-green-700 dark:text-green-300 mt-1">
                        Last synced: {new Date(qbStatus.lastSync).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisconnect("quickbooks")}
                    disabled={disconnecting === "quickbooks"}
                  >
                    {disconnecting === "quickbooks" ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Disconnecting...
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-2" />
                        Disconnect
                      </>
                    )}
                  </Button>
                </div>

                <div className="text-sm text-muted-foreground">
                  <strong>What syncs automatically:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Invoices when marked as paid</li>
                    <li>Customer information</li>
                    <li>Payment records</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect QuickBooks Online to automatically sync your invoices, payments, and customers. 
                  All data is securely transferred using OAuth 2.0.
                </p>
                <Button onClick={() => handleConnect("quickbooks")}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Connect QuickBooks Account
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Setup Instructions */}
        {!xeroStatus?.connected && !qbStatus?.connected && (
          <Card>
            <CardHeader>
              <CardTitle>📋 Setup Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Before Connecting:</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Make sure you have admin access to your Xero or QuickBooks account</li>
                  <li>Verify your accounting chart of accounts is set up</li>
                  <li>Ensure you have a default sales account configured</li>
                  <li>Have your tax rates configured (e.g., 15% VAT for South Africa)</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold mb-2">What Happens When You Connect:</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>You'll be redirected to Xero/QuickBooks to authorize access</li>
                  <li>We'll securely store your authorization token (encrypted)</li>
                  <li>New paid invoices will automatically sync</li>
                  <li>You can manually sync existing invoices from the Invoices page</li>
                </ol>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Important:</strong> You can only connect one accounting system at a time. 
                  If you switch systems, you'll need to disconnect the current one first.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}