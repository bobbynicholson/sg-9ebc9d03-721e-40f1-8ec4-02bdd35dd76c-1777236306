import { supabase } from "@/integrations/supabase/client";
import { notificationService } from "./notificationService";
import { realtimeNotificationService } from "./realtimeNotificationService";

export interface DriverConfirmation {
  id: string;
  order_id: string;
  driver_id: string;
  confirmation_type: 'en_route_to_kitchen' | 'at_kitchen' | 'departed_kitchen' | 'at_venue' | 'completed';
  confirmed_at: string;
  location_lat?: number;
  location_lng?: number;
  notes?: string;
  created_at: string;
}

export interface DriverConfirmationWithDetails extends DriverConfirmation {
  driver_name?: string;
  order_number?: string;
}

export const driverConfirmationService = {
  /**
   * Driver confirms they are en-route to kitchen
   */
  async confirmEnRouteToKitchen(orderId: string, driverId: string, location?: { lat: number; lng: number }) {
    const { data, error } = await supabase
      .from('driver_confirmations')
      .insert([{
        order_id: orderId,
        driver_id: driverId,
        confirmation_type: 'en_route_to_kitchen',
        location_lat: location?.lat,
        location_lng: location?.lng,
        confirmed_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // Send notification to admin
    await this.notifyAdminOfConfirmation(orderId, driverId, 'en_route_to_kitchen');

    // Send WhatsApp to client
    await this.sendWhatsAppNotification(orderId, 'driver_en_route');

    return data as DriverConfirmation;
  },

  /**
   * Driver confirms arrival at kitchen
   */
  async confirmAtKitchen(orderId: string, driverId: string, location?: { lat: number; lng: number }) {
    const { data, error } = await supabase
      .from('driver_confirmations')
      .insert([{
        order_id: orderId,
        driver_id: driverId,
        confirmation_type: 'at_kitchen',
        location_lat: location?.lat,
        location_lng: location?.lng,
        confirmed_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    await this.notifyAdminOfConfirmation(orderId, driverId, 'at_kitchen');

    return data as DriverConfirmation;
  },

  /**
   * Driver confirms departure from kitchen
   */
  async confirmDepartedKitchen(orderId: string, driverId: string, location?: { lat: number; lng: number }) {
    const { data, error } = await supabase
      .from('driver_confirmations')
      .insert([{
        order_id: orderId,
        driver_id: driverId,
        confirmation_type: 'departed_kitchen',
        location_lat: location?.lat,
        location_lng: location?.lng,
        confirmed_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    await this.notifyAdminOfConfirmation(orderId, driverId, 'departed_kitchen');

    // Send WhatsApp to client with tracking link
    await this.sendWhatsAppNotification(orderId, 'driver_departed');

    return data as DriverConfirmation;
  },

  /**
   * Driver confirms arrival at venue
   */
  async confirmAtVenue(orderId: string, driverId: string, location?: { lat: number; lng: number }) {
    const { data, error } = await supabase
      .from('driver_confirmations')
      .insert([{
        order_id: orderId,
        driver_id: driverId,
        confirmation_type: 'at_venue',
        location_lat: location?.lat,
        location_lng: location?.lng,
        confirmed_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    await this.notifyAdminOfConfirmation(orderId, driverId, 'at_venue');

    // Send WhatsApp to client
    await this.sendWhatsAppNotification(orderId, 'driver_arrived');

    return data as DriverConfirmation;
  },

  /**
   * Check if driver has confirmed en-route and send alert if not
   */
  async checkEnRouteConfirmation(orderId: string, driverId: string, minutesBeforeFunction: number = 20) {
    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('event_date, event_time')
      .eq('id', orderId)
      .single();

    if (orderError || !order) return;

    // Check if confirmation exists
    const { data: confirmation } = await supabase
      .from('driver_confirmations')
      .select('*')
      .eq('order_id', orderId)
      .eq('driver_id', driverId)
      .eq('confirmation_type', 'en_route_to_kitchen')
      .single();

    if (confirmation) return; // Already confirmed

    // Calculate time until function
    const eventDateTime = new Date(`${order.event_date}T${order.event_time}`);
    const now = new Date();
    const minutesUntilEvent = (eventDateTime.getTime() - now.getTime()) / (1000 * 60);

    // Send alert if within threshold and not confirmed
    if (minutesUntilEvent <= minutesBeforeFunction) {
      await this.sendEnRouteAlert(orderId, driverId);
    }
  },

  /**
   * Send alert to admin that driver hasn't confirmed en-route
   */
  async sendEnRouteAlert(orderId: string, driverId: string) {
    // Get driver and order details
    const { data: driver } = await supabase
      .from('profiles')
      .select('full_name, phone_number')
      .eq('id', driverId)
      .single();

    const { data: order } = await supabase
      .from('orders')
      .select('order_number, event_date, event_time')
      .eq('id', orderId)
      .single();

    if (!driver || !order) return;

    // Send notification to admin
    await notificationService.createNotification({
      title: '⚠️ Driver Not En-Route',
      message: `${driver.full_name} has not confirmed en-route for Order #${order.order_number}. Function time: ${order.event_time}`,
      type: 'alert',
      link: `/orders`,
      metadata: { orderId, driverId }
    });

    // Send realtime alert to admin dashboard
    await realtimeNotificationService.sendNotification(
      'admin',
      'driver_not_confirmed',
      {
        orderId,
        driverId,
        driverName: driver.full_name,
        orderNumber: order.order_number,
        eventTime: order.event_time
      }
    );
  },

  /**
   * Get all confirmations for an order
   */
  async getOrderConfirmations(orderId: string) {
    const { data, error } = await supabase
      .from('driver_confirmations')
      .select(`
        *,
        profiles!driver_confirmations_driver_id_fkey (
          full_name
        )
      `)
      .eq('order_id', orderId)
      .order('confirmed_at', { ascending: true });

    if (error) throw error;

    return data as DriverConfirmationWithDetails[];
  },

  /**
   * Get driver's confirmations for today
   */
  async getTodayConfirmations(driverId: string) {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('driver_confirmations')
      .select(`
        *,
        orders!driver_confirmations_order_id_fkey (
          order_number,
          event_date,
          event_time
        )
      `)
      .eq('driver_id', driverId)
      .gte('confirmed_at', today)
      .order('confirmed_at', { ascending: false });

    if (error) throw error;

    return data as DriverConfirmationWithDetails[];
  },

  /**
   * Notify admin of driver confirmation
   */
  async notifyAdminOfConfirmation(orderId: string, driverId: string, confirmationType: string) {
    const { data: driver } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', driverId)
      .single();

    const { data: order } = await supabase
      .from('orders')
      .select('order_number')
      .eq('id', orderId)
      .single();

    if (!driver || !order) return;

    const messages = {
      'en_route_to_kitchen': `🚗 ${driver.full_name} is en-route to kitchen for Order #${order.order_number}`,
      'at_kitchen': `📍 ${driver.full_name} has arrived at kitchen for Order #${order.order_number}`,
      'departed_kitchen': `📦 ${driver.full_name} has departed kitchen with Order #${order.order_number}`,
      'at_venue': `✅ ${driver.full_name} has arrived at venue for Order #${order.order_number}`,
      'completed': `🎉 ${driver.full_name} has completed delivery of Order #${order.order_number}`
    };

    await realtimeNotificationService.sendNotification(
      'admin',
      'driver_status_update',
      {
        orderId,
        driverId,
        driverName: driver.full_name,
        orderNumber: order.order_number,
        confirmationType,
        message: messages[confirmationType as keyof typeof messages]
      }
    );
  },

  /**
   * Send WhatsApp notification based on template
   */
  async sendWhatsAppNotification(orderId: string, templateKey: string) {
    try {
      // Get template
      const { data: template } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('template_key', templateKey)
        .eq('is_enabled', true)
        .single();

      if (!template) return; // Template disabled or not found

      // Get order details for template variables
      const { data: order } = await supabase
        .from('orders')
        .select(`
          *,
          profiles!orders_driver_id_fkey (
            full_name
          )
        `)
        .eq('id', orderId)
        .single();

      if (!order) return;

      // Replace template variables
      let message = template.template_content;
      const variables: Record<string, string> = {
        driver_name: order.profiles?.full_name || 'Your driver',
        order_number: order.order_number,
        collection_time: order.event_time || '',
        tracking_link: `${window.location.origin}/tracking/client?order=${orderId}`,
        venue_name: order.venue_address || order.delivery_address || ''
      };

      Object.entries(variables).forEach(([key, value]) => {
        message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
      });

      // Send WhatsApp message (integrate with WhatsApp service)
      console.log('WhatsApp Message:', message);
      // TODO: Integrate with actual WhatsApp API

    } catch (error) {
      console.error('Error sending WhatsApp notification:', error);
    }
  }
};
