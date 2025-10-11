import { defaultAfterSalesTemplates, interpolateEmailTemplate, getEmailVariables } from "./afterSalesTemplates";

export interface ScheduledEmail {
  id: string;
  orderId: string;
  clientEmail: string;
  clientName: string;
  eventType: string;
  eventDate: string;
  templateId: string;
  scheduledDate: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  sentDate?: string;
  error?: string;
}

export interface AfterSalesEmailQueue {
  orderId: string;
  clientEmail: string;
  clientName: string;
  eventType: string;
  eventDate: string;
  scheduledEmails: ScheduledEmail[];
}

export const scheduleAfterSalesEmails = (
  orderId: string,
  clientEmail: string,
  clientName: string,
  eventType: string,
  eventDate: string
): ScheduledEmail[] => {
  const activeTemplates = defaultAfterSalesTemplates.filter(t => t.isActive);
  const eventDateObj = new Date(eventDate);
  
  return activeTemplates.map(template => {
    const scheduledDate = new Date(eventDateObj);
    scheduledDate.setMonth(scheduledDate.getMonth() + template.monthsAfterEvent);
    
    return {
      id: `${orderId}-email-${template.sequence}`,
      orderId,
      clientEmail,
      clientName,
      eventType,
      eventDate,
      templateId: template.id,
      scheduledDate: scheduledDate.toISOString(),
      status: "pending" as const,
    };
  });
};

export const getEmailContent = (scheduledEmail: ScheduledEmail) => {
  const template = defaultAfterSalesTemplates.find(t => t.id === scheduledEmail.templateId);
  
  if (!template) {
    throw new Error(`Template not found: ${scheduledEmail.templateId}`);
  }

  const variables = getEmailVariables(
    scheduledEmail.orderId,
    scheduledEmail.clientName,
    scheduledEmail.eventType,
    scheduledEmail.eventDate
  );

  return {
    subject: interpolateEmailTemplate(template.subject, variables),
    body: interpolateEmailTemplate(template.body, variables),
    callToAction: template.callToAction,
  };
};

export const sendScheduledEmail = async (scheduledEmail: ScheduledEmail): Promise<boolean> => {
  try {
    const emailContent = getEmailContent(scheduledEmail);
    
    console.log("Sending after-sales email:", {
      to: scheduledEmail.clientEmail,
      subject: emailContent.subject,
      scheduledDate: scheduledEmail.scheduledDate,
    });

    // In production, integrate with your email service (SendGrid, AWS SES, etc.)
    // For now, we'll simulate the send
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return true;
  } catch (error) {
    console.error("Error sending after-sales email:", error);
    return false;
  }
};

export const processEmailQueue = async (queues: AfterSalesEmailQueue[]): Promise<{
  sent: number;
  failed: number;
  pending: number;
}> => {
  let sent = 0;
  let failed = 0;
  let pending = 0;

  const now = new Date();

  for (const queue of queues) {
    for (const email of queue.scheduledEmails) {
      if (email.status !== "pending") {
        continue;
      }

      const scheduledDate = new Date(email.scheduledDate);
      
      if (scheduledDate <= now) {
        const success = await sendScheduledEmail(email);
        
        if (success) {
          email.status = "sent";
          email.sentDate = now.toISOString();
          sent++;
        } else {
          email.status = "failed";
          email.error = "Failed to send email";
          failed++;
        }
      } else {
        pending++;
      }
    }
  }

  return { sent, failed, pending };
};

export const getUpcomingEmails = (queues: AfterSalesEmailQueue[], daysAhead: number = 30): ScheduledEmail[] => {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const upcomingEmails: ScheduledEmail[] = [];

  for (const queue of queues) {
    for (const email of queue.scheduledEmails) {
      if (email.status === "pending") {
        const scheduledDate = new Date(email.scheduledDate);
        if (scheduledDate >= now && scheduledDate <= futureDate) {
          upcomingEmails.push(email);
        }
      }
    }
  }

  return upcomingEmails.sort((a, b) => 
    new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
  );
};

export const cancelEmailSequence = (orderId: string, queues: AfterSalesEmailQueue[]): void => {
  const queue = queues.find(q => q.orderId === orderId);
  
  if (queue) {
    queue.scheduledEmails.forEach(email => {
      if (email.status === "pending") {
        email.status = "cancelled";
      }
    });
  }
};

export const getEmailStatistics = (queues: AfterSalesEmailQueue[]) => {
  let totalScheduled = 0;
  let totalSent = 0;
  let totalPending = 0;
  let totalFailed = 0;
  let totalCancelled = 0;

  for (const queue of queues) {
    for (const email of queue.scheduledEmails) {
      totalScheduled++;
      switch (email.status) {
        case "sent":
          totalSent++;
          break;
        case "pending":
          totalPending++;
          break;
        case "failed":
          totalFailed++;
          break;
        case "cancelled":
          totalCancelled++;
          break;
      }
    }
  }

  return {
    totalScheduled,
    totalSent,
    totalPending,
    totalFailed,
    totalCancelled,
    successRate: totalScheduled > 0 ? (totalSent / totalScheduled) * 100 : 0,
  };
};

// Mock email queue storage (in production, use a database)
let mockEmailQueues: AfterSalesEmailQueue[] = [];

export const addToEmailQueue = (
  orderId: string,
  clientEmail: string,
  clientName: string,
  eventType: string,
  eventDate: string
): void => {
  const scheduledEmails = scheduleAfterSalesEmails(
    orderId,
    clientEmail,
    clientName,
    eventType,
    eventDate
  );

  mockEmailQueues.push({
    orderId,
    clientEmail,
    clientName,
    eventType,
    eventDate,
    scheduledEmails,
  });

  console.log(`Added ${scheduledEmails.length} after-sales emails to queue for order ${orderId}`);
};

export const getEmailQueues = (): AfterSalesEmailQueue[] => {
  return mockEmailQueues;
};

export const clearEmailQueues = (): void => {
  mockEmailQueues = [];
};
