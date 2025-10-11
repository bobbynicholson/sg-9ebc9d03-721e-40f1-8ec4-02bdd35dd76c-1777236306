export const defaultAfterSalesTemplates = [
  {
    id: "after-sales-1",
    sequence: 1,
    monthsAfterEvent: 2,
    subject: "How did everything go at your event?",
    body: `Hi {{clientName}},

I hope this message finds you well! It has been 2 months since we had the pleasure of catering your {{eventType}} on {{eventDate}}.

We would love to hear how everything went. Your feedback helps us continue delivering exceptional service to clients like you.

Quick questions:
• How was the food quality and presentation?
• Did our team arrive on time and set up smoothly?
• Was there anything that particularly impressed you?
• Is there anything we could have done better?

We are always looking for ways to improve and your honest thoughts mean the world to us.

Also, if you have been thinking about hosting another event, we would be thrilled to work with you again. As a valued client, we can offer you a 10% loyalty discount on your next booking.`,
    callToAction: "Share Your Feedback",
    isActive: true,
    lastEdited: new Date().toISOString(),
  },
  {
    id: "after-sales-2",
    sequence: 2,
    monthsAfterEvent: 4,
    subject: "Planning something special? We have got you covered",
    body: `Hi {{clientName}},

The seasons are changing and we wanted to check in to see how you have been doing since your {{eventType}} back in {{eventMonth}}.

We have been busy expanding our menu with some exciting new options:
• Seasonal specialties featuring fresh local ingredients
• Customizable dietary options for all guests
• Interactive food stations for a unique experience
• New equipment packages for larger events

If you are planning any upcoming events, corporate functions, or celebrations, we would love to help make them memorable. Our calendar tends to fill up quickly, especially during peak seasons.

As a returning client, you automatically qualify for:
✓ 15% discount on your next event
✓ Priority booking during busy periods
✓ Complimentary tasting session for events over 50 guests
✓ Free delivery within 25km`,
    callToAction: "View Our Latest Menus",
    isActive: true,
    lastEdited: new Date().toISOString(),
  },
  {
    id: "after-sales-3",
    sequence: 3,
    monthsAfterEvent: 6,
    subject: "6 months already! Time for another celebration?",
    body: `Hi {{clientName}},

Can you believe it has been half a year since your {{eventType}}? Time flies when you are creating great memories!

We have been thinking about you and wanted to reach out with some ideas for the upcoming months:

**Perfect timing for:**
• Holiday parties and year-end celebrations
• Mid-year corporate events
• Family reunions and milestone birthdays
• Seasonal outdoor gatherings

**What makes working with us even better now:**
• We have added 50 new dishes to our repertoire
• Improved our equipment inventory for larger events
• Expanded our service area
• Enhanced our tracking and communication systems

We saved a spot in our calendar just for you. Let us help you plan something special before the busy season hits.

Plus, we are offering an exclusive 20% discount for bookings made this month for events scheduled within the next 90 days.`,
    callToAction: "Let's Plan Your Next Event",
    isActive: true,
    lastEdited: new Date().toISOString(),
  },
  {
    id: "after-sales-4",
    sequence: 4,
    monthsAfterEvent: 8,
    subject: "Missing you! Special offer inside",
    body: `Hi {{clientName}},

It has been a while since we last connected, and we have been hoping to work with you again!

We understand that planning events takes time and the right occasion needs to come up. That is why we wanted to share something special with you.

**Exclusive VIP Client Benefits:**
• 25% discount on any event booked in the next 60 days
• Complimentary appetizer station for events over 75 guests
• Free venue consultation and setup planning
• Priority access to our premium equipment collection
• Flexible payment terms available

**Recent Client Success Stories:**
We recently catered a corporate event for 200 guests with rave reviews. The client specifically mentioned our attention to detail and how stress-free we made the entire process.

We have also introduced a referral program. If you know anyone planning an event, refer them to us and receive a 30% discount on your next booking when they book with us.

Your satisfaction is our priority, and we would be honored to serve you again.`,
    callToAction: "Claim Your VIP Discount",
    isActive: true,
    lastEdited: new Date().toISOString(),
  },
  {
    id: "after-sales-5",
    sequence: 5,
    monthsAfterEvent: 10,
    subject: "We have been thinking about you",
    body: `Hi {{clientName}},

As we approach the end of another year, I have been reflecting on the wonderful clients we have had the privilege to serve, and your {{eventType}} from {{eventMonth}} stands out as a memorable highlight.

**Looking ahead to the new year:**
The next few months are perfect for planning:
• Holiday celebrations and family gatherings
• New Year corporate events
• Early spring outdoor functions
• Wedding season preparations

**Why book with us again?**
✓ You already know the quality we deliver
✓ We know your preferences and style
✓ No surprises, just reliable excellent service
✓ Streamlined planning process for returning clients

**Special Limited-Time Offer:**
Book any event before the end of this month and receive:
• 30% off your total catering package
• Complimentary beverage service upgrade
• Free event coordination and timeline management
• Guaranteed availability for your preferred date

We have kept some premium dates available specifically for valued clients like you. These dates typically book up 6 months in advance, but we are holding them for a limited time.

I would love to catch up and hear what you have been up to. Even if you do not have an event planned right now, I am always happy to chat and answer any questions.`,
    callToAction: "Book Your Premium Date",
    isActive: true,
    lastEdited: new Date().toISOString(),
  },
  {
    id: "after-sales-6",
    sequence: 6,
    monthsAfterEvent: 12,
    subject: "One year anniversary and a special thank you",
    body: `Hi {{clientName}},

It has been exactly one year since we had the honor of catering your {{eventType}}. Time really does fly!

I wanted to take a moment to personally thank you for trusting us with your special event. Clients like you are the reason we love what we do.

**Celebrating Our Connection:**
To mark this one-year milestone, we want to offer you something truly special:

🎉 **Anniversary Gift: 35% Off Your Next Event**
This is our biggest discount of the year, exclusively for clients celebrating their one-year anniversary with us.

**Plus, you will receive:**
• Complimentary premium package upgrade
• Free custom menu consultation
• Priority booking for any date in the next 18 months
• Dedicated event coordinator from start to finish
• Complimentary day-of coordination service

**Stay Connected:**
Even if you do not have an event planned right now, we would love to stay in touch:
• Follow us for catering tips and food inspiration
• Get early access to new menu items and seasonal specials
• Receive exclusive offers throughout the year
• Join our VIP client community

**One More Thing:**
If you refer three friends who book events with us, your next event is completely FREE. Yes, you read that right, 100% free catering for your next celebration.

Thank you for being an incredible client. We hope to have the privilege of serving you again soon.

With gratitude and warm wishes,
[Your Catering Company Name]`,
    callToAction: "Claim Your Anniversary Gift",
    isActive: true,
    lastEdited: new Date().toISOString(),
  },
];

