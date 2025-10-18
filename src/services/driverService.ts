import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { realtimeNotificationService } from "./realtimeNotificationService";
import { whatsappIntegrationService } from "./whatsappIntegrationService";
import { emailAutomationService } from "./emailAutomationService";
import { AppOrder } from "@/types";
import { Order } from "@/types/index";

export type DriverAssignment = Tables<"driver_assignments">;
export type GPSTracking = Tables<"gps_tracking">;

export const driverService = {
  async getDriverAssignments(driverId: string): Promise<DriverAssignment[]> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .select("*, orders(id, order_number, client_name, event_date, venue_address)")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching driver assignments:", error);
      return [];
    }

    return data || [];
  },

  async getAvailableAssignments(regionId?: string): Promise<DriverAssignment[]> {
    let query = supabase
      .from("driver_assignments")
      .select("*, orders(id, order_number, client_name, event_date, venue_address)")
      .eq("status", "pending");

    if (regionId) {
      query = query.eq("region_id", regionId);
    }

    const { data, error } = await query.order("created_at");

    if (error) {
      console.error("Error fetching available assignments:", error);
      return [];
    }

    return data || [];
  },

  async startJob(assignmentId: string): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        status: "in_progress",
        started_at: new Date().toISOString()
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error starting job:", error);
      throw error;
    }

    return data;
  },

  async completeJob(assignmentId: string, distance?: number): Promise<DriverAssignment | null> {
    const updates: Partial<DriverAssignment> = {
      status: "completed",
      completed_at: new Date().toISOString()
    };

    if (distance !== undefined) {
      updates.calculated_distance = distance;
    }

    const { data, error } = await supabase
      .from("driver_assignments")
      .update(updates)
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error completing job:", error);
      throw error;
    }

    return data;
  },

  async trackGPS(
    driverId: string,
    orderId: string,
    assignmentId: string,
    location: {
      latitude: number;
      longitude: number;
      speed?: number;
      heading?: number;
      accuracy?: number;
    }
  ): Promise<GPSTracking | null> {
    const { data, error } = await supabase
      .from("gps_tracking")
      .insert([
        {
          driver_id: driverId,
          order_id: orderId,
          assignment_id: assignmentId,
          latitude: location.latitude,
          longitude: location.longitude,
          speed: location.speed,
          heading: location.heading,
          accuracy: location.accuracy
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("Error tracking GPS:", error);
      throw error;
    }

    return data;
  },

  async getGPSHistory(orderId: string, limit: number = 100): Promise<GPSTracking[]> {
    const { data, error } = await supabase
      .from("gps_tracking")
      .select("*")
      .eq("order_id", orderId)
      .order("timestamp", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching GPS history:", error);
      return [];
    }

    return data || [];
  },

  async getLatestGPSLocation(orderId: string): Promise<GPSTracking | null> {
    const { data, error } = await supabase
      .from("gps_tracking")
      .select("*")
      .eq("order_id", orderId)
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching latest GPS location:", error);
      return null;
    }

    return data;
  },

  async getDriverEarnings(driverId: string, startDate?: string, endDate?: string): Promise<DriverAssignment[]> {
    let query = supabase
      .from("driver_assignments")
      .select("*")
      .eq("driver_id", driverId)
      .eq("status", "completed");

    if (startDate) {
      query = query.gte("completed_at", startDate);
    }

    if (endDate) {
      query = query.lte("completed_at", endDate);
    }

    const { data, error } = await query.order("completed_at", { ascending: false });

    if (error) {
      console.error("Error fetching driver earnings:", error);
      return [];
    }

    return data || [];
  },

  async markPaymentPaid(assignmentId: string): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        payment_status: "paid",
        paid_at: new Date().toISOString()
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error marking payment as paid:", error);
      throw error;
    }

    return data;
  },

  async updateChecklistItem(
    assignmentId: string,
    field: "checklist_cutlery_confirmed" | "checklist_crockery_confirmed" | "checklist_food_verified",
    value: boolean
  ): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({ [field]: value })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error updating checklist:", error);
      throw error;
    }

    return data;
  },

  async confirmDeparture(assignmentId: string): Promise<DriverAssignment | null> {
    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("*")
      .eq("id", assignmentId)
      .single();

    if (!assignment) {
      throw new Error("Assignment not found");
    }

    if (!assignment.checklist_cutlery_confirmed ||
        !assignment.checklist_crockery_confirmed ||
        !assignment.checklist_food_verified) {
      throw new Error("All checklist items must be confirmed before departure");
    }

    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        departure_confirmed: true,
        departure_confirmed_at: new Date().toISOString(),
        checklist_completed_at: new Date().toISOString(),
        status: "in_progress"
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error confirming departure:", error);
      throw error;
    }

    return data;
  },

  async getChecklistStatus(assignmentId: string): Promise<Partial<DriverAssignment> | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .select("checklist_cutlery_confirmed, checklist_crockery_confirmed, checklist_food_verified, departure_confirmed, departure_confirmed_at, checklist_completed_at")
      .eq("id", assignmentId)
      .single();

    if (error) {
      console.error("Error fetching checklist status:", error);
      return null;
    }

    return data;
  },

  async calculateWaiterEarnings(
    assignmentId: string,
    waiterDurationHours: number,
    waiterHourlyRate: number
  ): Promise<DriverAssignment | null> {
    const waiterEarnings = waiterDurationHours * waiterHourlyRate;

    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        waiter_earnings: waiterEarnings
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error calculating waiter earnings:", error);
      throw error;
    }

    return data;
  },

  async getAvailableJobs(driverId: string, regionId?: string): Promise<AppOrder[]> {
    let query = supabase
      .from("orders")
      .select(`*`)
      .eq("status", "confirmed")
      .eq("balance_paid", true);

    if (regionId) {
      query = query.eq("region_id", regionId);
    }

    const { data: assignedOrders, error: assignedError } = await supabase
      .from('driver_assignments')
      .select('order_id')
      .in('status', ['accepted', 'in_progress', 'heading_to_kitchen', 'in_transit', 'arrived']);

    if (assignedError) {
      console.error("Error fetching assigned orders:", assignedError);
      return [];
    }

    const assignedOrderIds = (assignedOrders || []).map(a => a.order_id).filter(Boolean);

    const { data, error } = await query.order("event_date");

    if (error) {
      console.error("Error fetching available jobs:", error);
      return [];
    }

    const availableOrders = (data || []).filter(order => !assignedOrderIds.includes(order.id));

    return availableOrders.map((order): AppOrder => ({
      ...order,
      client_name: order.client_name || '',
      eventLocation: order.venue_address || '',
      menu_items: (order.menu_items as any) || [],
      equipment_items: (order.equipment_items as any) || [],
      waiter_service_required: order.waiter_service_required,
      waiter_duration_hours: order.waiter_duration_hours,
      waiterRate: order.waiter_hourly_rate,
      deliveryDistance: order.delivery_distance_km,
      deliveryRate: order.delivery_rate_per_km,
    }));
  },

  async acceptJob(orderId: string, driverId: string): Promise<DriverAssignment | null> {
    const { data: order } = await supabase
      .from("orders")
      .select("user_id")
      .eq("id", orderId)
      .single();

    if (!order) {
      throw new Error("Order not found");
    }

    const { data: assignment, error } = await supabase
      .from("driver_assignments")
      .insert({
        order_id: orderId,
        driver_id: driverId,
        user_id: order.user_id,
        assignment_type: "delivery",
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error accepting job:", error);
      throw error;
    }

    await supabase.from("notifications").insert({
      user_id: order.user_id,
      recipient_id: driverId,
      notification_type: "driver_assignment",
      title: "Job Accepted",
      message: "You have successfully accepted a delivery job",
      priority: "medium",
    });

    return assignment;
  },

  async startEquipmentChecklist(assignmentId: string): Promise<any> {
    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("*, orders(id, order_number, equipment_items, menu_items, special_instructions)")
      .eq("id", assignmentId)
      .single();

    if (!assignment) {
      throw new Error("Assignment not found");
    }

    const order: {
        id: string;
        order_number: string;
        equipment_items: any;
        menu_items: any;
        special_instructions: string | null;
    } | null = assignment.orders as any;

    if (!order) {
      throw new Error("Order not found for assignment");
    }

    const equipmentItems = Array.isArray(order.equipment_items) ? order.equipment_items : [];

    const cutleryCount = equipmentItems
      .filter((item: any) => item.category === 'cutlery')
      .reduce((sum: number, item: any) => sum + item.quantity, 0);

    const crockeryCount = equipmentItems
      .filter((item: any) => item.category === 'crockery')
      .reduce((sum: number, item: any) => sum + item.quantity, 0);

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      cutleryRequired: cutleryCount,
      crockeryRequired: crockeryCount,
      menuItems: order.menu_items || [],
      specialInstructions: order.special_instructions,
    };
  },

  async confirmReadyToDepart(
    assignmentId: string,
    checklist: {
      cutleryCount: number;
      crockeryCount: number;
      foodItemsVerified: boolean;
    }
  ): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        checklist_cutlery_confirmed: true,
        checklist_crockery_confirmed: true,
        checklist_food_verified: checklist.foodItemsVerified,
        departure_confirmed: true,
        departure_confirmed_at: new Date().toISOString(),
        checklist_completed_at: new Date().toISOString(),
        status: "in_transit",
        actual_cutlery_count: checklist.cutleryCount,
        actual_crockery_count: checklist.crockeryCount,
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error confirming departure:", error);
      throw error;
    }

    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("order_id, driver_id")
      .eq("id", assignmentId)
      .single();

    if (assignment) {
      await supabase.from("orders").update({
        status: "in_transit",
      }).eq("id", assignment.order_id);

      const { data: orderDetails } = await supabase
        .from("orders")
        .select("user_id, client_id, client_phone, client_email, order_number, client_name")
        .eq("id", assignment.order_id)
        .single();

      if (orderDetails) {
        await supabase.from("notifications").insert({
          user_id: orderDetails.user_id,
          recipient_id: assignment.driver_id,
          notification_type: "delivery_started",
          title: "Delivery Started",
          message: "GPS tracking activated. Drive safely!",
          priority: "high",
        });

        const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://cateringms.com'}/tracking/client?order=${assignment.order_id}`;
        const gameUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://cateringms.com'}/client-portal?game=true`;
        
        // Get client phone number from profiles table
        let clientPhone = orderDetails.client_phone;
        let clientName = orderDetails.client_name;
        let clientEmail = orderDetails.client_email;
        
        if (!clientPhone && orderDetails.client_id) {
          const { data: clientProfile } = await supabase
            .from("profiles")
            .select("phone, phone_number, full_name, email")
            .eq("id", orderDetails.client_id)
            .single();
          
          clientPhone = clientProfile?.phone || clientProfile?.phone_number;
          if (!clientName) clientName = clientProfile?.full_name;
          if (!clientEmail) clientEmail = clientProfile?.email;
        }

        // ✅ FIX BUG #20.1: Send EMAIL notification first (critical fallback)
        if (clientEmail) {
          try {
            await emailAutomationService.sendEmail({
              companyId: orderDetails.user_id,
              to: clientEmail,
              subject: `🚗 Your Driver is on the way! - Order ${orderDetails.order_number}`,
              template: 'driver-departure', // Assuming this template exists
              variables: {
                clientName: clientName || "Valued Client",
                orderNumber: orderDetails.order_number || assignment.order_id,
                driverName: "Your Driver", // TODO: Get driver name
                // trackingUrl is now a standard variable
              },
            });

            console.log("✅ Delivery tracking email sent to:", clientEmail);
          } catch (emailError) {
            console.error("⚠️ Failed to send delivery tracking email (non-blocking):", emailError);
          }
        } else {
          console.warn("⚠️ Client email not available for delivery tracking notification");
        }

        // WhatsApp as additional channel (not replacement)
        if (clientPhone) {
          try {
            // Send main delivery notification with tracking link
            await whatsappIntegrationService.sendWhatsAppMessage({
              to: clientPhone,
              type: "text",
              text: {
                body: `🚗 Your driver has left the kitchen!\n\n` +
                      `Order #${orderDetails.order_number}\n\n` +
                      `Track your delivery live with GPS:\n${trackingUrl}\n\n` +
                      `You'll receive updates when the driver is near and when they arrive. Have a great event! 🎉`
              }
            });

            // Send game invitation as a follow-up
            await whatsappIntegrationService.sendWhatsAppMessage({
              to: clientPhone,
              type: "text",
              text: {
                body: `🎮 While you wait for your driver...\n\n` +
                      `Why not have some fun? Play our Catering Dash game and compete for a spot on the leaderboard! 🏆\n\n` +
                      `🎯 Play now: ${gameUrl}\n\n` +
                      `Challenge: Can you beat the Top 10? 😊`
              }
            });
          } catch (whatsappError) {
            console.error("⚠️ WhatsApp notification failed (non-blocking - email sent):", whatsappError);
          }
        }
      }
    }

    return data;
  },

  async markArrived(assignmentId: string): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        status: "arrived",
        arrived_at: new Date().toISOString(),
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error marking arrived:", error);
      throw error;
    }

    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("order_id, driver_id")
      .eq("id", assignmentId)
      .single();

    if (assignment) {
      await supabase.from("orders").update({
        status: "delivered",
      }).eq("id", assignment.order_id);

      const { data: orderDetails } = await supabase
        .from("orders")
        .select("user_id, client_id, client_phone, client_email, order_number, client_name")
        .eq("id", assignment.order_id)
        .single();

      if (orderDetails) {
        await supabase.from("notifications").insert({
          user_id: orderDetails.user_id,
          recipient_id: assignment.driver_id,
          notification_type: "delivery_arrived",
          title: "Arrived at Venue",
          message: "You have arrived at the delivery location",
          priority: "medium",
        });

        // Get client details
        let clientPhone = orderDetails.client_phone;
        let clientEmail = orderDetails.client_email;
        let clientName = orderDetails.client_name;
        
        if (!clientPhone && orderDetails.client_id) {
          const { data: clientProfile } = await supabase
            .from("profiles")
            .select("phone, phone_number, email, full_name")
            .eq("id", orderDetails.client_id)
            .single();
          
          clientPhone = clientProfile?.phone || clientProfile?.phone_number;
          if (!clientEmail) clientEmail = clientProfile?.email;
          if (!clientName) clientName = clientProfile?.full_name;
        }

        // ✅ FIX BUG #20.2: Send EMAIL notification first (critical fallback)
        if (clientEmail) {
          try {
            const subject = `Driver Arrived! - Order ${orderDetails.order_number}`;
            const body = `Dear ${clientName || "Valued Client"},

📍 Your driver has arrived at the venue!

Order Number: ${orderDetails.order_number}

Your order is being delivered now. Enjoy your event! 🎉

Best regards,
Your Catering Company`;

            await emailAutomationService.sendEmail({
              companyId: orderDetails.user_id,
              to: clientEmail,
              subject,
              body,
              variables: {
                clientName: clientName || "Valued Client",
                orderNumber: orderDetails.order_number,
                companyName: "Your Catering Company"
              }
            });
            console.log("✅ Driver arrived email sent to:", clientEmail);
          } catch (emailError) {
            console.error("⚠️ Failed to send driver arrived email (non-blocking):", emailError);
          }
        } else {
          console.warn("⚠️ Client email not available for driver arrival notification");
        }

        // WhatsApp as additional channel
        if (clientPhone) {
          try {
            await whatsappIntegrationService.sendWhatsAppMessage({
              to: clientPhone,
              type: "text",
              text: {
                body: `📍 Your driver has arrived at the venue!\n\n` +
                      `Order #${orderDetails.order_number}\n\n` +
                      `Your order is being delivered now. Enjoy your event! 🎉`
              }
            });
          } catch (whatsappError) {
            console.error("⚠️ WhatsApp notification failed (non-blocking - email sent):", whatsappError);
          }
        }
      }
    }

    return data;
  },

  async markEventComplete(assignmentId: string): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        status: "event_complete",
        event_completed_at: new Date().toISOString(),
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error marking event complete:", error);
      throw error;
    }

    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("order_id")
      .eq("id", assignmentId)
      .single();

    if (assignment) {
      const { data: orderDetails } = await supabase
        .from("orders")
        .select("user_id, client_id")
        .eq("id", assignment.order_id)
        .single();

      if (orderDetails) {
        await supabase.from("notifications").insert({
          user_id: orderDetails.user_id,
          recipient_id: orderDetails.client_id || orderDetails.user_id,
          notification_type: "event_complete",
          title: "Event Complete",
          message: "Collection available for this order",
          priority: "medium",
        });
      }
    }

    return data;
  },

  async confirmCollection(
    assignmentId: string,
    collection: {
      cutleryReturned: number;
      crockeryReturned: number;
      notes?: string;
    }
  ): Promise<{ assignment: DriverAssignment; shortages: any[] }> {
    const { data: assignment, error: assignmentError } = (await supabase
      .from("driver_assignments")
      .select("id, order_id, driver_id, actual_cutlery_count, actual_crockery_count")
      .eq("id", assignmentId)
      .single()) as any;

    if (assignmentError || !assignment) {
      console.error("Error fetching assignment for collection:", assignmentError);
      throw new Error("Assignment not found");
    }

    const { data: order, error: orderError } = (await supabase
      .from("orders")
      .select("id, user_id, client_id, client_email, client_name, order_number, equipment_items")
      .eq("id", assignment.order_id)
      .single()) as any;

    if (orderError || !order) {
        console.error("Error fetching order for collection:", orderError);
        throw new Error("Order not found for assignment");
    }

    const equipmentItems = Array.isArray(order.equipment_items) ? order.equipment_items : [];

    const cutleryCount = equipmentItems
      .filter((item: any) => item.category === 'cutlery')
      .reduce((sum: number, item: any) => sum + item.quantity, 0);

    const crockeryCount = equipmentItems
      .filter((item: any) => item.category === 'crockery')
      .reduce((sum: number, item: any) => sum + item.quantity, 0);

    const shortages = [];

    const cutleryShortage = (assignment.actual_cutlery_count || 0) - collection.cutleryReturned;
    const crockeryShortage = (assignment.actual_crockery_count || 0) - collection.crockeryReturned;

    if (cutleryShortage > 0) {
      shortages.push({
        user_id: order.user_id,
        order_id: order.id,
        client_id: order.client_id,
        equipment_type: "cutlery",
        quantity_missing: cutleryShortage,
        notes: collection.notes,
      });
    }

    if (crockeryShortage > 0) {
      shortages.push({
        user_id: order.user_id,
        order_id: order.id,
        client_id: order.client_id,
        equipment_type: "crockery",
        quantity_missing: crockeryShortage,
        notes: collection.notes,
      });
    }

    if (shortages.length > 0) {
      await supabase.from("equipment_shortages").insert(shortages as any);
    }

    const { data: updatedAssignment, error } = await supabase
      .from("driver_assignments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        collection_cutlery_count: collection.cutleryReturned,
        collection_crockery_count: collection.crockeryReturned,
        collection_notes: collection.notes,
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error confirming collection:", error);
      throw error;
    }

    await supabase.from("orders").update({
      status: "completed",
    }).eq("id", order.id);

    // ✅ FIX BUG #20.6: Send EMAIL notification to admin about delivery completion
    try {
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("email, full_name, company_name")
        .eq("id", order.user_id)
        .single();

      if (adminProfile?.email) {
        const subject = `Delivery Completed - Order ${order.order_number}`;
        const shortageInfo = shortages.length > 0 
          ? `\n⚠️ Equipment Shortage Reported:\n${shortages.map(s => `- ${s.equipment_type}: ${s.quantity_missing} missing`).join('\n')}\n`
          : '\n✅ All equipment returned successfully\n';
        
        const body = `Dear ${adminProfile.full_name || "Admin"},

🎉 Delivery has been completed successfully!

Order Number: ${order.order_number}
Client: ${order.client_name || order.client_email}

Equipment Collection:
- Cutlery: ${collection.cutleryReturned}/${assignment.actual_cutlery_count || 0}
- Crockery: ${collection.crockeryReturned}/${assignment.actual_crockery_count || 0}
${shortageInfo}
${collection.notes ? `Driver Notes: ${collection.notes}\n` : ''}
The order has been marked as completed in the system.

Best regards,
${adminProfile.company_name || "CateringMS Platform"}`;

        await emailAutomationService.sendEmail({
          companyId: order.user_id,
          to: adminProfile.email,
          subject,
          body,
          variables: {
            orderNumber: order.order_number,
            companyName: adminProfile.company_name || "CateringMS"
          }
        });
        console.log("✅ Delivery completion email sent to admin:", adminProfile.email);
      }
    } catch (emailError) {
      console.error("⚠️ Failed to send delivery completion email to admin (non-blocking):", emailError);
    }

    // ✅ FIX BUG #20.7: Send EMAIL notification to client about delivery completion
    if (order.client_email) {
      try {
        const subject = `Thank You! - Order ${order.order_number} Completed`;
        const body = `Dear ${order.client_name || "Valued Client"},

🎉 Your order has been completed successfully!

Order Number: ${order.order_number}

Thank you for choosing us for your event. We hope everything went perfectly!

${shortages.length > 0 ? '📋 A few items were not returned. We\'ll be in touch about this separately.\n\n' : ''}We would love to hear about your experience! Please take a moment to leave us a review.

We look forward to serving you again for your next event!

Best regards,
Your Catering Company`;

        await emailAutomationService.sendEmail({
          companyId: order.user_id,
          to: order.client_email,
          subject,
          body,
          variables: {
            clientName: order.client_name || "Valued Client",
            orderNumber: order.order_number
          }
        });
        console.log("✅ Delivery completion email sent to client:", order.client_email);
      } catch (emailError) {
        console.error("⚠️ Failed to send delivery completion email to client (non-blocking):", emailError);
      }
    } else {
      console.warn("⚠️ Client email not available for delivery completion notification");
    }

    return { assignment: updatedAssignment, shortages };
  },

  async calculateTotalEarnings(assignmentId: string): Promise<number> {
    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("*, orders(delivery_rate_per_km)")
      .eq("id", assignmentId)
      .single();

    if (!assignment) {
      return 0;
    }

    const order = assignment.orders as any;

    let deliveryEarnings = 0;
    if (assignment.calculated_distance && order.delivery_rate_per_km) {
      deliveryEarnings = assignment.calculated_distance * order.delivery_rate_per_km;
    }

    const waiterEarnings = assignment.waiter_earnings || 0;

    const totalEarnings = deliveryEarnings + waiterEarnings;

    await supabase
      .from("driver_assignments")
      .update({
        delivery_earnings: deliveryEarnings,
        waiter_earnings: waiterEarnings,
        total_earnings: totalEarnings,
      })
      .eq("id", assignmentId);

    return totalEarnings;
  },

  async getEarningsSummary(driverId: string, period: "week" | "month" | "all" = "month"): Promise<any> {
    const now = new Date();
    let startDate: Date;

    if (period === "week") {
      startDate = new Date(now.setDate(now.getDate() - 7));
    } else if (period === "month") {
      startDate = new Date(now.setMonth(now.getMonth() - 1));
    } else {
      startDate = new Date(0);
    }

    const { data: assignments } = await supabase
      .from("driver_assignments")
      .select("*")
      .eq("driver_id", driverId)
      .eq("status", "completed")
      .gte("completed_at", startDate.toISOString());

    const totalEarnings = (assignments || []).reduce((sum, a) => sum + (a.total_earnings || 0), 0);
    const totalDeliveryEarnings = (assignments || []).reduce((sum, a) => sum + (a.delivery_earnings || 0), 0);
    const totalWaiterEarnings = (assignments || []).reduce((sum, a) => sum + (a.waiter_earnings || 0), 0);
    const totalJobs = assignments?.length || 0;

    const { data: unpaidAssignments } = await supabase
      .from("driver_assignments")
      .select("*")
      .eq("driver_id", driverId)
      .eq("status", "completed")
      .eq("payment_status", "pending");

    const totalOwing = (unpaidAssignments || []).reduce((sum, a) => sum + (a.total_earnings || 0), 0);

    return {
      totalEarnings,
      totalDeliveryEarnings,
      totalWaiterEarnings,
      totalJobs,
      totalOwing,
      unpaidJobs: unpaidAssignments?.length || 0,
      averagePerJob: totalJobs > 0 ? totalEarnings / totalJobs : 0,
    };
  },

  async updateDriverProfile(
    driverId: string,
    updates: {
      drive_time_to_kitchen_minutes?: number;
      phone_number?: string;
      vehicle_details?: string;
    }
  ): Promise<any> {
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", driverId)
      .select()
      .single();

    if (error) {
      console.error("Error updating driver profile:", error);
      throw error;
    }

    return data;
  },

  async getDriverProfile(driverId: string): Promise<any> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", driverId)
      .single();

    if (error) {
      console.error("Error fetching driver profile:", error);
      return null;
    }

    return data;
  },

  async calculateDepartureTimes(assignmentId: string): Promise<{
    leaveForKitchenTime: string;
    leaveForVenueTime: string;
    collectionTime: string;
  } | null> {
    const { data: assignment, error: assignmentError } = await supabase
      .from("driver_assignments")
      .select("id, order_id, driver_id, estimated_drive_time_minutes")
      .eq("id", assignmentId)
      .single();

    if (assignmentError || !assignment) {
      console.error("Error fetching assignment for departure times:", assignmentError);
      return null;
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("event_date, event_time")
      .eq("id", assignment.order_id)
      .single();

    if (orderError || !order) {
      console.error("Error fetching order for departure times:", orderError);
      return null;
    }

    const { data: driverProfile, error: profileError } = await supabase
      .from("profiles")
      .select("drive_time_to_kitchen_minutes")
      .eq("id", assignment.driver_id)
      .single();

    if (profileError || !driverProfile) {
      console.error("Error fetching driver profile for departure times:", profileError);
      return null;
    }

    const eventDateTime = new Date(`${order.event_date}T${order.event_time || "12:00:00"}`);
    const driveTimeToKitchen = driverProfile.drive_time_to_kitchen_minutes || 30;
    const driveTimeToVenue = assignment.estimated_drive_time_minutes || 30;
    const bufferTime = 15;

    const leaveForVenueTime = new Date(eventDateTime.getTime() - driveTimeToVenue * 60000 - bufferTime * 60000);
    const collectionTime = new Date(leaveForVenueTime.getTime() - bufferTime * 60000);
    const leaveForKitchenTime = new Date(collectionTime.getTime() - driveTimeToKitchen * 60000);

    return {
      leaveForKitchenTime: leaveForKitchenTime.toISOString(),
      leaveForVenueTime: leaveForVenueTime.toISOString(),
      collectionTime: collectionTime.toISOString(),
    };
  },

  async startTripToKitchen(assignmentId: string): Promise<any> {
    const { data: assignment, error } = await supabase
      .from("driver_assignments")
      .update({
        status: "heading_to_kitchen",
        started_trip_to_kitchen_at: new Date().toISOString(),
      })
      .eq("id", assignmentId)
      .select("*, orders(id, user_id, order_number, client_id, client_email, client_name)")
      .single();

    if (error) {
      console.error("Error starting trip to kitchen:", error);
      throw error;
    }

    const order = assignment.orders as any;

    if (order) {
      // In-portal notification
      await realtimeNotificationService.createNotification({
        company_id: order.company_id, // Add company_id
        user_id: order.user_id,
        recipient_id: order.user_id,
        notification_type: "driver_departure",
        title: "Driver En Route to Kitchen",
        message: `Driver is on the way to kitchen for Order ${order.order_number}`,
        priority: "medium",
        link: `/orders/${order.id}`,
      });

      // ✅ FIX BUG #20.3: Send EMAIL notification to admin
      try {
        const { data: adminProfile } = await supabase
          .from("profiles")
          .select("email, full_name, company_name")
          .eq("id", order.user_id)
          .single();

        if (adminProfile?.email) {
          const subject = `Driver Heading to Kitchen - Order ${order.order_number}`;
          const body = `Dear ${adminProfile.full_name || "Admin"},

🚗 Driver has started their journey to the kitchen.

Order Number: ${order.order_number}
Status: Driver en route to collect order

The driver will arrive at the kitchen shortly to collect the prepared order.

Best regards,
${adminProfile.company_name || "CateringMS Platform"}`;

          await emailAutomationService.sendEmail({
            companyId: order.user_id,
            to: adminProfile.email,
            subject,
            body,
            variables: {
              orderNumber: order.order_number,
              companyName: adminProfile.company_name || "CateringMS"
            }
          });
          console.log("✅ Driver departure email sent to admin:", adminProfile.email);
        }
      } catch (emailError) {
        console.error("⚠️ Failed to send driver departure email (non-blocking):", emailError);
      }

      // ✅ FIX BUG #20.4: Send EMAIL notification to client
      if (order.client_email) {
        try {
          const subject = `Order Update - Driver Collecting Your Order`;
          const body = `Dear ${order.client_name || "Valued Client"},

👨‍🍳 Great news! Your driver is on the way to the kitchen to collect your order.

Order Number: ${order.order_number}

Your order is being prepared and will be on its way to you soon. We'll notify you when the driver departs for your venue.

Best regards,
Your Catering Company`;

          await emailAutomationService.sendEmail({
            companyId: order.user_id,
            to: order.client_email,
            subject,
            body,
            variables: {
              clientName: order.client_name || "Valued Client",
              orderNumber: order.order_number
            }
          });
          console.log("✅ Driver departure notification email sent to client:", order.client_email);
        } catch (emailError) {
          console.error("⚠️ Failed to send client notification email (non-blocking):", emailError);
        }
      }
    }

    return assignment;
  },

  async markArrivedAtKitchen(assignmentId: string): Promise<DriverAssignment | null> {
    const { data, error } = await supabase
      .from("driver_assignments")
      .update({
        status: "at_kitchen",
        arrived_at_kitchen: new Date().toISOString(),
      })
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) {
      console.error("Error marking arrived at kitchen:", error);
      throw error;
    }

    const { data: assignment } = await supabase
      .from("driver_assignments")
      .select("order_id, driver_id")
      .eq("id", assignmentId)
      .single();

    if (assignment) {
      const { data: orderDetails } = await supabase
        .from("orders")
        .select("user_id, client_id, client_phone, client_email, order_number, client_name")
        .eq("id", assignment.order_id)
        .single();

      if (orderDetails) {
        await supabase.from("notifications").insert({
          user_id: orderDetails.user_id,
          recipient_id: assignment.driver_id,
          notification_type: "driver_at_kitchen",
          title: "Driver at Kitchen",
          message: "Driver has arrived at the kitchen and is collecting the order",
          priority: "medium",
        });

        // Get client details
        let clientPhone = orderDetails.client_phone;
        let clientEmail = orderDetails.client_email;
        let clientName = orderDetails.client_name;
        
        if (!clientPhone && orderDetails.client_id) {
          const { data: clientProfile } = await supabase
            .from("profiles")
            .select("phone, phone_number, email, full_name")
            .eq("id", orderDetails.client_id)
            .single();
          
          clientPhone = clientProfile?.phone || clientProfile?.phone_number;
          if (!clientEmail) clientEmail = clientProfile?.email;
          if (!clientName) clientName = clientProfile?.full_name;
        }

        // ✅ FIX BUG #20.5: Send EMAIL notification to client
        if (clientEmail) {
          try {
            const subject = `Order Update - Driver at Kitchen`;
            const body = `Dear ${clientName || "Valued Client"},

👨‍🍳 Your driver has arrived at the kitchen!

Order Number: ${orderDetails.order_number}

Your order is being collected and prepared for delivery. You'll receive another update when the driver departs for your venue. 📦

Best regards,
Your Catering Company`;

            await emailAutomationService.sendEmail({
              companyId: orderDetails.user_id,
              to: clientEmail,
              subject,
              body,
              variables: {
                clientName: clientName || "Valued Client",
                orderNumber: orderDetails.order_number
              }
            });
            console.log("✅ Driver at kitchen email sent to client:", clientEmail);
          } catch (emailError) {
            console.error("⚠️ Failed to send driver at kitchen email (non-blocking):", emailError);
          }
        } else {
          console.warn("⚠️ Client email not available for driver at kitchen notification");
        }

        // WhatsApp as additional channel
        if (clientPhone) {
          try {
            await whatsappIntegrationService.sendWhatsAppMessage({
              to: clientPhone,
              type: "text",
              text: {
                body: `👨‍🍳 Your driver has arrived at the kitchen!\n\n` +
                      `Order #${orderDetails.order_number}\n\n` +
                      `Your order is being collected and prepared for delivery. You'll receive another update when the driver departs. 📦`
              }
            });
          } catch (whatsappError) {
            console.error("⚠️ WhatsApp notification failed (non-blocking - email sent):", whatsappError);
          }
        }
      }
    }

    return data;
  },
};
