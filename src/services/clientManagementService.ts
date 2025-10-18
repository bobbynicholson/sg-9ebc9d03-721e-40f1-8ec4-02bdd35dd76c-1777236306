import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export interface ClientWithActivity extends Profile {
  total_orders: number;
  total_quotes: number;
  total_leads: number;
  total_spent: number;
  last_order_date: string | null;
  last_activity_date: string | null;
}

export const clientManagementService = {
  /**
   * Get all clients for a company (users who have interacted with the company)
   */
  async getCompanyClients(companyId: string): Promise<ClientWithActivity[]> {
    try {
      // Get all profiles associated with this company
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Get all client_ids from orders for this company
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("client_id, total, created_at")
        .eq("company_id", companyId)
        .not("client_id", "is", null);

      if (ordersError) throw ordersError;

      // Get all quotes for this company
      const { data: quotes, error: quotesError } = await supabase
        .from("quotes")
        .select("client_email, created_at")
        .eq("company_id", companyId);

      if (quotesError) throw quotesError;

      // Get all leads for this company
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("client_email, created_at")
        .eq("company_id", companyId);

      if (leadsError) throw leadsError;

      // Collect all unique client IDs from orders
      const clientIds = new Set<string>();
      orders?.forEach((order) => {
        if (order.client_id) clientIds.add(order.client_id);
      });

      // Get profiles for all clients
      let allClientProfiles: Profile[] = [];
      if (clientIds.size > 0) {
        const { data: clientProfiles, error: clientProfilesError } = await supabase
          .from("profiles")
          .select("*")
          .in("id", Array.from(clientIds));

        if (clientProfilesError) throw clientProfilesError;
        allClientProfiles = clientProfiles || [];
      }

      // Merge company staff and order clients
      const uniqueProfiles = new Map<string, Profile>();
      [...(profiles || []), ...allClientProfiles].forEach((profile) => {
        if (!uniqueProfiles.has(profile.id)) {
          uniqueProfiles.set(profile.id, profile);
        }
      });

      // Calculate activity for each client
      const clientsWithActivity: ClientWithActivity[] = Array.from(uniqueProfiles.values()).map(
        (profile) => {
          const clientOrders = orders?.filter((o) => o.client_id === profile.id) || [];
          const clientQuotes =
            quotes?.filter((q) => q.client_email === profile.email) || [];
          const clientLeads = leads?.filter((l) => l.client_email === profile.email) || [];

          const totalSpent = clientOrders.reduce(
            (sum, order) => sum + Number(order.total || 0),
            0
          );

          const allActivityDates = [
            ...clientOrders.map((o) => o.created_at),
            ...clientQuotes.map((q) => q.created_at),
            ...clientLeads.map((l) => l.created_at),
          ].filter(Boolean);

          const lastActivityDate =
            allActivityDates.length > 0
              ? allActivityDates.sort().reverse()[0]
              : null;

          const lastOrderDate =
            clientOrders.length > 0
              ? clientOrders
                  .map((o) => o.created_at)
                  .sort()
                  .reverse()[0]
              : null;

          return {
            ...profile,
            total_orders: clientOrders.length,
            total_quotes: clientQuotes.length,
            total_leads: clientLeads.length,
            total_spent: totalSpent,
            last_order_date: lastOrderDate,
            last_activity_date: lastActivityDate,
          };
        }
      );

      return clientsWithActivity;
    } catch (error) {
      console.error("Error fetching company clients:", error);
      throw error;
    }
  },

  /**
   * Get client details with full activity history
   */
  async getClientDetails(clientId: string, companyId: string) {
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", clientId)
        .single();

      if (profileError) throw profileError;

      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .eq("client_id", clientId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;

      const { data: quotes, error: quotesError } = await supabase
        .from("quotes")
        .select("*")
        .eq("client_email", profile.email)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (quotesError) throw quotesError;

      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("*")
        .eq("client_email", profile.email)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (leadsError) throw leadsError;

      return {
        profile,
        orders: orders || [],
        quotes: quotes || [],
        leads: leads || [],
      };
    } catch (error) {
      console.error("Error fetching client details:", error);
      throw error;
    }
  },

  /**
   * Add a new client manually to the company
   */
  async addClient(
    companyId: string,
    clientData: {
      email: string;
      full_name: string;
      phone?: string;
    }
  ): Promise<Profile> {
    try {
      // Check if user already exists by email
      const { data: existingUser, error: checkError } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", clientData.email)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingUser) {
        // User exists, just associate with company if not already
        if (existingUser.company_id !== companyId) {
          const { data: updated, error: updateError } = await supabase
            .from("profiles")
            .update({ company_id: companyId })
            .eq("id", existingUser.id)
            .select()
            .single();

          if (updateError) throw updateError;
          return updated;
        }
        return existingUser;
      }

      // Create new profile entry for manual client addition
      // Note: This creates a profile without auth user - they'll need to sign up separately
      const { data: newProfile, error: createError } = await supabase
        .from("profiles")
        .insert({
          email: clientData.email,
          full_name: clientData.full_name,
          phone: clientData.phone,
          company_id: companyId,
          role: "client",
          is_active: true,
        })
        .select()
        .single();

      if (createError) {
        if (createError.code === "23503") {
          throw new Error(
            "Cannot create profile without authentication. Client must sign up first."
          );
        }
        throw createError;
      }

      return newProfile;
    } catch (error) {
      console.error("Error adding client:", error);
      throw error;
    }
  },

  /**
   * Remove client from company (deactivate)
   */
  async removeClient(clientId: string, companyId: string): Promise<void> {
    try {
      // Verify the client belongs to this company
      const { data: profile, error: checkError } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", clientId)
        .single();

      if (checkError) throw checkError;

      if (profile.company_id !== companyId) {
        throw new Error("Client does not belong to this company");
      }

      // Deactivate the client
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: false })
        .eq("id", clientId);

      if (error) throw error;
    } catch (error) {
      console.error("Error removing client:", error);
      throw error;
    }
  },

  /**
   * Search clients by name or email
   */
  async searchClients(
    companyId: string,
    searchTerm: string
  ): Promise<ClientWithActivity[]> {
    try {
      const allClients = await this.getCompanyClients(companyId);

      const term = searchTerm.toLowerCase();
      return allClients.filter(
        (client) =>
          client.full_name?.toLowerCase().includes(term) ||
          client.email?.toLowerCase().includes(term) ||
          client.phone?.toLowerCase().includes(term)
      );
    } catch (error) {
      console.error("Error searching clients:", error);
      throw error;
    }
  },

  /**
   * Get client statistics for the company
   */
  async getClientStats(companyId: string) {
    try {
      const clients = await this.getCompanyClients(companyId);

      const totalClients = clients.length;
      const activeClients = clients.filter((c) => c.total_orders > 0).length;
      const totalOrders = clients.reduce((sum, c) => sum + c.total_orders, 0);
      const totalRevenue = clients.reduce((sum, c) => sum + c.total_spent, 0);
      const totalQuotes = clients.reduce((sum, c) => sum + c.total_quotes, 0);
      const totalLeads = clients.reduce((sum, c) => sum + c.total_leads, 0);

      return {
        totalClients,
        activeClients,
        totalOrders,
        totalRevenue,
        totalQuotes,
        totalLeads,
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      };
    } catch (error) {
      console.error("Error fetching client stats:", error);
      throw error;
    }
  },
};
