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

    await realtimeNotificationService.sendNotification({
      userId: request.original_driver_id,
      recipientId: 'admin',
      type: 'system_alert',
      title: '🚨 Driver Replacement Requested',
      message: `${request.profiles?.full_name} needs replacement for Order #${request.orders?.order_number}. Reason: ${request.reason}`,
      priority: 'urgent',
      orderId: request.order_id,
      actionUrl: '/admin/order-assignments',
      metadata: { requestId, orderId: request.order_id }
    });
  },

  /**
   * Broadcast replacement request to all available drivers
   */
  async broadcastToAvailableDrivers(requestId: string) {
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
          full_name
        )
      `)
      .eq('id', requestId)
      .single();

    if (!request) return;

    // Get all active drivers except the original driver
    const { data: drivers } = await supabase
      .from('profiles')
      .select('id, full_name, phone_number')
      .eq('role', 'driver')
      .eq('is_active', true)
      .neq('id', request.original_driver_id);

    if (!drivers) return;

    const notificationPayload: Omit<Parameters<typeof notificationService.createNotification>[0], 'recipient_id'> = {
      title: '🚗 Driver Needed',
      message: `Replacement driver needed for Order #${request.orders?.order_number} on ${request.orders?.event_date}. Accept if available.`,
      type: 'replacement_request',
      link: `/drivers`,
      user_id: request.original_driver_id,
      priority: 'high',
      metadata: { requestId, orderId: request.order_id }
    };

    // Send a notification to each available driver
    for (const driver of drivers) {
      await notificationService.createNotification({
        ...notificationPayload,
        recipient_id: driver.id,
      });

      // Send WhatsApp notification
      await this.sendReplacementRequestWhatsApp(driver.id, requestId);
    }

    // Send a single realtime broadcast to the 'driver' channel
    // This can be used to trigger a refresh on the available jobs list for all drivers
    const broadcastChannel = supabase.channel('driver-broadcasts');
    await broadcastChannel.send({
      type: 'broadcast',
      event: 'replacement_request_available',
      payload: {
        requestId,
        orderId: request.order_id,
        orderNumber: request.orders?.order_number,
      },
    });
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
