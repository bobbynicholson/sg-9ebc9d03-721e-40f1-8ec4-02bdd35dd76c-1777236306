import { Notification } from "@/types/tracking";

export interface EmailTemplate {
  type: "review" | "feedback" | "delivery_update" | "driver_assigned";
  subject: string;
  body: string;
}

export class NotificationService {
  private static instance: NotificationService;

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  createNotification(
    type: Notification["type"],
    recipientEmail: string,
    recipientName: string,
    message: string,
    orderId: string
  ): Notification {
    const notification: Notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      recipientEmail,
      recipientName,
      message,
      timestamp: new Date().toISOString(),
      read: false,
      orderId,
    };

    const notifications = this.getNotifications();
    notifications.push(notification);
    localStorage.setItem("notifications", JSON.stringify(notifications));

    return notification;
  }

  getNotifications(): Notification[] {
    const data = localStorage.getItem("notifications");
    return data ? JSON.parse(data) : [];
  }

  getNotificationsByOrder(orderId: string): Notification[] {
    return this.getNotifications().filter((n) => n.orderId === orderId);
  }

  getUnreadNotifications(): Notification[] {
    return this.getNotifications().filter((n) => !n.read);
  }

  markAsRead(notificationId: string): void {
    const notifications = this.getNotifications();
    const index = notifications.findIndex((n) => n.id === notificationId);
    if (index !== -1) {
      notifications[index].read = true;
      localStorage.setItem("notifications", JSON.stringify(notifications));
    }
  }

  sendReviewRequest(orderId: string, clientEmail: string, clientName: string): void {
    const message = `Thank you for using our catering service! We'd love to hear your feedback about order #${orderId}. Please take a moment to rate your experience.`;
    
    this.createNotification(
      "review_request",
      clientEmail,
      clientName,
      message,
      orderId
    );

    this.scheduleEmail({
      type: "review",
      subject: "How was your catering experience?",
      body: this.getEmailTemplate("review", { orderId, clientName }),
    }, clientEmail);
  }

  sendDeliveryUpdate(
    orderId: string,
    clientEmail: string,
    clientName: string,
    status: string
  ): void {
    const statusMessages: Record<string, string> = {
      driver_logged_in: "Your driver has logged in and is preparing for pickup",
      food_collected: "Your food has been collected and is on the way",
      driver_arrived: "Your driver has arrived at the venue",
      delivery_complete: "Your order has been delivered successfully",
    };

    const message = statusMessages[status] || "Your order status has been updated";

    this.createNotification(
      status as Notification["type"],
      clientEmail,
      clientName,
      message,
      orderId
    );
  }

  private getEmailTemplate(type: string, data: Record<string, string>): string {
    const templates: Record<string, string> = {
      review: `
        Dear ${data.clientName},
        
        Thank you for choosing our catering service for your recent event!
        
        We hope everything went smoothly with order #${data.orderId}. Your feedback is incredibly valuable to us and helps us continue to improve our service.
        
        Please take a moment to share your experience:
        - How was the quality of the food?
        - Was the delivery timely and professional?
        - Did everything meet your expectations?
        
        Click here to leave your review: [Review Link]
        
        Thank you for your business!
        
        Best regards,
        The Catering Team
      `,
      feedback: `
        Dear ${data.clientName},
        
        We'd love to hear your thoughts about your recent catering experience with order #${data.orderId}.
        
        Your feedback helps us serve you better in the future.
        
        Best regards,
        The Catering Team
      `,
    };

    return templates[type] || "";
  }

  private scheduleEmail(template: EmailTemplate, recipientEmail: string): void {
    console.log(`Scheduling email to ${recipientEmail}:`, template);
    
    const scheduledEmails = JSON.parse(
      localStorage.getItem("scheduled_emails") || "[]"
    );
    
    scheduledEmails.push({
      id: `email_${Date.now()}`,
      recipientEmail,
      template,
      scheduledFor: new Date(Date.now() + 3600000).toISOString(),
      sent: false,
    });

    localStorage.setItem("scheduled_emails", JSON.stringify(scheduledEmails));
  }

  getScheduledEmails(): any[] {
    return JSON.parse(localStorage.getItem("scheduled_emails") || "[]");
  }

  triggerAutomatedEmailSequence(orderId: string, clientEmail: string, clientName: string): void {
    setTimeout(() => {
      this.sendReviewRequest(orderId, clientEmail, clientName);
    }, 1000);

    console.log(`Automated email sequence triggered for order ${orderId}`);
  }
}

export const notificationService = NotificationService.getInstance();
