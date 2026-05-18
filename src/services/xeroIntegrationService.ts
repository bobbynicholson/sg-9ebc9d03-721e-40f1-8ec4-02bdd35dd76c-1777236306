/* eslint-disable @typescript-eslint/no-explicit-any */
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
      .update({ is_active: false, disconnected_at: new Date().toISOString() } as any)
      .eq("user_id", user.user.id)
      .eq("integration_type", "xero");
  },

  async syncInvoiceToXero(orderId: string): Promise<boolean> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) throw new Error("User not authenticated");

      const { data: integration, error: integrationErr } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.user.id)
        .eq("integration_type", "xero")
        .eq("is_active", true)
        .single();
      if (integrationErr && (integrationErr as any).code !== "PGRST116") console.error("[xeroIntegrationService/syncInvoiceToXero] integrations lookup failed:", integrationErr);

      if (!integration) {
        throw new Error("Xero integration not connected");
      }

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select(`
          *,
          profiles:client_id (full_name, email, company_name)
        `)
        .eq("id", orderId)
        .single();
      if (orderErr) console.error("[xeroIntegrationService/syncInvoiceToXero] orders lookup failed:", orderErr);

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

      // Pull the live invoice_number off the existing invoices row if
      // we have one. Otherwise consume a fresh number from the per-
      // tenant counter so Xero never sees a UUID-derived placeholder.
      let xeroInvoiceNumber: string | null = null;
      try {
        const { data: invRow, error: invRowErr } = await supabase
          .from("invoices")
          .select("invoice_number")
          .eq("order_id", orderId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (invRowErr) console.error("[xeroIntegrationService/syncInvoiceToXero] invoices number lookup failed:", invRowErr);
        if ((invRow as any)?.invoice_number) {
          xeroInvoiceNumber = (invRow as any).invoice_number as string;
        }
      } catch {
        // fall through to RPC
      }
      if (!xeroInvoiceNumber) {
        try {
          const { data: numData } = await (supabase as any).rpc(
            "consume_next_document_number",
            { p_company_id: (order as any).company_id, p_document_type: "invoice" },
          );
          if (numData) xeroInvoiceNumber = numData as string;
        } catch (e) {
          console.warn("[xeroIntegrationService] numbering RPC failed:", e);
        }
      }
      if (!xeroInvoiceNumber) {
        xeroInvoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      }

      const xeroInvoice: XeroInvoice = {
        invoiceNumber: xeroInvoiceNumber,
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

      const { data: integration, error: integrationErr } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.user.id)
        .eq("integration_type", "xero")
        .eq("is_active", true)
        .single();
      if (integrationErr && (integrationErr as any).code !== "PGRST116") console.error("[xeroIntegrationService/syncExpenseToXero] integrations lookup failed:", integrationErr);

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

      const { data: integration, error: integrationErr } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.user.id)
        .eq("integration_type", "xero")
        .eq("is_active", true)
        .single();
      if (integrationErr && (integrationErr as any).code !== "PGRST116") console.error("[xeroIntegrationService/getXeroConnection] integrations lookup failed:", integrationErr);

      if (!integration || !integration.credentials) return null;
      
      const credentials = integration.credentials as {
        tenantId: string;
        accessToken: string;
        refreshToken: string;
        expiresAt: string;
      };

      return {
        tenantId: credentials.tenantId,
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: new Date(credentials.expiresAt),
        connected: integration.is_active
      };
    } catch (error) {
      console.error("Error getting Xero connection:", error);
      return null;
    }
  }
};
