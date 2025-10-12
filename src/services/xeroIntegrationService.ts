import { supabase } from "@/integrations/supabase/client";

export interface XeroConnection {
  tenantId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  connected: boolean;
}

export interface XeroInvoice {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  contact: {
    name: string;
    email: string;
  };
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    accountCode?: string;
  }>;
  total: number;
  status: "DRAFT" | "SUBMITTED" | "AUTHORISED" | "PAID";
}

export const xeroIntegrationService = {
  async connectXero(authCode: string): Promise<XeroConnection> {
    try {
      const response = await fetch("/api/integrations/xero/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authCode })
      });

      if (!response.ok) {
        throw new Error("Failed to connect to Xero");
      }

      const connection = await response.json();

      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) throw new Error("User not authenticated");

      await supabase
        .from("integrations")
        .upsert({
          user_id: user.user.id,
          integration_type: "xero",
          credentials: {
            tenantId: connection.tenantId,
            accessToken: connection.accessToken,
            refreshToken: connection.refreshToken,
            expiresAt: connection.expiresAt
          },
          is_active: true,
          connected_at: new Date().toISOString()
        });

      return connection;
    } catch (error) {
      console.error("Error connecting to Xero:", error);
      throw error;
    }
  },

  async disconnectXero(): Promise<void> {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) throw new Error("User not authenticated");

    await supabase
      .from("integrations")
      .update({ is_active: false, disconnected_at: new Date().toISOString() })
      .eq("user_id", user.user.id)
      .eq("integration_type", "xero");
  },

  async syncInvoiceToXero(orderId: string): Promise<boolean> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) throw new Error("User not authenticated");

      const { data: integration } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.user.id)
        .eq("integration_type", "xero")
        .eq("is_active", true)
        .single();

      if (!integration) {
        throw new Error("Xero integration not connected");
      }

      const { data: order } = await supabase
        .from("orders")
        .select(`
          *,
          profiles:client_id (full_name, email, company_name)
        `)
        .eq("id", orderId)
        .single();

      if (!order) {
        throw new Error("Order not found");
      }

      const profile = Array.isArray((order as any).profiles)
        ? (order as any).profiles[0]
        : (order as any).profiles;

      const items = [...((order as any).menu_items || []), ...((order as any).equipment_items || [])];
      const lineItems = items.map((item: any) => ({
        description: item.name || item.description || "Item",
        quantity: item.quantity || 1,
        unitAmount: item.pricePerPerson || item.rentalPrice || 0,
        accountCode: "200"
      }));

      const xeroInvoice: XeroInvoice = {
        invoiceNumber: `INV-${order.id.substring(0, 8).toUpperCase()}`,
        date: new Date().toISOString().split("T")[0],
        dueDate: order.event_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        contact: {
          name: profile?.company_name || profile?.full_name || "Customer",
          email: profile?.email || "customer@example.com"
        },
        lineItems,
        total: lineItems.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0),
        status: "AUTHORISED"
      };

      const response = await fetch("/api/integrations/xero/sync-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice: xeroInvoice,
          credentials: integration.credentials
        })
      });

      if (!response.ok) {
        throw new Error("Failed to sync invoice to Xero");
      }

      const result = await response.json();

      await supabase
        .from("orders")
        .update({
          xero_invoice_id: result.invoiceId,
          xero_synced_at: new Date().toISOString()
        })
        .eq("id", orderId);

      return true;
    } catch (error) {
      console.error("Error syncing invoice to Xero:", error);
      return false;
    }
  },

  async syncExpenseToXero(expenseData: {
    description: string;
    amount: number;
    date: string;
    supplier: string;
    accountCode?: string;
  }): Promise<boolean> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) throw new Error("User not authenticated");

      const { data: integration } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.user.id)
        .eq("integration_type", "xero")
        .eq("is_active", true)
        .single();

      if (!integration) {
        throw new Error("Xero integration not connected");
      }

      const response = await fetch("/api/integrations/xero/sync-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense: expenseData,
          credentials: integration.credentials
        })
      });

      return response.ok;
    } catch (error) {
      console.error("Error syncing expense to Xero:", error);
      return false;
    }
  },

  async getXeroConnection(): Promise<XeroConnection | null> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) return null;

      const { data: integration } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.user.id)
        .eq("integration_type", "xero")
        .eq("is_active", true)
        .single();

      if (!integration) return null;

      return {
        tenantId: integration.credentials.tenantId,
        accessToken: integration.credentials.accessToken,
        refreshToken: integration.credentials.refreshToken,
        expiresAt: new Date(integration.credentials.expiresAt),
        connected: integration.is_active
      };
    } catch (error) {
      console.error("Error getting Xero connection:", error);
      return null;
    }
  }
};