/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import { notificationService } from "./notificationService";
import { whatsappIntegrationService } from "./whatsappIntegrationService";
import { sendEmailViaAPI } from "@/lib/emailClient";

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

    // Capture the previous driver before overwriting so the audit
    // trail records the swap [P1-19]. orders.assigned_driver_id is a
    // single column; without this, the previous assignee disappears
    // silently and there's no record of who actually drove the
    // event before the replacement.
    const { data: prevOrder } = await supabase
      .from('orders')
      .select('assigned_driver_id, company_id, order_number')
      .eq('id', data.order_id)
      .maybeSingle();
    const previousDriverId = (prevOrder as any)?.assigned_driver_id || null;

    // Update order with new driver
    await supabase
      .from('orders')
      .update({ assigned_driver_id: driverId })
      .eq('id', data.order_id);

    // Audit-log the assignment swap. Best-effort -- if audit_logs is
    // unavailable for any reason, the replacement still succeeds; the
    // operator just loses the trail row. RLS allows authenticated
    // inserts under the same company.
    try {
      await (supabase as any)
        .from('audit_logs')
        .insert({
          company_id: (prevOrder as any)?.company_id,
          user_id: driverId,
          action: 'driver_replacement_accepted',
          entity_type: 'order',
          entity_id: data.order_id,
          details: {
            request_id: requestId,
            previous_driver_id: previousDriverId,
            new_driver_id: driverId,
            order_number: (prevOrder as any)?.order_number,
            accepted_at: new Date().toISOString(),
          },
        });
    } catch (auditErr: any) {
      console.warn('[driverReplacementService] audit_logs insert failed (non-blocking):', auditErr?.message);
    }

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
          phone_number,
          company_id
        )
      `)
      .eq('id', requestId)
      .single();

    if (!request) return;

    // Broadcast to admin/owner roles -- previous code used the literal
    // string 'admin' as recipient_id which is not a valid UUID, so the
    // insert silently failed and dispatch never got the alert. Switch
    // to broadcastNotification so every operator who can act sees the
    // request in their bell. Deep-link includes the orderId + the
    // request id so the dashboard can surface the right context.
    const companyId = (request.profiles as any)?.company_id;
    if (companyId) {
      const { UserRole } = await import("@/types/app");
      await notificationService.broadcastNotification({
        companyId,
        type: 'driver_replacement_needed',
        title: '🚨 Driver Replacement Requested',
        message: `${request.profiles?.full_name} needs replacement for Order #${request.orders?.order_number}. Reason: ${request.reason}`,
        priority: 'urgent',
        link: `/admin/orders?orderId=${request.order_id}&replacementRequest=${requestId}`,
        relatedEntityType: 'order',
        relatedEntityId: request.order_id,
        targetRoles: [
          UserRole.SUPER_ADMIN,
          UserRole.COMPANY_ADMIN,
          UserRole.ADMIN,
          "owner" as any,
        ],
      });
    }
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

    // Get all active drivers in the same company except the original
    // driver. Without the company scope, replacement requests would
    // broadcast to drivers of every tenant on the platform.
    const originalCompanyId = (request.profiles as any)?.company_id;
    let driversQuery = supabase
      .from('profiles')
      .select('id, full_name, email, phone, phone_number')
      .eq('role', 'driver')
      .eq('is_active', true)
      .neq('id', request.original_driver_id);
    if (originalCompanyId) {
      driversQuery = driversQuery.eq('company_id', originalCompanyId);
    }
    const { data: drivers } = await driversQuery;

    if (!drivers || drivers.length === 0) {
      console.warn("⚠️ No available drivers found for replacement request");
      return;
    }

    console.log(`📢 Broadcasting replacement request to ${drivers.length} available drivers`);

    // Send notifications to each available driver
    for (const driver of drivers) {
      // 1. In-portal notification. Deep-links to the driver's
      // deliveries page filtered to this order so the driver who
      // accepts first can confirm immediately.
      await supabase.from("notifications").insert({
        company_id: (request.profiles as any)?.company_id,
        user_id: request.original_driver_id,
        recipient_id: driver.id,
        notification_type: "driver_replacement_offer",
        title: "🚗 Emergency Delivery Available",
        message: `Replacement driver needed for Order #${request.orders?.order_number} on ${request.orders?.event_date}. First to accept gets the job!`,
        priority: "urgent",
        order_id: request.order_id,
        link: `/team-portal/driver/deliveries?orderId=${request.order_id}&replacementRequest=${requestId}`,
        related_entity_type: "order",
        related_entity_id: request.order_id,
        target_role: "driver",
        metadata: {
          requestId,
          orderId: request.order_id,
          originalDriver: request.profiles?.full_name
        }
      } as any);

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
          
          await sendEmailViaAPI({
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

    // Same broadcast pattern as notifyAdminOfReplacementRequest -- the
    // literal 'admin' recipient never matched a real user. Pull the
    // company_id off the original driver's profile so we can fan out.
    const { data: originalDriverProfile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', request.original_driver_id)
      .single();
    const companyId = (originalDriverProfile as any)?.company_id;
    if (companyId) {
      const { UserRole } = await import("@/types/app");
      await notificationService.broadcastNotification({
        companyId,
        type: 'driver_replacement_accepted',
        title: '✅ Driver Replacement Accepted',
        message: `${newDriver.full_name} has accepted Order #${request.orders?.order_number}`,
        priority: 'normal',
        link: `/admin/orders?orderId=${request.order_id}`,
        relatedEntityType: 'order',
        relatedEntityId: request.order_id,
        targetRoles: [
          UserRole.SUPER_ADMIN,
          UserRole.COMPANY_ADMIN,
          UserRole.ADMIN,
          "owner" as any,
        ],
      });
    }
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

    // Driver-facing: their replacement was accepted. Deep-link to
    // their deliveries so they can confirm the swap landed and they
    // no longer need to cover the run.
    await notificationService.createNotification({
      recipient_id: request.original_driver_id,
      user_id: request.original_driver_id,
      notification_type: 'driver_replacement_accepted',
      title: '✅ Replacement Found',
      message: `${newDriver.full_name} has accepted your replacement request for Order #${request.orders?.order_number}`,
      priority: 'normal',
      link: `/team-portal/driver/deliveries?orderId=${request.order_id}`,
      related_entity_type: 'order',
      related_entity_id: request.order_id,
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
