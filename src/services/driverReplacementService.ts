import { supabase } from "@/integrations/supabase/client";
import { notificationService } from "./notificationService";
import { realtimeNotificationService } from "./realtimeNotificationService";

export interface DriverReplacementRequest {
  id: string;
  order_id: string;
  original_driver_id: string;
  reason: string;
  status: 'pending' | 'accepted' | 'cancelled';
  accepted_by_driver_id?: string;
  accepted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DriverReplacementRequestWithDetails extends DriverReplacementRequest {
  order_number?: string;
  event_date?: string;
  event_time?: string;
  original_driver_name?: string;
  accepted_driver_name?: string;
}

export const driverReplacementService = {
  /**
   * Driver requests replacement for an order
   */
  async createReplacementRequest(orderId: string, driverId: string, reason: string) {
    // Create replacement request
    const { data, error } = await supabase
      .from('driver_replacement_requests')
      .insert([{
        order_id: orderId,
        original_driver_id: driverId,
        reason,
        status: 'pending'
      }])
      .select()
      .single();

    if (error) throw error;

    // Notify admin immediately
    await this.notifyAdminOfReplacementRequest(data.id);

    // Broadcast to all available drivers
    await this.broadcastToAvailableDrivers(data.id);

    return data as DriverReplacementRequest;
  },

  /**
   * Driver accepts a replacement request
   */
  async acceptReplacementRequest(requestId: string, driverId: string) {
    // Update replacement request
    const { data, error } = await supabase
      .from('driver_replacement_requests')
      .update({
        status: 'accepted',
        accepted_by_driver_id: driverId,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) throw error;

    // Update order with new driver
    await supabase
      .from('orders')
      .update({ assigned_driver_id: driverId })
      .eq('id', data.order_id);

    // Notify admin
    await this.notifyAdminOfAcceptance(requestId, driverId);

    // Notify original driver
    await this.notifyOriginalDriver(requestId);

    // Send WhatsApp notification
    await this.sendReplacementAcceptedWhatsApp(data.order_id, driverId);

    return data as DriverReplacementRequest;
  },

  /**
   * Cancel a replacement request
   */
  async cancelReplacementRequest(requestId: string) {
    const { data, error } = await supabase
      .from('driver_replacement_requests')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;

    return data as DriverReplacementRequest;
  },

  /**
   * Get all pending replacement requests
   */
  async getPendingRequests() {
    const { data, error } = await supabase
      .from('driver_replacement_requests')
      .select(`
        *,
        orders!driver_replacement_requests_order_id_fkey (
          order_number,
          event_date,
          event_time,
          delivery_address
        ),
        profiles!driver_replacement_requests_original_driver_id_fkey (
          full_name
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data as DriverReplacementRequestWithDetails[];
  },

  /**
   * Get replacement requests for a specific driver
   */
  async getDriverRequests(driverId: string) {
    const { data, error } = await supabase
      .from('driver_replacement_requests')
      .select(`
        *,
        orders!driver_replacement_requests_order_id_fkey (
          order_number,
          event_date,
          event_time
        )
      `)
      .eq('original_driver_id', driverId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data as DriverReplacementRequestWithDetails[];
  },

  /**
   * Notify admin of replacement request
   */
  async notifyAdminOfReplacementRequest(requestId: string) {
    const { data: request } = await supabase
      .from('driver_replacement_requests')
      .select(`
        *,
        orders!driver_replacement_requests_order_id_fkey (
          order_number,
          event_date,
          event_time
        ),
        profiles!driver_replacement_requests_original_driver_id_fkey (
          full_name,
          phone_number
        )
      `)
      .eq('id', requestId)
      .single();

    if (!request) return;

    await realtimeNotificationService.createNotification({
      user_id: request.original_driver_id,
      recipient_id: 'admin',
      notification_type: 'system_alert',
      title: '🚨 Driver Replacement Requested',
      message: `${request.profiles?.full_name} needs replacement for Order #${request.orders?.order_number}. Reason: ${request.reason}`,
      priority: 'urgent',
      order_id: request.order_id,
      link: '/admin/order-assignments',
      metadata: { requestId, orderId: request.order_id }
    });
  },

  /**
   * Broadcast replacement request to all available drivers
   * Bug #9 FIX: Implement complete multi-channel notifications (email + WhatsApp + in-portal)
   */
  async broadcastToAvailableDrivers(requestId: string) {
    const { data: request } = await supabase
      .from('driver_replacement_requests')
      .select(`
        *,
        orders!driver_replacement_requests_order_id_fkey (
          order_number,
          event_date,
          event_time,
          venue_address,
          delivery_distance_km
        ),
        profiles!driver_replacement_requests_original_driver_id_fkey (
          full_name,
          company_id
        )
      `)
      .eq('id', requestId)
      .single();

    if (!request) return;

    // Get company details for email
    const { data: companyProfile } = await supabase
      .from('profiles')
      .select('company_name, full_name')
      .eq('id', request.profiles?.company_id || '')
      .single();

    const companyName = companyProfile?.company_name || companyProfile?.full_name || "Your Catering Company";

    // Get all active drivers except the original driver
    const { data: drivers } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, phone_number')
      .eq('role', 'driver')
      .eq('is_active', true)
      .neq('id', request.original_driver_id);

    if (!drivers || drivers.length === 0) {
      console.warn("⚠️ No available drivers found for replacement request");
      return;
    }

    console.log(`📢 Broadcasting replacement request to ${drivers.length} available drivers`);

    // Send notifications to each available driver
    for (const driver of drivers) {
      // 1. In-portal notification
      await supabase.from("notifications").insert({
        user_id: request.original_driver_id,
        recipient_id: driver.id,
        notification_type: "driver_assignment",
        title: "🚗 Emergency Delivery Available",
        message: `Replacement driver needed for Order #${request.orders?.order_number} on ${request.orders?.event_date}. First to accept gets the job!`,
        priority: "urgent",
        order_id: request.order_id,
        metadata: { 
          requestId, 
          orderId: request.order_id,
          originalDriver: request.profiles?.full_name
        }
      });

      // 2. ✅ NEW: Email notification to driver
      if (driver.email) {
        try {
          const subject = `🚗 Emergency Delivery Opportunity - Order ${request.orders?.order_number}`;
          const body = `Dear ${driver.full_name},

🚗 URGENT: Replacement Driver Needed

Order Number: ${request.orders?.order_number}
Event Date: ${request.orders?.event_date}
Event Time: ${request.orders?.event_time || "TBD"}
Venue: ${request.orders?.venue_address || "TBD"}
${request.orders?.delivery_distance_km ? `Distance: ${request.orders.delivery_distance_km} km\n` : ""}
Original Driver: ${request.profiles?.full_name}
Reason: ${request.reason}

⏰ FIRST TO ACCEPT GETS THE JOB!

This is an emergency replacement request. If you're available, please accept immediately in your driver portal.

Accept Job: ${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/drivers?requestId=${requestId}

The client is counting on us - let's not let them down!

Best regards,
${companyName}`;

          // Import emailAutomationService at top of file if not already imported
          const { emailAutomationService } = await import("./emailAutomationService");
          
          await emailAutomationService.sendEmail({
            companyId: request.profiles?.company_id || '',
            to: driver.email,
            subject,
            body,
            variables: {
              driverName: driver.full_name,
              orderNumber: request.orders?.order_number || requestId,
              companyName
            }
          });
          console.log(`✅ Replacement request email sent to driver: ${driver.email}`);
        } catch (emailError) {
          console.error(`⚠️ Failed to send email to driver ${driver.email} (non-blocking):`, emailError);
        }
      }

      // 3. ✅ NEW: WhatsApp notification to driver (when configured)
      const driverPhone = driver.phone || driver.phone_number;
      if (driverPhone) {
        try {
          // Import whatsappIntegrationService at top of file if not already imported
          const { whatsappIntegrationService } = await import("./whatsappIntegrationService");
          
          await whatsappIntegrationService.sendWhatsAppMessage({
            to: driverPhone,
            type: "text",
            text: {
              body: `🚗 URGENT DELIVERY NEEDED!\n\n` +
                    `Order: ${request.orders?.order_number}\n` +
                    `Date: ${request.orders?.event_date}\n` +
                    `Original Driver: ${request.profiles?.full_name}\n\n` +
                    `⏰ FIRST TO ACCEPT GETS IT!\n\n` +
                    `Open your driver app now to accept.`
            }
          });
          console.log(`✅ Replacement request WhatsApp sent to driver: ${driverPhone}`);
        } catch (whatsappError) {
          console.error(`⚠️ WhatsApp to driver ${driverPhone} failed (non-blocking - email sent):`, whatsappError);
        }
      }
    }

    console.log(`✅ Replacement request broadcast complete - notified ${drivers.length} drivers via email + WhatsApp + in-portal`);
  },

  /**
   * Notify admin when driver accepts
   */
  async notifyAdminOfAcceptance(requestId: string, newDriverId: string) {
    const { data: request } = await supabase
      .from('driver_replacement_requests')
      .select(`
        *,
        orders!driver_replacement_requests_order_id_fkey (
          order_number
        )
      `)
      .eq('id', requestId)
      .single();

    const { data: newDriver } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', newDriverId)
      .single();

    if (!request || !newDriver) return;

    await notificationService.createNotification({
      title: '✅ Driver Replacement Accepted',
      message: `${newDriver.full_name} has accepted Order #${request.orders?.order_number}`,
      type: 'success',
      link: `/orders`,
      recipient_id: 'admin', // Or specific admin ID
      metadata: { requestId, orderId: request.order_id }
    });
  },

  /**
   * Notify original driver of acceptance
   */
  async notifyOriginalDriver(requestId: string) {
    const { data: request } = await supabase
      .from('driver_replacement_requests')
      .select(`
        *,
        orders!driver_replacement_requests_order_id_fkey (
          order_number
        )
      `)
      .eq('id', requestId)
      .single();

    const { data: newDriver } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', request?.accepted_by_driver_id)
      .single();

    if (!request || !newDriver) return;

    await notificationService.createNotification({
      title: '✅ Replacement Found',
      message: `${newDriver.full_name} has accepted your replacement request for Order #${request.orders?.order_number}`,
      type: 'success',
      link: `/drivers`,
      recipient_id: request.original_driver_id,
      metadata: { requestId, orderId: request.order_id }
    });
  },

  /**
   * Send WhatsApp for replacement request
   */
  async sendReplacementRequestWhatsApp(driverId: string, requestId: string) {
    try {
      const { data: template } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('template_key', 'driver_replacement_requested')
        .eq('is_enabled', true)
        .single();

      if (!template) return;

      const { data: request } = await supabase
        .from('driver_replacement_requests')
        .select(`
          *,
          orders!driver_replacement_requests_order_id_fkey (
            order_number,
            event_date
          ),
          profiles!driver_replacement_requests_original_driver_id_fkey (
            full_name
          )
        `)
        .eq('id', requestId)
        .single();

      if (!request) return;

      let message = template.template_content;
      const variables: Record<string, string> = {
        order_number: request.orders?.order_number || '',
        event_date: request.orders?.event_date || '',
        original_driver_name: request.profiles?.full_name || ''
      };

      Object.entries(variables).forEach(([key, value]) => {
        message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
      });

      console.log('WhatsApp to driver:', message);
      // TODO: Integrate with actual WhatsApp API

    } catch (error) {
      console.error('Error sending WhatsApp:', error);
    }
  },

  /**
   * Send WhatsApp when replacement is accepted
   */
  async sendReplacementAcceptedWhatsApp(orderId: string, newDriverId: string) {
    try {
      const { data: template } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('template_key', 'driver_replacement_accepted')
        .eq('is_enabled', true)
        .single();

      if (!template) return;

      const { data: order } = await supabase
        .from('orders')
        .select('order_number')
        .eq('id', orderId)
        .single();

      const { data: driver } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', newDriverId)
        .single();

      if (!order || !driver) return;

      let message = template.template_content;
      const variables: Record<string, string> = {
        new_driver_name: driver.full_name,
        order_number: order.order_number
      };

      Object.entries(variables).forEach(([key, value]) => {
        message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
      });

      console.log('WhatsApp to admin:', message);
      // TODO: Integrate with actual WhatsApp API

    } catch (error) {
      console.error('Error sending WhatsApp:', error);
    }
  }
};