export function getAfterSalesEmailBySequence(sequence: number) {
  return defaultAfterSalesTemplates.find(template => template.sequence === sequence);
}

export function getNextScheduledEmail(eventDate: string, emailsSent: number[]): { sequence: number; dueDate: string } | null {
  const eventDateTime = new Date(eventDate);
  const now = new Date();
  
  for (let i = 1; i <= 6; i++) {
    if (!emailsSent.includes(i)) {
      const template = defaultAfterSalesTemplates.find(t => t.sequence === i);
      if (template) {
        const dueDate = new Date(eventDateTime);
        dueDate.setMonth(dueDate.getMonth() + template.monthsAfterEvent);
        
        if (dueDate <= now) {
          return { sequence: i, dueDate: dueDate.toISOString() };
        }
        
        return { sequence: i, dueDate: dueDate.toISOString() };
      }
    }
  }
  
  return null;
}

export function interpolateEmailTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, variables[key]);
  });
  return result;
}

export function getEmailVariables(orderId: string, clientName: string, eventType: string, eventDate: string) {
  const eventDateTime = new Date(eventDate);
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  return {
    clientName,
    eventType,
    eventDate: eventDateTime.toLocaleDateString(),
    eventMonth: monthNames[eventDateTime.getMonth()],
    orderId,
    year: eventDateTime.getFullYear().toString(),
  };
}
