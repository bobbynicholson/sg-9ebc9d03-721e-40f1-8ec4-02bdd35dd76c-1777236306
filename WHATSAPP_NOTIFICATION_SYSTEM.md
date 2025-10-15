# WhatsApp Notification System for Function Day Updates

## Overview
On function day, clients receive real-time WhatsApp updates about their order delivery, allowing them to stay informed without logging into the portal. This is perfect for busy clients who are running their function and need instant, hassle-free updates.

## Automatic WhatsApp Notifications

### 1. Driver Arrives at Kitchen 🧑‍🍳
**Trigger:** When driver marks "Arrived at Kitchen" in their app

**Message Sent:**
```
👨‍🍳 Your driver has arrived at the kitchen!

Order #[ORDER_NUMBER]

Your order is being collected and prepared for delivery. You'll receive another update when the driver departs. 📦
```

**Implementation:** `markArrivedAtKitchen()` in `driverService.ts`

---

### 2. Driver Leaves Kitchen (Starts Delivery) 🚗
**Trigger:** When driver completes equipment checklist and departs from kitchen

**Message Sent:**
```
🚗 Your driver has left the kitchen!

Order #[ORDER_NUMBER]

Track your delivery live with GPS:
[TRACKING_URL]

You'll receive updates when the driver is near and when they arrive. Have a great event! 🎉
```

**Features:**
- Includes live GPS tracking link
- Client can see driver's route in real-time
- Shows estimated time of arrival (ETA)
- Client can monitor progress on the map

**Implementation:** `confirmReadyToDepart()` in `driverService.ts`

---

### 3. Driver Arrives at Venue 📍
**Trigger:** When driver marks "Arrived at Venue"

**Message Sent:**
```
📍 Your driver has arrived at the venue!

Order #[ORDER_NUMBER]

Your order is being delivered now. Enjoy your event! 🎉
```

**Implementation:** `markArrived()` in `driverService.ts`

---

## GPS Tracking Portal

### Client Portal Features
**URL Format:** `https://cateringms.com/tracking/client?order=[ORDER_ID]`

**What Clients Can See:**
- ✅ Real-time driver location on interactive map
- ✅ Live route visualization from kitchen to venue
- ✅ Estimated time of arrival (ETA)
- ✅ Current delivery status
- ✅ Driver speed and heading
- ✅ Historical GPS tracking points

**Access:** Clients can access this directly via the WhatsApp link or by logging into their portal

---

### Admin Portal Features
**URL:** `https://cateringms.com/tracking/admin`

**What Admins Can See:**
- ✅ Overview of all active deliveries
- ✅ Real-time GPS tracking for all drivers simultaneously
- ✅ Driver status updates (at kitchen, in transit, arrived)
- ✅ Delivery progress timeline
- ✅ Route visualization for each delivery
- ✅ Multi-driver map view

**Access:** Admin dashboard → Tracking page

---

## Technical Implementation

### Phone Number Retrieval
The system retrieves client phone numbers in this order:
1. `orders.client_phone` (direct field on order)
2. `profiles.phone` (from client profile)
3. `profiles.phone_number` (alternative field)

### Phone Number Format
- Must be in international format: `+[country_code][number]`
- Example: `+27836525755` for South Africa
- Example: `+1234567890` for USA

### WhatsApp Integration Service
Located in: `src/services/whatsappIntegrationService.ts`

**Message Structure:**
```typescript
await whatsappIntegrationService.sendWhatsAppMessage({
  to: clientPhone, // International format
  type: "text",
  text: {
    body: "Your message content here"
  }
});
```

---

## Database Schema Requirements

### Orders Table
Required fields for WhatsApp notifications:
- `id` - Order UUID
- `order_number` - Display number
- `user_id` - Owner/admin ID
- `client_id` - Client profile ID
- `client_phone` - Direct phone number (optional)
- `event_date` - Function date
- `venue_address` - Delivery location

### Profiles Table
Required fields:
- `id` - Profile UUID
- `phone` - Primary phone number
- `phone_number` - Alternative phone field
- `email` - Contact email

### Driver Assignments Table
Tracks delivery progress:
- `id` - Assignment UUID
- `order_id` - Linked order
- `driver_id` - Assigned driver
- `status` - Current status:
  - `accepted` - Job accepted by driver
  - `heading_to_kitchen` - En route to kitchen
  - `at_kitchen` - Arrived at kitchen
  - `in_transit` - Departed with order
  - `arrived` - Arrived at venue
  - `completed` - Delivery complete

### GPS Tracking Table
Real-time location data:
- `driver_id` - Driver UUID
- `order_id` - Order UUID
- `assignment_id` - Assignment UUID
- `latitude` - GPS latitude
- `longitude` - GPS longitude
- `speed` - Current speed (optional)
- `heading` - Direction heading (optional)
- `timestamp` - Location timestamp

