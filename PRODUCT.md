# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Catering clients who request, accept, and amend event quotes.
- Sales and operations staff who price, approve, and schedule accepted bookings.
- Kitchen, shopping, dispatch, driver, waiter, and cleaning teams carrying out event-day work.

## Product Purpose

The product runs a catering booking from lead through quote, client acceptance, payment, food production, dispatch, service, equipment return, and cleaning. It must keep a single commercial booking coherent while giving each operations team the specific work they need.

## Operating Context

Clients may require one event to be served in multiple sittings. A sitting has its own guest allocation and service time; it may require its own kitchen batch, driver, venue reset, and equipment-return plan. The client describes requirements in a simple notes field. Only staff choose sitting times and guest allocations in the admin quote or booked order. Clients can read the agreed schedule and request changes in notes.

## Capabilities and Constraints

- A multi-sitting event remains one quote, order, payment, and customer event.
- The total guests across sittings must equal the booking guest count.
- One or more driver dispatches and kitchen batches can belong to each sitting; drivers may differ where schedules overlap.
- Equipment returns can be one final collection, per-sitting collections, an on-site return, or a client return.
- Shopping sees consolidated demand and sitting-specific packing instructions; kitchen and cleaning see timed, sitting-specific work.
- Existing single-sitting bookings must remain valid without migration work by users.

## Product Principles

- Keep customer lead and change-request forms simple; sitting controls belong to staff.
- Separate commercial approval from operational scheduling.
- Show each team only the time-bound work it owns, while preserving one source of truth for the event.
- Prefer explicit service, dispatch, reset, and return labels over ambiguous "collection" language.

## PDF document imports

Administrators can upload individual PDFs or folders of quote/order PDFs. AI extracts evidence and proposes only supported business fields; staff review missing values, catalogue links and totals before an atomic import. Imported dishes and equipment become reusable catalogue items; imported equipment quantities never imply owned stock. Person and billing company stay separate. Upcoming and historical orders are distinct choices. PDFs remain in private storage and payment receipt is never inferred from a document.

Incomplete imported recipes and ingredient inventory links show a persistent banner with a direct completion link on quotes, orders and operational views, including later bookings that reuse an imported item. Sending, confirming and starting kitchen/driver work are blocked by database checks until real setup is complete. An administrator explicitly completes each imported booking setup; imported communications remain quarantined until enabled.
