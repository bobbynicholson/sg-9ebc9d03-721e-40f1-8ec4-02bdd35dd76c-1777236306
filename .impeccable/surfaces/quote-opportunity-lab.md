# Quote opportunity lab

## Overview

This staff decision surface lives inside the existing admin quote workflow and tenant's white Operate workspace. The main task is scanning upcoming event dates, seeing booked work and quote opportunities on each day, and choosing which opportunities to include in a planning scenario. The calendar is the primary view; map and ranked-pick views are not part of this surface.

Evidence: `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `src/components/quotes/QuoteOptimizationWorkbench.tsx`, `src/components/quotes/QuotePipelineBoard.tsx`, `src/components/quotes/QuoteAcceptanceContext.tsx`, and the acceptance preflight integration in `src/pages/admin/quotes/index.tsx`. The opportunity lab is the default quote route; quote management opens only on request. This brief records source-observed behavior; browser verification is limited by the local app requiring sign-in.

## Colors and typography

- Keep white primary surfaces, slate text and dividers, and tenant primary for selected dates, quote opportunities, actions, and focus rings.
- Emerald identifies accepted bookings; amber identifies review items and incomplete information; slate identifies closed records; rose identifies errors and capacity conflicts. Pair color with labels and counts.
- Inherit tenant heading and body fonts. Use compact 10-12px labels only for supporting dates, statuses, annotations, and calendar metadata. Names, totals, counts, and actions remain easy to scan. Use tabular numerals for values.

## Layout and interaction

- Open directly into a white bordered calendar workspace. Keep the calendar as the dominant area and selected-date details beside it at wide widths, below it on smaller screens. Give the side panel enough room for full booking and quote comparisons, use the page's normal vertical scroll, and keep its date heading visible while the page scrolls. Keep global quote-management controls out of this view.
- The calendar is Monday-first with seven columns and opens on the current or selected date's month. Previous and next month controls stay within the selected planning window. Dates outside the planning window are visibly disabled. Each date shows compact counts for orders, opportunities, items needing review, and planned quotes, plus a capacity bar.
- Selecting a date updates the adjacent details: booked orders and accepted quotes, all available quote opportunities for that date, planned contribution and prep, daily and weekly capacity, and items needing review. Weekly prep separates booked workload from the selected plan and accounts for the planning reserve. Orders and commitments include all company regions; quote opportunities follow the current region scope. Each order shows client/event, order number, guest count, time, status, sales total in its own currency, venue, and a map link where location data exists. Quote rows show value, estimated costs, contribution, margin, guest count, prep hours, date-specific comparison highlights, expiry urgency, and the optimizer's reason for including or holding the quote. Quotes for the same client and date are grouped for version comparison. One-click Add to plan and Hold out actions do not require manual cost entry. Food and event details expose menu quantities and catalogue tags separately from client dietary requests, equipment, event time/type, venue, contact, quote notes, enquiry notes, and the prep estimate formula. Missing dietary information and the fact that menu complexity is outside the prep formula remain explicit. Cost breakdown and the optional cost adjustment remain expandable.
- Keep every event type visible together without a filter toolbar. Month summaries and date cells show counts for orders, bookings, opportunities, planned quotes, and review items, with a clear empty-month state.
- Keep refresh in the calendar heading. Put planning mode, export, assumptions, and methodology in collapsed disclosures after the calendar. Show capacity conflicts in the selected-date panel. Undated enquiries remain accessible in a separate expandable queue.
- Preserve keyboard operation, visible focus, selected-state semantics, text equivalents for capacity bars, reduced-motion support, and status announcements.

## Data and decision semantics

Contribution is ex-tax revenue minus modeled costs, before fixed overhead and tax. Costs can include known menu/hire costs, allowances for missing costs and operations, and cost stress. Users may replace the estimated total with a manual pre-stress cost. Client budgets are not revenue.

The optimizer respects daily event slots, kitchen guest capacity where configured, per-event limits, weekly prep budgets, and one option per client per date. Confirmed work counts first. Recommendations are planning choices, not commercial acceptance. Driver schedules, equipment availability, and service-time overlaps still require operations review.

Settings, inclusion/exclusion preferences, and cost overrides persist in this browser for the company. Commercial quote acceptance stays in the source quote workflow.

## Acceptance and conversion context

\`QuoteAcceptanceContext\` brings the event-date decision context into the existing acceptance/conversion preflight. A private admin read retrieves all company regions' booked orders for the quote's event date, in pages of 500; deleted and automated test records are excluded. Rows show client/event identity, order number, guests, time, status, and sales total. Each amount uses its own currency, with the tenant currency as fallback. These are individual sales totals, not profit or a combined amount across currencies.

The compact capacity summary and caveats stay visible. Native disclosures reveal workload comparisons and accepted-order values. Missing guest counts, unconfigured kitchen capacity, unavailable order details, and missing event dates remain explained at the decision point. This context does not establish staffing, driver, service-time, or equipment feasibility.