---

## User Experience Flow

### Client Experience (Function Day)
1. **Morning:** Receives confirmation that driver has accepted job
2. **Before departure:** WhatsApp notification that driver is heading to kitchen
3. **At kitchen:** Notification that driver arrived and is collecting order
4. **Departure:** Receives GPS tracking link via WhatsApp
5. **In transit:** Can click link anytime to see live location and ETA
6. **Arrival:** Notification that driver has arrived at venue
7. **Throughout:** No need to log into portal - everything via WhatsApp

### Admin Experience
1. **Dashboard view:** See all active deliveries on one screen
2. **Real-time tracking:** Monitor all drivers' GPS locations simultaneously
3. **Status updates:** Instant notifications when drivers update status
4. **Route visualization:** See each driver's route and progress
5. **Problem detection:** Quickly identify delays or issues
6. **Historical data:** Review completed deliveries and routes

---

## Benefits

### For Clients
✅ **Zero friction:** No app login needed on function day
✅ **Real-time updates:** Know exactly when driver arrives
✅ **Peace of mind:** Track delivery progress live
✅ **Mobile-first:** Works on any phone with WhatsApp
✅ **Event focus:** Stay focused on running their function

### For Admins
✅ **Central oversight:** Monitor all deliveries from one dashboard
✅ **Proactive management:** Spot issues before they become problems
✅ **Performance tracking:** Review delivery times and routes
✅ **Client confidence:** Demonstrate professional tracking capability
✅ **Reduced calls:** Fewer "where's my order?" inquiries

### For Drivers
✅ **Simple workflow:** Clear checklist-based process
✅ **Automatic updates:** No manual messaging needed
✅ **GPS tracking:** Automatic location recording
✅ **Status management:** Easy status updates via app

---

## Setup Requirements

### 1. WhatsApp Business API
- Active WhatsApp Business API account
- Verified business phone number
- API credentials configured in environment variables

### 2. Environment Variables
```env
WHATSAPP_API_URL=your_whatsapp_api_endpoint
WHATSAPP_API_TOKEN=your_api_token
NEXT_PUBLIC_APP_URL=https://cateringms.com
```

### 3. Client Phone Numbers
Ensure client phone numbers are:
- Collected during registration/order creation
- Stored in international format (+country_code + number)
- Validated before sending messages

### 4. GPS Permissions
- Driver app must request location permissions
- Background location tracking enabled
- Location updates every 10-30 seconds during active delivery

---

## Error Handling

### Failed WhatsApp Message
- Error logged to console
- Warning displayed in admin dashboard
- Fallback to email notification
- Client can still access tracking portal directly

### No Phone Number Available
- System logs warning
- Admin receives notification to add phone number
- Email notification sent instead
- Manual follow-up required

### GPS Tracking Issues
- System uses last known location
- Alerts admin if no updates for 5+ minutes
- Manual driver check-in available
- Fallback to manual status updates

---

## Future Enhancements

### Phase 2 (Recommended)
- **ETA updates:** "Driver will arrive in 10 minutes"
- **Delay alerts:** Automatic notification if delivery running late
- **Template messages:** Pre-approved WhatsApp templates
- **Rich media:** Share photos of delivered setup
- **Two-way messaging:** Allow clients to reply to driver

### Phase 3 (Advanced)
- **Predictive ETAs:** Machine learning for accurate arrival times
- **Route optimization:** AI-powered route suggestions
- **Traffic integration:** Real-time traffic condition alerts
- **Multi-language support:** Localized messages
- **Voice notes:** Driver can send voice updates

---

## Testing Checklist

Before going live:
- [ ] Test WhatsApp message delivery
- [ ] Verify phone number formats
- [ ] Test GPS tracking accuracy
- [ ] Validate tracking URL generation
- [ ] Test admin dashboard visibility
- [ ] Verify notification timing
- [ ] Test with multiple concurrent deliveries
- [ ] Validate error handling
- [ ] Test with no phone number scenario
- [ ] Review message content and tone

---

## Support and Troubleshooting

### Common Issues

**1. WhatsApp messages not sending**
- Verify WhatsApp API credentials
- Check phone number format
- Confirm API rate limits not exceeded
- Review API logs for errors

**2. GPS tracking not updating**
- Check driver app permissions
- Verify internet connectivity
- Confirm GPS service enabled
- Review battery optimization settings

**3. Tracking link not working**
- Verify NEXT_PUBLIC_APP_URL is set correctly
- Check order ID is valid
- Confirm client has permissions
- Test link in different browsers

**4. Phone number not found**
- Add phone number to client profile
- Update order with client phone
- Verify international format
- Re-send notification manually

---

## Contact for Support
For technical support or feature requests, contact the CateringMS support team.

**System Status:** ✅ Production Ready
**Last Updated:** October 2025
**Version:** 1.0.0
