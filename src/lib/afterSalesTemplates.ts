// Wave 50 C12 - rewritten to SA English, sentence-case, lovely-vibe
// (not surveillance) tone. Discounts removed from copy so operators
// decide per send. No em dashes, no emoji, no asterisk-bold. Six
// touchpoints over the year, each short enough to read on a phone in
// under 30 seconds.
export const defaultAfterSalesTemplates = [
  {
    id: "after-sales-1",
    sequence: 1,
    monthsAfterEvent: 2,
    subject: "How did your {{eventType}} land?",
    body: `Hi {{clientName}},

It's been a couple of months since your {{eventType}} on {{eventDate}}. Hope it was everything you wanted it to be.

If you've got a minute, we'd love a quick line back - what worked, what we could've done differently. Honest is best.

Thanks again for trusting us with the day.`,
    callToAction: "Share a quick word",
    isActive: true,
    lastEdited: new Date().toISOString(),
  },
  {
    id: "after-sales-2",
    sequence: 2,
    monthsAfterEvent: 4,
    subject: "If anything's coming up, we're here",
    body: `Hi {{clientName}},

Just a quick check-in. We've added a few new menu items since your {{eventType}} in {{eventMonth}}, plus some seasonal options that are good for this time of year.

If you've got something coming up - a corporate function, a family thing, a celebration - we're around. Reply to this email and we'll get a quote together.

No pressure, just hello.`,
    callToAction: "See what's on the menu",
    isActive: true,
    lastEdited: new Date().toISOString(),
  },
  {
    id: "after-sales-3",
    sequence: 3,
    monthsAfterEvent: 6,
    subject: "Half a year on - anything brewing?",
    body: `Hi {{clientName}},

Hard to believe it's been six months since your {{eventType}}.

Year-end and the festive season tend to fill up fast on our diary, so if you're thinking about a function in the next few months it's worth pencilling something in soon.

Reply to this email if you'd like a quick chat about what you've got in mind.`,
    callToAction: "Get a quote",
    isActive: true,
    lastEdited: new Date().toISOString(),
  },
  {
    id: "after-sales-4",
    sequence: 4,
    monthsAfterEvent: 8,
    subject: "Hi from the team",
    body: `Hi {{clientName}},

Just dropping in to say hi.

Planning an event takes time and the right reason to do it - so we're not here to push. But if you've got something in mind, even loosely, we'd love to help shape it.

A few things we've added since your last booking:
- More dietary-flexible menu options
- Streamlined ordering for returning clients
- Better tracking and updates on the day

Reply if you're curious. Otherwise we'll catch up again later in the year.`,
    callToAction: "Say hi back",
    isActive: true,
    lastEdited: new Date().toISOString(),
  },
  {
    id: "after-sales-5",
    sequence: 5,
    monthsAfterEvent: 10,
    subject: "Year's nearly out - planning anything?",
    body: `Hi {{clientName}},

End of the year tends to creep up. If you're thinking about a function before the holidays, or kicking off the new year with something planned, this is the moment to lock in dates.

We've still got a handful of slots open that we tend to hold for returning clients.

Reply to this email and we'll send through availability.`,
    callToAction: "Check availability",
    isActive: true,
    lastEdited: new Date().toISOString(),
  },
  {
    id: "after-sales-6",
    sequence: 6,
    monthsAfterEvent: 12,
    subject: "A year since your {{eventType}}",
    body: `Hi {{clientName}},

A year ago you trusted us with your {{eventType}}. That still means a lot.

If you've got another event on the horizon - anniversary, birthday, function - we'd love to do it again. Same care, just for whatever you're planning next.

Reply when you're ready, no rush.

Thanks for being a client.`,
    callToAction: "Plan something new",
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
