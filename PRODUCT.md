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

Clients may require one event to be served in multiple sittings. A sitting has its own guest allocation and service time; it may require its own kitchen batch, driver, venue reset, and equipment-return plan. The client can state this at lead capture, quote acceptance, or later through an amendment request. Operations staff approve and schedule the request rather than inventing it on the client's behalf.

## Capabilities and Constraints

- A multi-sitting event remains one quote, order, payment, and customer event.
- The total guests across sittings must equal the booking guest count.
- One or more driver dispatches and kitchen batches can belong to each sitting; drivers may differ where schedules overlap.
- Equipment returns can be one final collection, per-sitting collections, an on-site return, or a client return.
- Shopping sees consolidated demand and sitting-specific packing instructions; kitchen and cleaning see timed, sitting-specific work.
- Existing single-sitting bookings must remain valid without migration work by users.

## Product Principles

- Capture the client requirement early, but do not force operational detail before it is known.
- Separate commercial approval from operational scheduling.
- Show each team only the time-bound work it owns, while preserving one source of truth for the event.
- Prefer explicit service, dispatch, reset, and return labels over ambiguous "collection" language.
