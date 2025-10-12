
import { supabase } from "@/integrations/supabase/client";
import { starterInventoryItems } from "@/lib/starterInventory";
import { afterSalesTemplates } from "@/lib/afterSalesTemplates";

interface OnboardingData {
  userId: string;
  companyName: string;
  email: string;
  fullName: string;
  currency: string;
}

export const onboardingService = {
  async initializeUserData(data: OnboardingData) {
    try {
      console.log("Starting user onboarding initialization...");

      await Promise.all([
        this.createDefaultRegion(data),
        this.createStarterInventory(data),
        this.createEmailTemplates(data),
        this.createAfterSalesSequence(data),
        this.createSampleProducts(data),
        this.initializePaymentGateway(data)
      ]);

      await this.sendWelcomeEmail(data);
      await this.trackOnboardingEvent(data.userId, "account_created");

      console.log("User onboarding completed successfully");
      return { success: true };
    } catch (error) {
      console.error("Error during onboarding:", error);
      return { success: false, error };
    }
  },

  async createDefaultRegion(data: OnboardingData) {
    const { error } = await supabase.from("regions").insert({
      name: `${data.companyName} - Main Region`,
      country: data.currency === "ZAR" ? "South Africa" : "International",
      status: "active",
      settings: {
        default_currency: data.currency,
        timezone: "Africa/Johannesburg",
        business_hours: {
          monday: { open: "08:00", close: "18:00" },
          tuesday: { open: "08:00", close: "18:00" },
          wednesday: { open: "08:00", close: "18:00" },
          thursday: { open: "08:00", close: "18:00" },
          friday: { open: "08:00", close: "18:00" },
          saturday: { open: "09:00", close: "14:00" },
          sunday: { closed: true }
        }
      }
    });

    if (error) throw error;
  },

  async createStarterInventory(data: OnboardingData) {
    const inventoryItems = starterInventoryItems.map(item => ({
      name: item.name,
      category: item.category,
      unit: item.unit,
      quantity: item.defaultQuantity || 0,
      min_quantity: item.minQuantity || 10,
      unit_cost: item.estimatedCost || 0,
      supplier: item.defaultSupplier || "To be configured",
      shelf_life_days: item.shelfLifeDays || null,
      notes: `Starter item - Please update quantities and costs`,
      last_ordered: null
    }));

    const { error } = await supabase.from("inventory_items").insert(inventoryItems);
    if (error) throw error;
  },

  async createEmailTemplates(data: OnboardingData) {
    const templates = [
      {
        name: "New Lead Response",
        subject: "Thank You for Your Inquiry - {{company_name}}",
        body: `Hi {{client_name}},\n\nThank you for reaching out to ${data.companyName}! We're excited to help make your event unforgettable.\n\nWe've received your inquiry and will send you a detailed quote within 24 hours.\n\nBest regards,\n${data.fullName}\n${data.companyName}`,
        type: "lead_response",
        is_active: true
      },
      {
        name: "Quote Follow-Up (3 Days)",
        subject: "Following Up on Your Quote - {{company_name}}",
        body: `Hi {{client_name}},\n\nI wanted to follow up on the quote we sent a few days ago.\n\nDo you have any questions? We're here to help make your event perfect.\n\nBest regards,\n${data.fullName}`,
        type: "quote_followup_1",
        is_active: true
      },
      {
        name: "Quote Follow-Up (7 Days) - Special Offer",
        subject: "Special Offer on Your Quote - {{company_name}}",
        body: `Hi {{client_name}},\n\nWe noticed you haven't had a chance to respond to our quote yet.\n\nFor this week only, we're offering 10% off if you book by {{offer_expiry}}.\n\nLet's make your event amazing!\n\nBest regards,\n${data.fullName}`,
        type: "quote_followup_2",
        is_active: true
      },
      {
        name: "Booking Confirmation",
        subject: "Your Booking is Confirmed! - {{company_name}}",
        body: `Hi {{client_name}},\n\nGreat news! Your booking is confirmed for {{event_date}}.\n\nBooking Details:\n- Event Date: {{event_date}}\n- Guest Count: {{guest_count}}\n- Total: {{currency_symbol}}{{total_amount}}\n\nWe'll send you reminders as your event approaches.\n\nExcited to cater your event!\n${data.fullName}`,
        type: "booking_confirmation",
        is_active: true
      },
      {
        name: "Payment Thank You",
        subject: "Payment Received - Thank You! - {{company_name}}",
        body: `Hi {{client_name}},\n\nThank you for your payment of {{currency_symbol}}{{payment_amount}}.\n\nYour booking is fully confirmed and we're all set for {{event_date}}.\n\nReceipt attached.\n\nBest regards,\n${data.fullName}`,
        type: "payment_received",
        is_active: true
      },
      {
        name: "Event Reminder (14 Days)",
        subject: "Your Event is Coming Up! - {{company_name}}",
        body: `Hi {{client_name}},\n\nYour event is just 2 weeks away on {{event_date}}!\n\nEverything is on track. If you need to make any changes, please let us know ASAP.\n\nLooking forward to it!\n${data.fullName}`,
        type: "reminder_14days",
        is_active: true
      },
      {
        name: "Event Reminder (3 Days)",
        subject: "Final Preparations - Event in 3 Days - {{company_name}}",
        body: `Hi {{client_name}},\n\nYour event is just 3 days away!\n\nFinal Details:\n- Delivery Time: {{delivery_time}}\n- Setup Time: {{setup_time}}\n- Contact on Day: {{contact_phone}}\n\nCan't wait to make your event special!\n${data.fullName}`,
        type: "reminder_3days",
        is_active: true
      },
      {
        name: "Post-Event Thank You",
        subject: "Thank You & We'd Love Your Feedback - {{company_name}}",
        body: `Hi {{client_name}},\n\nThank you for choosing ${data.companyName} for your event!\n\nWe hope everything exceeded your expectations.\n\nWould you mind sharing your experience? Your feedback helps us improve.\n\n[Leave Review Link]\n\nWe'd love to cater your next event!\n${data.fullName}`,
        type: "post_event_thanks",
        is_active: true
      }
    ];

    const { error } = await supabase.from("email_templates").insert(templates);
    if (error) throw error;
  },

  async createAfterSalesSequence(data: OnboardingData) {
    const sequences = afterSalesTemplates.map((template, index) => ({
      sequence_order: index + 1,
      days_after_event: template.daysAfter,
      template_name: template.name,
      subject: template.subject.replace("{{company_name}}", data.companyName),
      body: template.body.replace("{{company_name}}", data.companyName),
      is_active: true
    }));

    const { error } = await supabase.from("after_sales_email_sequences").insert(sequences);
    if (error) throw error;
  },

  async createSampleProducts(data: OnboardingData) {
    const products = [
      {
        name: "Buffet Package - Small (30 guests)",
        description: "Perfect for intimate gatherings",
        category: "buffet",
        base_price: data.currency === "ZAR" ? 4500 : 250,
        currency: data.currency,
        serves: 30,
        is_active: true
      },
      {
        name: "Buffet Package - Medium (60 guests)",
        description: "Great for medium-sized events",
        category: "buffet",
        base_price: data.currency === "ZAR" ? 8500 : 475,
        currency: data.currency,
        serves: 60,
        is_active: true
      },
      {
        name: "Buffet Package - Large (100 guests)",
        description: "Perfect for bigger celebrations",
        category: "buffet",
        base_price: data.currency === "ZAR" ? 13500 : 750,
        currency: data.currency,
        serves: 100,
        is_active: true
      }
    ];

    const { error } = await supabase.from("products").insert(products);
    if (error) throw error;
  },

  async initializePaymentGateway(data: OnboardingData) {
    const { error } = await supabase.from("payment_gateway_configs").insert({
      gateway_name: data.currency === "ZAR" ? "payfast" : "stripe",
      is_active: false,
      is_test_mode: true,
      settings: {
        needs_configuration: true,
        currency: data.currency,
        setup_instructions: "Connect your payment gateway in Settings > Payment Gateways"
      }
    });

    if (error && error.code !== "23505") throw error;
  },

  async sendWelcomeEmail(data: OnboardingData) {
    console.log("Sending welcome email to:", data.email);
    return { success: true };
  },

  async trackOnboardingEvent(userId: string, eventType: string) {
    const { error } = await supabase.from("analytics_events").insert({
      user_id: userId,
      event_type: eventType,
      event_data: { timestamp: new Date().toISOString() }
    });

    if (error && error.code !== "42P01") {
      console.error("Error tracking event:", error);
    }
  },

  async getOnboardingProgress(userId: string) {
    const [
      profileComplete,
      paymentGatewayConnected,
      firstProductAdded,
      emailTemplatesCustomized,
      firstQuoteCreated,
      teamMemberInvited
    ] = await Promise.all([
      this.checkProfileComplete(userId),
      this.checkPaymentGatewayConnected(),
      this.checkFirstProductAdded(userId),
      this.checkEmailTemplatesCustomized(userId),
      this.checkFirstQuoteCreated(userId),
      this.checkTeamMemberInvited(userId)
    ]);

    const steps = [
      { id: "profile", label: "Complete Company Profile", completed: profileComplete },
      { id: "payment", label: "Connect Payment Gateway", completed: paymentGatewayConnected },
      { id: "product", label: "Add First Product", completed: firstProductAdded },
      { id: "email", label: "Customize Email Templates", completed: emailTemplatesCustomized },
      { id: "quote", label: "Create First Quote", completed: firstQuoteCreated },
      { id: "team", label: "Invite Team Member (Optional)", completed: teamMemberInvited }
    ];

    const completedCount = steps.filter(s => s.completed).length;
    const progress = Math.round((completedCount / steps.length) * 100);

    return { steps, progress };
  },

  async checkProfileComplete(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("company_name, phone, avatar_url")
      .eq("id", userId)
      .single();

    return !!(data?.company_name && data?.phone);
  },

  async checkPaymentGatewayConnected() {
    const { data } = await supabase
      .from("payment_gateway_configs")
      .select("is_active")
      .eq("is_active", true)
      .limit(1);

    return !!data && data.length > 0;
  },

  async checkFirstProductAdded(userId: string) {
    const { count } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .gt("base_price", 0);

    return (count || 0) > 3;
  },

  async checkEmailTemplatesCustomized(userId: string) {
    const { data } = await supabase
      .from("email_templates")
      .select("updated_at, created_at")
      .limit(1)
      .single();

    return !!(data && data.updated_at && data.updated_at !== data.created_at);
  },

  async checkFirstQuoteCreated(userId: string) {
    const { count } = await supabase
      .from("quotes")
      .select("*", { count: "exact", head: true })
      .limit(1);

    return (count || 0) > 0;
  },

  async checkTeamMemberInvited(userId: string) {
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .neq("role", "admin")
      .limit(1);

    return (count || 0) > 0;
  }
};
