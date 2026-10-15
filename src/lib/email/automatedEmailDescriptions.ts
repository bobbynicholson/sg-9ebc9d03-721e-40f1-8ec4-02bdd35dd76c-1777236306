/**
 * Plain-language notes for each automatic email on Email settings, shown
 * in the "What is this?" chip next to the email's switch: who gets it,
 * when it is sent, and what turning it off means.
 *
 * Keyed by the same keys as AUTOMATED_EMAIL_TEMPLATES. A test fails if an
 * email on that list has no entry here.
 */

export interface AutomatedEmailDescription {
  /** Who receives it. */
  who: string;
  /** What triggers it. */
  when: string;
  /** What happens if it is turned off, and when you might do that. */
  ifOff: string;
}

const AFTER_SALES = (months: string): AutomatedEmailDescription => ({
  who: "The client.",
  when: `${months} after their event, a friendly check-in inviting them to book again.`,
  ifOff: "Repeat-business nudges stop for this step. Turn off if you follow up past clients yourself.",
});

export const AUTOMATED_EMAIL_DESCRIPTIONS: Record<string, AutomatedEmailDescription> = {
  // Order lifecycle
  order_confirmed: {
    who: "The client.",
    when: "When their order is confirmed, with the event details and a link to view the order.",
    ifOff: "The client is not told by email that the order is confirmed. Turn off only if you confirm orders by phone or WhatsApp.",
  },
  order_preparing: {
    who: "The client.",
    when: "When the kitchen starts preparing their order.",
    ifOff: "No progress update at this step. Many caterers turn this off to send fewer emails.",
  },
  order_ready: {
    who: "The client.",
    when: "When the order is marked ready for delivery or collection.",
    ifOff: "No email at this step. Turn off if the client collects and you call them instead.",
  },
  order_in_transit: {
    who: "The client.",
    when: "When the driver sets off with the order.",
    ifOff: "The client is not told the delivery is on its way.",
  },
  order_delivered: {
    who: "The client.",
    when: "When the order is marked delivered.",
    ifOff: "No delivery confirmation email.",
  },
  order_changed: {
    who: "The client.",
    when: "When you approve a change to a confirmed order, showing what changed.",
    ifOff: "The client is not told by email that their change went through. Tell them another way if you turn this off.",
  },
  order_change_rejected: {
    who: "The client.",
    when: "When you decline a change they asked for on a confirmed order.",
    ifOff: "The client is not told by email that the change was declined.",
  },
  order_change_request_received: {
    who: "The client.",
    when: "Straight after they ask to change a confirmed order, to say you've received the request.",
    ifOff: "The client gets no acknowledgement until you approve or decline the change.",
  },
  "order.created": {
    who: "The client.",
    when: "Shortly after a new order is booked, confirming the booking with the order number.",
    ifOff: "The client gets no separate booking confirmation; they still receive the deposit invoice email if that is on.",
  },

  // Pre-event
  event_one_week_reminder: {
    who: "The client.",
    when: "One week before the event, with the date, time and venue.",
    ifOff: "No one-week reminder. Turn off if you phone clients before events.",
  },
  event_day_before_reminder: {
    who: "The client.",
    when: "The day before the event, with the date, time and venue.",
    ifOff: "No day-before reminder.",
  },

  // Staff operations
  waiter_assignment_email: {
    who: "The waiter you assign.",
    when: "When you assign a waiter to an order.",
    ifOff: "Waiters only see the job in their portal, with no email.",
  },
  kitchen_pre_event_reminder: {
    who: "Kitchen staff.",
    when: "Before an event, so the kitchen knows what is coming up.",
    ifOff: "The kitchen only sees upcoming events in their portal.",
  },
  event_tomorrow_admin_email: {
    who: "Company admins.",
    when: "The day before an event, asking you to check prep and logistics are lined up.",
    ifOff: "No day-before email to admins. The in-app notification still shows.",
  },
  event_tomorrow_kitchen_email: {
    who: "Kitchen staff.",
    when: "The day before an event, so they can get prep going.",
    ifOff: "No day-before email to the kitchen. The in-app notification still shows.",
  },
  event_shopping_lead_email: {
    who: "Your shopping staff.",
    when: "Ahead of an event, early enough to buy the stock it needs.",
    ifOff: "No email to shopping staff. The in-app notification still shows.",
  },
  outsource_pre_event_reminder: {
    who: "Outside suppliers you've booked for an event.",
    when: "About a day before the event, with the venue, time, what they're doing and the agreed cost.",
    ifOff: "Suppliers get no reminder. Turn off if you confirm with them yourself.",
  },
  outsource_post_event_thanks: {
    who: "Outside suppliers you've booked for an event.",
    when: "One to two days after the event, thanking them and asking them to send their invoice.",
    ifOff: "No thank-you or invoice prompt is sent to the supplier.",
  },
  stale_shopping_list_digest: {
    who: "Company admins.",
    when: "When a shopping list has been open for over a week without being finished.",
    ifOff: "You won't be emailed about shopping lists left open.",
  },

  // Leads and quotes
  embed_lead_admin_email: {
    who: "Company admins.",
    when: "When someone fills in a lead form on your website.",
    ifOff: "New website enquiries only show in the app. You may miss leads if you don't check it often.",
  },
  embed_lead_thank_you_client: {
    who: "The person who filled in your website lead form.",
    when: "Straight after they send the form, to thank them and say you'll be in touch.",
    ifOff: "They get no confirmation that their enquiry arrived.",
  },
  quote_request_received: {
    who: "The client.",
    when: "When they send a quote request, to say you've received it.",
    ifOff: "The client hears nothing until you send the quote.",
  },
  email_lead_quoted: {
    who: "The client.",
    when: "The first follow-up, sent when a quote you sent hasn't been answered for a while.",
    ifOff: "No first automatic chase. Turn off if you follow up quotes by phone.",
  },
  email_lead_quiet: {
    who: "The client.",
    when: "The second follow-up, if the quote is still unanswered after the first.",
    ifOff: "No second automatic chase.",
  },
  email_lead_lost: {
    who: "The client.",
    when: "The last follow-up, if the quote is still unanswered after the second.",
    ifOff: "No final automatic chase.",
  },
  quote_expired_client: {
    who: "The client.",
    when: "When their quote passes its expiry date without being accepted.",
    ifOff: "The client is not told the quote has expired.",
  },
  quote_expired_admin: {
    who: "Company admins.",
    when: "When a quote passes its expiry date without being accepted.",
    ifOff: "You won't be emailed about expired quotes; they still show on the Quotes page.",
  },
  quote_declined_client: {
    who: "The client.",
    when: "When a quote is marked as declined or lost, confirming it's closed.",
    ifOff: "The client gets no confirmation that the quote is closed.",
  },

  // Money
  deposit_invoice_issued: {
    who: "The client.",
    when: "When their first invoice (the deposit) is created, with a link to view and pay it.",
    ifOff: "The deposit invoice is not emailed automatically. You can still send it from the invoice.",
  },
  balance_invoice_issued: {
    who: "The client.",
    when: "When a balance invoice is created after the deposit was paid, with a link to pay.",
    ifOff: "The balance invoice is not emailed automatically. You can still send it from the invoice.",
  },
  deposit_payment_received: {
    who: "The client.",
    when: "When their deposit payment is recorded, as a receipt.",
    ifOff: "The client gets no deposit receipt by email.",
  },
  balance_payment_received: {
    who: "The client.",
    when: "When a payment against an invoice is recorded, as a receipt.",
    ifOff: "The client gets no payment receipt by email.",
  },
  deposit_reminder: {
    who: "The client.",
    when: "When their deposit invoice is still unpaid, following your Payment reminders settings.",
    ifOff: "Unpaid deposits are not chased by email.",
  },
  balance_reminder_email: {
    who: "The client.",
    when: "When a balance is still unpaid, following your Payment reminders settings.",
    ifOff: "Unpaid balances are not chased by email.",
  },
  payment_failed: {
    who: "The client.",
    when: "When an online card payment they tried fails.",
    ifOff: "The client is not told by email that their payment failed.",
  },
  invoices_overdue_admin_digest: {
    who: "Company admins.",
    when: "When invoices go past their due date unpaid, as a summary list.",
    ifOff: "You won't be emailed about overdue invoices; they still show on the Invoices page.",
  },

  // Post-event
  review_request: {
    who: "The client.",
    when: "About a day after their event, asking them to leave a review.",
    ifOff: "No automatic review requests.",
  },
  equipment_collection_reminder: {
    who: "The client.",
    when: "The day before or the morning a driver is due to collect your equipment.",
    ifOff: "The client isn't warned that a driver is coming to collect.",
  },
  collection_en_route: {
    who: "The client.",
    when: "When the driver sets off to collect the equipment.",
    ifOff: "No 'driver on the way' email for collections.",
  },
  collection_arrived: {
    who: "The client.",
    when: "When the driver arrives to collect the equipment.",
    ifOff: "No 'driver has arrived' email for collections.",
  },
  collection_complete: {
    who: "The client.",
    when: "When all equipment has been collected.",
    ifOff: "No collection-complete email.",
  },
  equipment_damage_charge: {
    who: "The client.",
    when: "When a charge is added for equipment that came back damaged or missing.",
    ifOff: "The client is not emailed about the charge. Tell them another way before invoicing it.",
  },

  // Cancellation
  cancellation_request_received: {
    who: "The client.",
    when: "Straight after they ask to cancel, to say you've received the request.",
    ifOff: "The client gets no acknowledgement until you approve or decline.",
  },
  cancellation_approved: {
    who: "The client.",
    when: "When you approve their cancellation, with any refund details.",
    ifOff: "The client is not told by email that the cancellation went through.",
  },
  refund_paid: {
    who: "The client.",
    when: "When you mark their refund as paid.",
    ifOff: "The client gets no refund confirmation by email.",
  },
  postponement_approved: {
    who: "The client.",
    when: "When you approve moving their event to a new date.",
    ifOff: "The client is not told by email that the new date is confirmed.",
  },

  // After-sales
  "aftersales_after-sales-1": AFTER_SALES("Two months"),
  "aftersales_after-sales-2": AFTER_SALES("Four months"),
  "aftersales_after-sales-3": AFTER_SALES("Six months"),
  "aftersales_after-sales-4": AFTER_SALES("Eight months"),
  "aftersales_after-sales-5": AFTER_SALES("Ten months"),
  "aftersales_after-sales-6": {
    who: "The client.",
    when: "A year after their event, an anniversary note inviting them to book again.",
    ifOff: "No anniversary email.",
  },

  // Staff digests
  daily_summary: {
    who: "Team members who chose a daily summary in their notification settings.",
    when: "Once a day, listing their in-app notifications.",
    ifOff: "No one gets the daily summary email, even if they asked for it.",
  },
  weekly_report: {
    who: "Team members who chose a weekly report in their notification settings.",
    when: "Once a week, listing their in-app notifications.",
    ifOff: "No one gets the weekly report email, even if they asked for it.",
  },

  // Always sent (cannot be turned off)
  client_magic_link: {
    who: "The client.",
    when: "When they ask to sign in to their client portal.",
    ifOff: "Can't be turned off: without it the client could not sign in.",
  },
  staff_invite_login: {
    who: "A team member.",
    when: "When you invite them to the staff portal.",
    ifOff: "Can't be turned off: without it they could not sign in.",
  },
  staff_invitation: {
    who: "A new team member.",
    when: "When you add them to your team.",
    ifOff: "Can't be turned off: without it they could not set up their account.",
  },
};

export function automatedEmailDescription(key: string): AutomatedEmailDescription | undefined {
  return AUTOMATED_EMAIL_DESCRIPTIONS[key];
}
