---
title: route planning
status: done
created_by: human
created_at: '2026-04-20T19:42:55.787361'
position: 5
---

## Notes
The info on this page - /admin/route-planning - Optimize delivery routes - once route is optimised per delivery (admin always overrides route optimisation), the same route per delivery (deliveries) needs to shown in the driver portal so the driver has optimal route (this should make provision for a driver doing multiple deliveries in one trip (either add to an existing page in driver portal & enhanced), or create a new page for this. I need your thinking. Consider the feature, assess where you think it would be best, the put a plan together, then execute

## Checklist
- [x] Create dedicated `/team-portal/driver/routes.tsx` page for optimized route display
- [x] Integrate route visualization with map component
- [x] Display sequential stops with navigation controls
- [x] Show route statistics (distance, time, fuel, CO₂)
- [x] Add earnings tracking per delivery
- [x] Update driver navigation to include Routes link
- [x] Simplify dashboard route overview with link to full routes page
- [x] Implement stop completion tracking
- [x] Add priority badges and time displays per stop

## Acceptance
1. Drivers can view their full optimized route assigned by admin with map visualization
2. Routes page shows sequential stops with distance calculations and navigation buttons
3. Dashboard shows route preview with link to full routes page for detailed navigation
