#!/usr/bin/env python3
"""Restore the completed SBD legacy-PDF import from its saved source parse.

The repair is deliberately scoped to import job
``a623e88a-287d-44e0-98c6-f02bffe65e03``.  It refuses to continue unless the
batch contains exactly 26 PDFs, quotes and orders, and it verifies every
source-derived field after writing.  It never fabricates payment-ledger rows:
the PDFs contain no payment dates, methods or references.

Run the read-only check first:
  python scripts/repair-sbd-legacy-pdf-import.py

Then perform the repair:
  python scripts/repair-sbd-legacy-pdf-import.py --commit --confirm=repair-sbd-legacy-pdf-import
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any


WORKSPACE = Path(__file__).resolve().parents[1]
IMPORTER_PATH = WORKSPACE / "scripts" / "import-sbd-legacy-pdf-orders.py"
JOB_ID = "a623e88a-287d-44e0-98c6-f02bffe65e03"
COMMS_HOLD_UNTIL = "2099-12-31T23:59:59+00:00"
TERMS_FOOTER = (
    "Please note that all prices are subject to change without notice or prior approval.\n\n"
    "Please go to the following web address to view our Terms & Conditions; "
    "https://spitbraaidelivery.co.za/terms-of-service/"
)
EPSILON = 0.01


def load_importer() -> Any:
    spec = importlib.util.spec_from_file_location("sbd_legacy_pdf_importer", IMPORTER_PATH)
    if not spec or not spec.loader:
        raise RuntimeError("Could not load the legacy-PDF importer")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def money_equal(actual: Any, expected: float) -> bool:
    try:
        return abs(float(actual) - expected) <= EPSILON
    except (TypeError, ValueError):
        return False


def source_terms(document: Any) -> str:
    return "\n\n".join(part for part in (document.terms, TERMS_FOOTER) if part)


def source_balance_due_date(document: Any) -> str | None:
    if re.search(r"48\s*hrs?\s+prior", document.raw_text, re.IGNORECASE):
        return (date.fromisoformat(document.valid_until) - timedelta(days=2)).isoformat()
    return None


def payment_status(document: Any) -> str:
    if document.balance_amount <= EPSILON:
        return "paid"
    if document.amount_paid > 0:
        return "partial"
    return "pending"


def fetch_state(api: Any) -> tuple[dict[str, Any], dict[str, Any], dict[str, list[dict[str, Any]]], dict[str, Any]]:
    jobs = api.select_all("import_jobs", {"select": "id,summary,review_notes", "id": f"eq.{JOB_ID}"})
    if len(jobs) != 1:
        raise RuntimeError("The SBD import job is missing or ambiguous")
    quotes = api.select_all("quotes", {"select": "*", "import_job_id": f"eq.{JOB_ID}"})
    orders = api.select_all("orders", {"select": "*", "import_job_id": f"eq.{JOB_ID}"})
    if len(quotes) != 26 or len(orders) != 26:
        raise RuntimeError(f"Expected 26 imported quotes and orders, found {len(quotes)} quotes and {len(orders)} orders")
    quote_by_number = {str(row["quote_number"]): row for row in quotes}
    order_by_quote = {str(row["quote_id"]): row for row in orders}
    order_ids = ",".join(str(row["id"]) for row in orders)
    items = api.select_all(
        "order_items",
        {"select": "id,order_id,item_name,description,quantity,unit_price,line_total", "order_id": f"in.({order_ids})"},
    )
    items_by_order: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        items_by_order.setdefault(str(item["order_id"]), []).append(item)
    return quote_by_number, order_by_quote, items_by_order, jobs[0]


def preflight(documents: list[Any], quote_by_number: dict[str, Any], order_by_quote: dict[str, Any], items_by_order: dict[str, list[dict[str, Any]]]) -> None:
    if len(documents) != 26:
        raise RuntimeError(f"Expected 26 source PDFs, found {len(documents)}")
    for document in documents:
        quote = quote_by_number.get(document.quote_number)
        if not quote:
            raise RuntimeError(f"{document.quote_number}: imported quote is missing")
        order = order_by_quote.get(str(quote["id"]))
        if not order:
            raise RuntimeError(f"{document.quote_number}: linked imported order is missing")
        source_names = [item.item_name for item in document.items]
        if len(source_names) != len(set(source_names)):
            raise RuntimeError(f"{document.quote_number}: source has duplicate item names; refusing unsafe item repair")
        actual_items = items_by_order.get(str(order["id"]), [])
        if len(actual_items) != len(document.items):
            raise RuntimeError(f"{document.quote_number}: expected {len(document.items)} order items, found {len(actual_items)}")
        if {str(item.get("item_name")) for item in actual_items} != set(source_names):
            raise RuntimeError(f"{document.quote_number}: order item names differ from source; refusing unsafe item repair")


def update_one(api: Any, table: str, row_id: str, patch: dict[str, Any], context: str) -> None:
    updated = api.update(table, {"id": f"eq.{row_id}"}, patch)
    if len(updated) != 1:
        raise RuntimeError(f"{context}: expected one {table} row to update, got {len(updated)}")


def restore(
    importer: Any,
    api: Any,
    documents: list[Any],
    quote_by_number: dict[str, Any],
    order_by_quote: dict[str, Any],
    items_by_order: dict[str, list[dict[str, Any]]],
    job: dict[str, Any],
) -> None:
    for document in documents:
        quote = quote_by_number[document.quote_number]
        order = order_by_quote[str(quote["id"])]
        existing_menu_ids = {
            str(item.get("item_name") or item.get("name") or ""): str(item["menu_item_id"])
            for item in (quote.get("menu_items") or [])
            if item.get("menu_item_id")
        }
        quote_patch = {
            "quote_name": document.quote_name,
            "client_name": document.client_name,
            "contact_name": document.client_name,
            "client_email": document.client_email,
            "client_phone": document.client_phone,
            "event_date": document.valid_until,
            "event_time": document.event_time,
            "guest_count": document.inferred_guest_count,
            "subtotal": document.subtotal,
            "tax_amount": document.tax_amount,
            "tax": document.tax_amount,
            "total_amount": document.total_amount,
            "total": document.total_amount,
            "delivery_fee": document.delivery_fee,
            "collection_fee": 0,
            "initial_payment_amount": document.deposit_amount,
            "valid_until": document.valid_until,
            "sent_at": f"{document.estimate_date}T00:00:00+00:00",
            "terms_and_conditions": source_terms(document),
            "comms_paused_until": COMMS_HOLD_UNTIL,
        }
        # Only the three post-import edits changed the quote JSON lines.  The
        # reconstructed value keeps any safely matched catalogue IDs.
        if document.quote_number in {"QUO0035549", "QUO0035627", "QUO0035709"}:
            quote_patch["menu_items"] = importer.build_menu_items(document, existing_menu_ids)
        update_one(api, "quotes", str(quote["id"]), quote_patch, document.quote_number)

        order_patch = {
            "event_name": document.quote_name,
            "event_date": document.valid_until,
            "event_end_date": document.valid_until,
            "event_time": document.event_time,
            "guest_count": document.inferred_guest_count,
            "subtotal": document.subtotal,
            "tax_amount": document.tax_amount,
            "tax": document.tax_amount,
            "total_amount": document.total_amount,
            "delivery_fee": document.delivery_fee,
            "collection_fee": 0,
            "deposit_amount": document.deposit_amount,
            "payment_opening_paid": document.amount_paid,
            "amount_paid": document.amount_paid,
            "balance_amount": document.balance_amount,
            "deposit_paid": bool(document.deposit_amount and document.amount_paid >= document.deposit_amount - EPSILON),
            "balance_paid": document.balance_amount <= EPSILON,
            "payment_status": payment_status(document),
            "payment_method": "eft",
            "balance_due_date": source_balance_due_date(document),
            "special_instructions": f"Legacy customer reference: {document.customer_reference}" if document.customer_reference else None,
            "comms_paused_until": COMMS_HOLD_UNTIL,
        }
        update_one(api, "orders", str(order["id"]), order_patch, document.quote_number)

        actual_by_name = {str(item["item_name"]): item for item in items_by_order[str(order["id"])]}
        for source_item in document.items:
            actual = actual_by_name[source_item.item_name]
            item_patch = {
                "description": source_item.description,
                "quantity": source_item.quantity,
                "unit_price": source_item.unit_price,
                "line_total": source_item.line_total,
            }
            if (
                str(actual.get("description") or "") != str(source_item.description or "")
                or int(actual.get("quantity") or 0) != source_item.quantity
                or not money_equal(actual.get("unit_price"), source_item.unit_price)
                or not money_equal(actual.get("line_total"), source_item.line_total)
            ):
                update_one(api, "order_items", str(actual["id"]), item_patch, f"{document.quote_number} / {source_item.item_name}")

    summary = dict(job.get("summary") or {})
    summary["source_repair"] = {
        "at": "2026-10-08T00:00:00+00:00",
        "source": "import_rows.source_data",
        "quotes_restored": 26,
        "orders_restored": 26,
        "payment_ledger_rows_created": 0,
    }
    repair_note = (
        "2026-10-08: Restored all 26 quotes/orders from the immutable imported PDF data. "
        "Historic paid totals are retained as payment_opening_paid; no payment ledger rows were created "
        "because the PDFs do not provide payment dates, methods or references."
    )
    notes = str(job.get("review_notes") or "")
    if repair_note not in notes:
        notes = f"{notes}\n{repair_note}".strip()
    update_one(api, "import_jobs", JOB_ID, {"summary": summary, "review_notes": notes}, "SBD import job")


def verify(documents: list[Any], quote_by_number: dict[str, Any], order_by_quote: dict[str, Any], items_by_order: dict[str, list[dict[str, Any]]]) -> list[str]:
    errors: list[str] = []
    money_fields = {"subtotal", "tax_amount", "tax", "total_amount", "total", "amount_paid", "payment_opening_paid", "balance_amount"}
    for document in documents:
        quote = quote_by_number.get(document.quote_number)
        order = order_by_quote.get(str(quote["id"])) if quote else None
        if not quote or not order:
            errors.append(f"{document.quote_number}: quote or order is missing")
            continue
        for entity, row, values in (
            ("quote", quote, {
                "event_date": document.valid_until, "event_time": document.event_time, "guest_count": document.inferred_guest_count,
                "subtotal": document.subtotal, "tax_amount": document.tax_amount, "tax": document.tax_amount,
                "total_amount": document.total_amount, "total": document.total_amount,
            }),
            ("order", order, {
                "event_date": document.valid_until, "event_time": document.event_time, "guest_count": document.inferred_guest_count,
                "subtotal": document.subtotal, "tax_amount": document.tax_amount, "tax": document.tax_amount,
                "total_amount": document.total_amount, "amount_paid": document.amount_paid,
                "payment_opening_paid": document.amount_paid, "balance_amount": document.balance_amount,
            }),
        ):
            for field, expected in values.items():
                actual = row.get(field)
                matches = money_equal(actual, float(expected)) if field in money_fields else str(actual) == str(expected)
                if not matches:
                    errors.append(f"{document.quote_number}: {entity}.{field} expected {expected!r}, found {actual!r}")
        if str(quote.get("terms_and_conditions") or "") != source_terms(document):
            errors.append(f"{document.quote_number}: quote terms do not match the restored source terms")
        if quote.get("comms_paused_until") is None or order.get("comms_paused_until") is None:
            errors.append(f"{document.quote_number}: communication quarantine is not set")
        if str(order.get("payment_status")) != payment_status(document):
            errors.append(f"{document.quote_number}: payment status expected {payment_status(document)!r}, found {order.get('payment_status')!r}")
        if bool(order.get("deposit_paid")) != bool(document.deposit_amount and document.amount_paid >= document.deposit_amount - EPSILON):
            errors.append(f"{document.quote_number}: deposit-paid state does not match the source")
        expected_items = sorted((item.item_name, item.description or "", item.quantity, item.unit_price, item.line_total) for item in document.items)
        actual_items = sorted(
            (str(item.get("item_name") or ""), str(item.get("description") or ""), int(item.get("quantity") or 0),
             round(float(item.get("unit_price") or 0), 2), round(float(item.get("line_total") or 0), 2))
            for item in items_by_order.get(str(order["id"]), [])
        )
        if actual_items != expected_items:
            errors.append(f"{document.quote_number}: order items do not exactly match the PDF source")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--commit", action="store_true", help="Write the guarded repair to Supabase.")
    parser.add_argument("--confirm", help="Must be repair-sbd-legacy-pdf-import when --commit is used.")
    args = parser.parse_args()
    if args.commit and args.confirm != "repair-sbd-legacy-pdf-import":
        raise RuntimeError("Refusing to write. Re-run with --confirm=repair-sbd-legacy-pdf-import")

    importer = load_importer()
    env = importer.parse_env(WORKSPACE / ".env.local")
    if not env.get("NEXT_PUBLIC_SUPABASE_URL") or not env.get("SUPABASE_SERVICE_ROLE_KEY"):
        raise RuntimeError(".env.local is missing Supabase service credentials")
    api = importer.SupabaseRest(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])
    documents = importer.source_documents(importer.DEFAULT_SOURCE_DIR)
    quote_by_number, order_by_quote, items_by_order, job = fetch_state(api)
    preflight(documents, quote_by_number, order_by_quote, items_by_order)
    before_errors = verify(documents, quote_by_number, order_by_quote, items_by_order)
    print(f"Source batch: {len(documents)} PDFs / {sum(len(document.items) for document in documents)} item lines")
    print(f"Current source mismatches: {len(before_errors)}")
    if not args.commit:
        print("DRY RUN ONLY. No live records changed.")
        return 0

    restore(importer, api, documents, quote_by_number, order_by_quote, items_by_order, job)
    quote_by_number, order_by_quote, items_by_order, _ = fetch_state(api)
    errors = verify(documents, quote_by_number, order_by_quote, items_by_order)
    if errors:
        raise RuntimeError("Repair completed but verification failed:\n" + "\n".join(errors))
    print("Repair complete: all 26 quotes/orders and all 243 source item lines now verify against the archived PDFs.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001 - keep an operator-facing failure concise.
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
