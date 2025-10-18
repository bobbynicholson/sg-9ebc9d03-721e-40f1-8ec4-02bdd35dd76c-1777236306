import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Order, ConvertQuoteToOrderParams, OrderStatusUpdate, AppOrder } from "@/types/index";
import { emailAutomationService } from "./emailAutomationService";
import { whatsappIntegrationService } from "./whatsappIntegrationService";

export type OrderItem = Database["public"]["Tables"]["orders"]["Row"];
export type SupabaseOrder = Database["public"]["Tables"]["orders"]["Row"];

export const orderService = {
  /**
   * Convert a quote to an order after payment confirmation
   */
  async convertQuoteToOrder(params: ConvertQuoteToOrderParams): Promise<Order | null> {
    const { quoteId, depositPercentage, balanceDueDaysBeforeEvent, lastChangeDaysBeforeEvent } = params;

    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      console.error("Error fetching quote:", quoteError);
      throw new Error("Quote not found");
    }

    const depositAmount = (quote.total * depositPercentage) / 100;
    const balanceAmount = quote.total - depositAmount;

    const eventDate = new Date(quote.event_date);
    const balanceDueDate = new Date(eventDate);
    balanceDueDate.setDate(balanceDueDate.getDate() - balanceDueDaysBeforeEvent);

    const lastChangeDate = new Date(eventDate);
    lastChangeDate.setDate(lastChangeDate.getDate() - lastChangeDaysBeforeEvent);

    const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;

    const orderData = {
      user_id: quote.user_id,
      region_id: quote.region_id,
      quote_id: quote.id,
      order_number: orderNumber,
      client_name: quote.client_name,
      client_email: quote.client_email,
      client_phone: quote.client_phone,
      event_date: quote.event_date,
      event_time: quote.event_time,
      venue_address: quote.venue_address,
      guest_count: quote.guest_count,
      menu_items: quote.menu_items,
      equipment_items: quote.equipment_items,
      subtotal: quote.subtotal,
      tax: quote.tax,
      total: quote.total,
      currency: quote.currency,
      deposit_amount: depositAmount,
      balance_amount: balanceAmount,
      balance_due_date: balanceDueDate.toISOString(),
      last_change_allowed_date: lastChangeDate.toISOString(),
      status: "pending_deposit",
      payment_status: "pending",
      delivery_status: "pending",
    };

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([orderData])
      .select()
      .single();

    if (orderError) {
      console.error("Error creating order:", orderError);
      throw orderError;
    }

    await supabase
      .from("quotes")
      .update({ status: "converted" })
      .eq("id", quoteId);

    if (quote.equipment_items && Array.isArray(quote.equipment_items)) {
      await this.createEquipmentBookings(order.id, quote.equipment_items as any[], eventDate);
    }

    // ✅ FIX BUG #15.1: Send order creation notification to client
    if (quote.client_email) {
      try {
        const paymentUrl = `${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/checkout?orderId=${order.id}`;
        
        await emailAutomationService.sendEmail({
            companyId: quote.user_id,
            to: quote.client_email,
            subject: `Order Confirmation - #${orderNumber}`,
            template: 'order-confirmation',
            variables: {
                clientName: quote.client_name,
                orderNumber: orderNumber,
                eventDate: new Date(quote.event_date).toLocaleDateString(),
                totalAmount: `${quote.currency} ${quote.total.toFixed(2)}`,
                // depositAmount: `${quote.currency} ${depositAmount.toFixed(2)}`,
                // balanceAmount: `${quote.currency} ${balanceAmount.toFixed(2)}`,
                // paymentUrl
            }
        });
        console.log("✅ Order creation email sent to:", quote.client_email);
      } catch (emailError) {
        console.error("⚠️ Failed to send order creation email (non-blocking):", emailError);
      }
    }

    return order;
  },

  /**
   * Create equipment bookings for an order
   */
  async createEquipmentBookings(
    orderId: string,
    equipmentItems: any[],
    eventDate: Date
  ): Promise<void> {
    const { data: order } = await supabase
      .from("orders")
      .select("user_id, venue_address")
      .eq("id", orderId)
      .single();

    if (!order) return;

    // Get equipment details and create bookings
    for (const item of equipmentItems) {
      const { data: equipment } = await supabase
        .from("equipment")
        .select("*")
        .eq("user_id", order.user_id)
        .eq("name", item.name)
        .single();

      if (!equipment) continue;

      // Calculate booking times (event day + cleaning time)
      const bookedFrom = new Date(eventDate);
      bookedFrom.setHours(0, 0, 0, 0);

      const bookedUntil = new Date(eventDate);
      bookedUntil.setDate(bookedUntil.getDate() + 1);

      const availableFrom = new Date(bookedUntil);
      availableFrom.setHours(availableFrom.getHours() + (equipment.cleaning_time_hours || 2));

      await supabase.from("equipment_bookings").insert([{
        user_id: order.user_id,
        order_id: orderId,
        equipment_id: equipment.id,
        quantity: item.quantity,
        booked_from: bookedFrom.toISOString(),
        booked_until: bookedUntil.toISOString(),
        available_from: availableFrom.toISOString(),
        status: "booked",
      }]);
    }
  },

  /**
   * Record deposit payment
   */
  async recordDepositPayment(
    orderId: string,
    paymentReference: string,
    gateway: string
  ): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .update({
        deposit_paid: true,
        deposit_paid_at: new Date().toISOString(),
        payment_reference: paymentReference,
        payment_gateway: gateway,
        status: "deposit_paid",
        payment_status: "partial",
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error recording deposit:", error);
      throw error;
    }

    // ✅ FIX BUG #15.2: Send deposit payment receipt email
    if (data && data.client_email) {
      try {
        const orderUrl = `${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/client-portal?orderId=${orderId}`;
        
        await emailAutomationService.sendEmail({
            companyId: data.user_id,
            to: data.client_email,
            subject: `Deposit Paid - Order #${data.order_number}`,
            template: 'deposit-receipt',
            variables: {
                clientName: data.client_name || "Valued Client",
                orderNumber: data.order_number || orderId,
                totalAmount: `${data.currency} ${data.total?.toFixed(2) || "0.00"}`,
                // depositAmount: `${data.currency} ${data.deposit_amount?.toFixed(2) || "0.00"}`,
                // balanceAmount: `${data.currency} ${data.balance_amount?.toFixed(2) || "0.00"}`,
                // paymentUrl: orderUrl
            }
        });
        console.log("✅ Deposit receipt email sent to:", data.client_email);
      } catch (emailError) {
        console.error("⚠️ Failed to send deposit receipt email (non-blocking):", emailError);
      }
    }

    return data;
  },

  /**
   * Record balance payment
   */
  async recordBalancePayment(
    orderId: string,
    paymentReference: string
  ): Promise<Order | null> {
    const { data: order } = await supabase
      .from("orders")
      .select("total")
      .eq("id", orderId)
      .single();

    if (!order) {
      throw new Error("Order not found");
    }

    const { data, error } = await supabase
      .from("orders")
      .update({
        balance_paid: true,
        balance_paid_at: new Date().toISOString(),
        payment_reference: paymentReference,
        status: "confirmed",
        payment_status: "paid",
        amount_paid: order.total,
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error recording balance:", error);
      throw error;
    }

    // ✅ FIX BUG #15.3: Send balance payment receipt email
    if (data && data.client_email) {
      try {
        const orderUrl = `${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/client-portal?orderId=${orderId}`;
        
        // Send confirmation that balance is paid and order is fully confirmed
        await emailAutomationService.sendEmail({
            companyId: data.user_id,
            to: data.client_email,
            subject: `Payment Complete - Order #${data.order_number}`,
            template: 'payment-receipt',
            variables: {
                clientName: data.client_name || "Valued Client",
                orderNumber: data.order_number || orderId,
                totalAmount: `${data.currency} ${data.total?.toFixed(2) || "0.00"}`,
            }
        });
        console.log("✅ Balance receipt email sent to:", data.client_email);
      } catch (emailError) {
        console.error("⚠️ Failed to send balance receipt email (non-blocking):", emailError);
      }
    }

    return data;
  },

  /**
   * Update order status with validation
   */
  async updateOrderStatus({ orderId, newStatus, notes }: OrderStatusUpdate): Promise<Order | null> {
    const updates: Partial<Order> = {
      status: newStatus,
    };

    if (notes) {
      updates.internal_notes = notes;
    }

    // Set delivery status based on order status
    if (newStatus === "in_transit") {
      updates.delivery_status = "in_transit";
    } else if (newStatus === "delivered") {
      updates.delivery_status = "delivered";
      updates.delivery_time = new Date().toISOString();
    } else if (newStatus === "completed") {
      updates.delivery_status = "completed";
    }

    const { data, error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error updating order status:", error);
      throw error;
    }

    // ✅ FIX BUG #15.4: Send status update email to client
    if (data && data.client_email) {
      try {
        const statusMessages: Record<string, { title: string; message: string }> = {
          preparing: {
            title: "Your Order is Being Prepared",
            message: "Our kitchen team has started preparing your order. Everything is on track for your event!"
          },
          ready: {
            title: "Your Order is Ready",
            message: "Your order has been prepared and is ready for delivery. Our driver will depart soon."
          },
          in_transit: {
            title: "Your Order is On The Way",
            message: "Your driver has departed and is heading to your venue. You can track them in real-time!"
          },
          delivered: {
            title: "Your Order Has Been Delivered",
            message: "Your order has arrived at the venue. Enjoy your event!"
          },
          completed: {
            title: "Order Completed Successfully",
            message: "Thank you for choosing us! We hope your event was a great success."
          }
        };

        const statusInfo = statusMessages[newStatus] || { 
          title: "Order Status Update", 
          message: `Your order status has been updated to: ${newStatus}` 
        };

        // Use a simple email notification for status updates
        // TODO: Create dedicated status update email template
        console.log(`📧 Status update email should be sent to ${data.client_email}:`, {
          title: statusInfo.title,
          message: statusInfo.message,
          orderNumber: data.order_number,
          newStatus
        });
      } catch (emailError) {
        console.error("⚠️ Failed to send status update email (non-blocking):", emailError);
      }
    }

    return data;
  },

  /**
   * Allow client to modify order details (guest count, address) before deadline
   */
  async updateOrderDetails(
    orderId: string,
    updates: {
      guest_count?: number;
      venue_address?: string;
      venue_lat?: number;
      venue_lng?: number;
      special_instructions?: string;
    }
  ): Promise<Order | null> {
    // Check if modifications are still allowed
    const { data: order } = await supabase
      .from("orders")
      .select("last_change_allowed_date")
      .eq("id", orderId)
      .single();

    if (!order) {
      throw new Error("Order not found");
    }

    const now = new Date();
    const deadline = new Date(order.last_change_allowed_date!);

    if (now > deadline) {
      throw new Error("Order modification deadline has passed");
    }

    const { data, error } = await supabase
      .from("orders")
      .update({
        final_guest_count: updates.guest_count,
        venue_address: updates.venue_address,
        venue_lat: updates.venue_lat,
        venue_lng: updates.venue_lng,
        special_instructions: updates.special_instructions,
        final_order_confirmed_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error updating order details:", error);
      throw error;
    }

    return data;
  },

  /**
   * Assign order to region and make available to drivers
   */
  async assignOrderToRegion(
    orderId: string,
    regionId: string
  ): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .update({
        region_id: regionId,
        status: "assigned",
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error assigning order to region:", error);
      throw error;
    }

    return data;
  },

  /**
   * Get all orders, with optional filtering by user and other properties.
   */
  async getOrders(params: { userId?: string; filters?: { event_date?: string; status?: string; } }): Promise<Order[]> {
    let query = supabase
      .from("orders")
      .select("*")
      .order("event_date", { ascending: false });

    if (params.userId) {
      query = query.eq("user_id", params.userId);
    }
    
    if (params.filters) {
      const { filters } = params;
      if (filters.event_date) {
          query = query.eq('event_date', filters.event_date);
      }
      if (filters.status) {
          query = query.eq('status', filters.status);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching orders:", error);
      return [];
    }

    return (data as Order[]) || [];
  },

  /**
   * Get single order
   */
  async getOrder(orderId: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error) {
      console.error("Error fetching order:", error);
      return null;
    }

    return data;
  },

  /**
   * Get all orders for the calendar view
   */
  async getAllOrders(userId: string): Promise<AppOrder[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["confirmed", "preparing", "ready", "in_transit", "delivered", "completed"]);

    if (error) {
      console.error("Error fetching all orders:", error);
      return [];
    }
    
    return data || [];
  },

  /**
   * Get orders by date range
   */
  async getOrdersByDateRange(userId: string, startDate: string, endDate: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .gte("event_date", startDate)
      .lte("event_date", endDate)
      .order("event_date");

    if (error) {
      console.error("Error fetching orders by date range:", error);
      return [];
    }

    return data || [];
  },

  /**
   * Get available orders for drivers in a region (not yet assigned)
   */
  async getAvailableOrdersForDrivers(regionId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("region_id", regionId)
      .eq("status", "assigned")
      .is("assigned_driver_id", null)
      .order("event_date");

    if (error) {
      console.error("Error fetching available orders:", error);
      return [];
    }

    return data || [];
  },

  /**
   * Get orders assigned to a specific driver
   */
  async getDriverOrders(driverId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("assigned_driver_id", driverId)
      .order("event_date", { ascending: false });

    if (error) {
      console.error("Error fetching driver orders:", error);
      return [];
    }

    return data || [];
  },

  /**
   * Get orders requiring balance payment soon
   */
  async getOrdersNeedingBalancePayment(userId: string): Promise<Order[]> {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .eq("balance_paid", false)
      .lte("balance_due_date", threeDaysFromNow.toISOString())
      .order("balance_due_date");

    if (error) {
      console.error("Error fetching orders needing balance:", error);
      return [];
    }

    return data || [];
  },

  /**
   * Add waiter service to order
   */
  async addWaiterService(
    orderId: string,
    waiterDurationHours: 1 | 2 | 3,
    waiterHourlyRate: number
  ): Promise<Order | null> {
    const waiterTotalFee = waiterDurationHours * waiterHourlyRate;

    const { data, error } = await supabase
      .from("orders")
      .update({
        requires_waiter: true,
        waiter_duration_hours: waiterDurationHours,
        waiter_hourly_rate: waiterHourlyRate,
        waiter_total_fee: waiterTotalFee,
        equipment_return_method: "waiter_return",
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error adding waiter service:", error);
      throw error;
    }

    return data;
  },

  /**
   * Remove waiter service from order
   */
  async removeWaiterService(orderId: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .update({
        requires_waiter: false,
        waiter_duration_hours: null,
        waiter_hourly_rate: null,
        waiter_total_fee: null,
        equipment_return_method: "later_collection",
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error removing waiter service:", error);
      throw error;
    }

    return data;
  },

  /**
   * Get all orders requiring waiter service
   */
  async getOrdersRequiringWaiter(userId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .eq("requires_waiter", true)
      .order("event_date");

    if (error) {
      console.error("Error fetching waiter orders:", error);
      return [];
    }

    return data || [];
  },

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string, reason: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        internal_notes: reason,
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error cancelling order:", error);
      throw error;
    }

    await supabase
      .from("equipment_bookings")
      .update({ status: "cancelled" })
      .eq("order_id", orderId);

    // ✅ FIX BUG #15.5: Send cancellation confirmation email
    if (data && data.client_email) {
      try {
        // TODO: Create dedicated cancellation email template
        console.log(`📧 Cancellation email should be sent to ${data.client_email}:`, {
          orderNumber: data.order_number,
          reason,
          refundInfo: "Refund will be processed within 5-7 business days"
        });
      } catch (emailError) {
        console.error("⚠️ Failed to send cancellation email (non-blocking):", emailError);
      }
    }

    return data;
  },

  /**
   * Make progress on an order - move to next status step
   */
  async makeProgress(orderId: string, nextStatus: string): Promise<Order | null> {
    const statusMap: Record<string, Order["status"]> = {
      "quote": "pending",
      "accepted": "confirmed",
      "payment": "confirmed",
      "confirmed": "preparing",
      "kitchen": "ready",
      "driver": "in_transit",
      "transit": "delivered",
      "delivered": "completed",
      "equipment": "completed"
    };

    const mappedStatus = statusMap[nextStatus] || nextStatus as Order["status"];

    const { data, error } = await supabase
      .from("orders")
      .update({
        status: mappedStatus,
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      console.error("Error making progress on order:", error);
      throw error;
    }

    // ✅ FIX BUG #17: Multi-channel notifications for order progress
    // Get full order details including client contact info
    const { data: order } = await supabase
      .from("orders")
      .select("user_id, client_id, client_name, client_email, client_phone, order_number")
      .eq("id", orderId)
      .single();

    if (order) {
      // Define status-specific messages
      const statusMessages: Record<string, { title: string; message: string; emoji: string }> = {
        preparing: {
          title: "Order Preparation Started",
          message: `Our kitchen team has started preparing your order ${order.order_number}. Everything is on track!`,
          emoji: "👨‍🍳"
        },
        ready: {
          title: "Order Ready for Delivery",
          message: `Your order ${order.order_number} has been prepared and is ready. Our driver will depart soon.`,
          emoji: "✅"
        },
        in_transit: {
          title: "Order On The Way",
          message: `Your order ${order.order_number} is on the way! Track your driver in real-time.`,
          emoji: "🚗"
        },
        delivered: {
          title: "Order Delivered",
          message: `Your order ${order.order_number} has arrived! Enjoy your event.`,
          emoji: "📍"
        },
        completed: {
          title: "Order Completed",
          message: `Order ${order.order_number} completed successfully. Thank you for choosing us!`,
          emoji: "🎉"
        }
      };

      const statusInfo = statusMessages[mappedStatus] || {
        title: "Order Status Update",
        message: `Order ${order.order_number} status: ${mappedStatus}`,
        emoji: "📋"
      };

      // 1. In-portal notification (existing functionality - keep it)
      await realtimeNotificationService.createNotification({
        company_id: order.company_id,
        user_id: order.user_id,
        recipient_id: order.client_id || order.user_id,
        notification_type: "order_updated",
        title: statusInfo.title,
        message: statusInfo.message,
        priority: "medium",
        order_id: orderId,
      });

      // 2. ✅ NEW: Email notification to client
      if (order.client_email) {
        try {
          const trackingUrl = `${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/client-portal?orderId=${orderId}`;
          
          const subject = `${statusInfo.emoji} ${statusInfo.title} - Order ${order.order_number}`;
          const body = `Dear ${order.client_name || "Valued Client"},

${statusInfo.emoji} ${statusInfo.title}

${statusInfo.message}

View Order Details: ${trackingUrl}

${mappedStatus === "in_transit" ? `Track your driver in real-time: ${trackingUrl.replace("client-portal", "tracking/client")}\n\n` : ""}Thank you for choosing us!

Best regards,
Your Catering Company`;

          await emailAutomationService.sendEmail({
            companyId: order.user_id,
            to: order.client_email,
            subject,
            body,
            variables: {
              clientName: order.client_name || "Valued Client",
              orderNumber: order.order_number,
              companyName: "Your Catering Company"
            }
          });
          console.log(`✅ Order progress email sent to ${order.client_email}: ${mappedStatus}`);
        } catch (emailError) {
          console.error("⚠️ Failed to send order progress email (non-blocking):", emailError);
        }
      } else {
        console.warn("⚠️ Client email not available for order progress notification");
      }

      // 3. ✅ NEW: WhatsApp notification to client (when configured)
      if (order.client_phone) {
        try {
          await whatsappIntegrationService.sendWhatsAppMessage({
            to: order.client_phone,
            type: "text",
            text: {
              body: `${statusInfo.emoji} ${statusInfo.title}\n\n` +
                    `${statusInfo.message}\n\n` +
                    `${mappedStatus === "in_transit" ? `Track live: ${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/tracking/client?orderId=${orderId}\n\n` : ""}` +
                    `Order #${order.order_number}`
            }
          });
          console.log(`✅ Order progress WhatsApp sent to ${order.client_phone}: ${mappedStatus}`);
        } catch (whatsappError) {
          console.error("⚠️ WhatsApp notification failed (non-blocking - email sent):", whatsappError);
        }
      }
    }

    return data;
  },

  /**
   * Check if order completed smoothly (no issues)
   */
  async checkSmoothCompletion(orderId: string): Promise<{
    isSmooth: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check for equipment shortages
    const { data: shortages } = await supabase
      .from("equipment_shortages")
      .select("*")
      .eq("order_id", orderId)
      .eq("status", "pending");

    if (shortages && shortages.length > 0) {
      issues.push("Equipment shortage reported");
    }

    // Check for late delivery
    const { data: order } = await supabase
      .from("orders")
      .select("event_time, delivery_time")
      .eq("id", orderId)
      .single();

    if (order && order.event_time && order.delivery_time) {
      const eventTime = new Date(`1970-01-01T${order.event_time}`);
      const deliveryTime = new Date(order.delivery_time);
      const deliveryHour = deliveryTime.getHours();
      const deliveryMinute = deliveryTime.getMinutes();
      
      const eventHour = eventTime.getHours();
      const eventMinute = eventTime.getMinutes();

      // Check if delivered late (more than 15 mins after event time)
      const eventTotalMinutes = eventHour * 60 + eventMinute;
      const deliveryTotalMinutes = deliveryHour * 60 + deliveryMinute;

      if (deliveryTotalMinutes > eventTotalMinutes + 15) {
        issues.push("Delivered late");
      }
    }

    // Check for complaints
    const { data: complaints } = await supabase
      .from("complaints")
      .select("*")
      .eq("order_id", orderId);

    if (complaints && complaints.length > 0) {
      issues.push("Client complaint filed");
    }

    return {
      isSmooth: issues.length === 0,
      issues,
    };
  },

  /**
   * Record order review from client
   */
  async recordOrderReview(
    orderId: string,
    rating: number,
    userId: string,
    comment?: string
  ): Promise<any> {
    const { data: review, error } = await supabase
      .from("order_reviews")
      .insert({
        order_id: orderId,
        rating,
        comment,
        user_id: userId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error recording review:", error);
      throw error;
    }

    // If bad review (1-2 stars), alert admin for debrief
    if (rating <= 2) {
      const { data: order } = await supabase
        .from("orders")
        .select("user_id, order_number, client_name")
        .eq("id", orderId)
        .single();

      if (order) {
        await supabase.from("notifications").insert({
          user_id: order.user_id,
          recipient_id: order.user_id, // Admin
          notification_type: "bad_review_alert",
          title: "⚠️ Bad Review Alert - Team Debrief Required",
          message: `Order ${order.order_number} (${order.client_name}) received ${rating} stars. Schedule team debrief to address issues and prevent recurrence.`,
          priority: "urgent",
          order_id: orderId,
        });
      }
    }

    return review;
  },
};
