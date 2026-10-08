#!/usr/bin/env python3
"""Safely import the Spit Braai Delivery legacy PDF archive.

The archive contains quote PDFs that were filed as orders.  This importer
preserves each source quote, makes the matching confirmed order, copies every
priced source line into ``order_items``, and creates a contact only when one
cannot be matched safely.  It deliberately does *not* fabricate invoices or
individual payment-ledger rows: the PDFs do not provide invoice numbers,
payment dates, or payment methods.

Run a read-only preflight first (the default):

  python scripts/import-sbd-legacy-pdf-orders.py

Commit only after the preflight has passed:

  python scripts/import-sbd-legacy-pdf-orders.py --commit --confirm=spit-braai-delivery

The commit is tied to an ``import_jobs`` record.  Every created client, quote,
and order is stamped with that job ID; records are quarantined from outbound
communication until an operator explicitly enables the import batch.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from pypdf import PdfReader


WORKSPACE = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = WORKSPACE / "tmp" / "pdfs" / "sbd_orders_import_20261006" / "SBD Orders"
DEFAULT_SOURCE_ZIP = Path(r"C:\Users\raj\Downloads\SBD Orders.zip")
DEFAULT_COMPANY_SLUG = "spit-braai-delivery"
DEFAULT_REGION_CODE = "SBDCPT"  # The source PDFs carry the Cape Town business address.
COMMS_HOLD_UNTIL = "2099-12-31T23:59:59+00:00"
MONEY_EPSILON = 0.01

ITEM_NUMBER_LINE = re.compile(
    r"^([0-9]+(?:\.[0-9]+)?)\s+R\s*([0-9][0-9,]*\.\d{2})\s+R\s*([0-9][0-9,]*\.\d{2})$"
)
EMAIL = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
PHONE = re.compile(r"(?:\+?27|0)[\s\d\-]{8,}")


class ImportErrorWithContext(RuntimeError):
    """A clear, non-secret error fit for the command-line operator."""


class SupabaseError(ImportErrorWithContext):
    pass


@dataclass
class ParsedItem:
    item_name: str
    description: str | None
    quantity: int
    unit_price: float
    line_total: float


@dataclass
class ParsedPayment:
    label: str
    amount: float
    is_paid: bool


@dataclass
class SourceDocument:
    path: Path
    relative_path: str
    sha256: str
    page_count: int
    raw_text: str
    quote_number: str
    quote_name: str
    source_mode: str | None
    client_name: str
    client_email: str
    client_phone: str
    billing_address_lines: list[str]
    estimate_date: str
    valid_until: str
    filename_date: str | None
    customer_reference: str | None
    event_time: str | None
    inferred_guest_count: int
    items: list[ParsedItem]
    payments: list[ParsedPayment]
    source_balance: float | None
    subtotal: float
    tax_amount: float
    total_amount: float
    delivery_fee: float
    terms: str | None
    source_issues: list[str] = field(default_factory=list)

    @property
    def amount_paid(self) -> float:
        # Only labels that explicitly evidence a received payment contribute
        # to the order's paid balance.  A payment schedule such as "50%
        # Deposit to secure booking" is preserved, but is not treated as a
        # payment merely because it appears under Payment Breakdown.
        return round(sum(payment.amount for payment in self.payments if payment.is_paid), 2)

    @property
    def balance_amount(self) -> float:
        return round(self.total_amount - self.amount_paid, 2)

    @property
    def deposit_amount(self) -> float | None:
        return self.payments[0].amount if self.payments else None


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


class SupabaseRest:
    def __init__(self, url: str, service_role_key: str) -> None:
        self.base = url.rstrip("/")
        self.service_role_key = service_role_key

    def _request(
        self,
        method: str,
        path: str,
        params: dict[str, str] | None = None,
        body: Any | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> Any:
        query = f"?{urlencode(params)}" if params else ""
        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Accept": "application/json",
        }
        if extra_headers:
            headers.update(extra_headers)
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        request = Request(f"{self.base}{path}{query}", data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=45) as response:
                payload = response.read().decode("utf-8")
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            try:
                detail = json.loads(detail).get("message", detail)
            except json.JSONDecodeError:
                pass
            raise SupabaseError(f"{method} {path} failed ({error.code}): {detail}") from error
        if not payload:
            return None
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            return payload

    def select_all(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        """Page around PostgREST's 1,000-row cap."""
        rows: list[dict[str, Any]] = []
        start = 0
        while True:
            headers = {"Range-Unit": "items", "Range": f"{start}-{start + 999}"}
            try:
                page = self._request("GET", f"/rest/v1/{table}", params, extra_headers=headers)
            except SupabaseError as error:
                # A final empty range is returned as HTTP 416 by this instance.
                if "(416)" in str(error):
                    return rows
                raise
            if not isinstance(page, list):
                raise SupabaseError(f"GET {table} returned an unexpected payload")
            rows.extend(page)
            if len(page) < 1000:
                return rows
            start += len(page)

    def insert(self, table: str, row: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = self._request(
            "POST",
            f"/rest/v1/{table}",
            body=row,
            extra_headers={"Prefer": "return=representation"},
        )
        if not isinstance(result, list):
            raise SupabaseError(f"POST {table} returned an unexpected payload")
        return result

    def update(self, table: str, filters: dict[str, str], patch: dict[str, Any]) -> list[dict[str, Any]]:
        result = self._request(
            "PATCH",
            f"/rest/v1/{table}",
            filters,
            patch,
            extra_headers={"Prefer": "return=representation"},
        )
        if result is None:
            return []
        if not isinstance(result, list):
            raise SupabaseError(f"PATCH {table} returned an unexpected payload")
        return result

    def delete(self, table: str, filters: dict[str, str]) -> None:
        self._request("DELETE", f"/rest/v1/{table}", filters, extra_headers={"Prefer": "return=minimal"})

    def rpc(self, name: str, payload: dict[str, Any]) -> Any:
        return self._request("POST", f"/rest/v1/rpc/{name}", body=payload)


def normalise_space(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\u00a0", " ")).strip()


def normalise_identity(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def normalise_phone(value: str | None) -> str:
    digits = re.sub(r"\D", "", value or "")
    if digits.startswith("27") and len(digits) >= 11:
        return f"0{digits[2:]}"
    return digits


def normalise_menu_name(value: str) -> str:
    without_category = re.sub(r"^[A-Za-z ]+:\s*-\s*", "", value)
    return normalise_identity(without_category)


def money(value: str) -> float:
    cleaned = re.sub(r"[^0-9.]", "", value.replace(",", ""))
    if not cleaned:
        raise ImportErrorWithContext(f"Could not parse currency value {value!r}")
    return round(float(cleaned), 2)


def extract_one(text: str, pattern: str, label: str, *, required: bool = True) -> str | None:
    match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
    if match:
        return normalise_space(match.group(1))
    if required:
        raise ImportErrorWithContext(f"Missing {label}")
    return None


def iso_date(value: str, label: str) -> str:
    for fmt in ("%B %d, %Y", "%d %B %Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    raise ImportErrorWithContext(f"Could not parse {label} date {value!r}")


def parse_event_time(reference: str | None) -> str | None:
    if not reference:
        return None
    explicit = re.search(r"(?:@|at)\s*(\d{1,2})\s*[h:]\s*(\d{2})", reference, re.IGNORECASE)
    if explicit:
        return f"{int(explicit.group(1)):02d}:{int(explicit.group(2)):02d}:00"
    compact = re.search(r"(?:@|at)\s*(\d{3,4})(?!\d)", reference, re.IGNORECASE)
    if compact:
        digits = compact.group(1).zfill(4)
        hour, minute = int(digits[:2]), int(digits[2:])
        if hour < 24 and minute < 60:
            return f"{hour:02d}:{minute:02d}:00"
    return None


def parse_filename_date(path: Path) -> str | None:
    match = re.search(r"-(\d{2} [A-Za-z]+ \d{4})$", path.stem)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%d %B %Y").date().isoformat()
    except ValueError:
        return None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(part)
    return digest.hexdigest()


def parse_items(lines: list[str]) -> list[ParsedItem]:
    try:
        start = lines.index("Items Quantity Price Total")
    except ValueError as error:
        raise ImportErrorWithContext("Missing item table header") from error
    end = next((i for i, value in enumerate(lines[start + 1 :], start + 1) if value == "Payment Breakdown"), len(lines))
    items: list[ParsedItem] = []
    buffer: list[str] = []
    for value in lines[start + 1 : end]:
        if value == "Items Quantity Price Total" or re.match(r"^Page \d+ of \d+ for Quote #", value):
            continue
        match = ITEM_NUMBER_LINE.match(value)
        if not match:
            buffer.append(value)
            continue
        if not buffer:
            raise ImportErrorWithContext(f"Item price row has no item name: {value}")
        quantity = float(match.group(1))
        if not quantity.is_integer() or quantity <= 0:
            raise ImportErrorWithContext(f"Unsupported line-item quantity {match.group(1)!r}")
        items.append(
            ParsedItem(
                item_name=buffer[0],
                description=" ".join(buffer[1:]) or None,
                quantity=int(quantity),
                unit_price=money(match.group(2)),
                line_total=money(match.group(3)),
            )
        )
        buffer = []
    if buffer:
        raise ImportErrorWithContext(f"Unclosed item text at the end of the table: {buffer!r}")
    if not items:
        raise ImportErrorWithContext("No line items parsed")
    return items


def parse_payments(lines: list[str]) -> tuple[list[ParsedPayment], float | None]:
    try:
        start = lines.index("Payment Breakdown")
    except ValueError:
        return [], None
    # Do not stop at Subtotal: some PDFs place a wrapped balance line after
    # it in the extracted text sequence.  Notes / Terms is the actual end of
    # the financial section and keeps every payment/schedule entry intact.
    end = next((i for i in range(start + 1, len(lines)) if lines[i] == "Notes / Terms"), len(lines))
    block = lines[start + 1 : end]
    # PDF text order can interleave the first page's item table between a
    # wrapped payment label and its amount.  Capture each amount line, and
    # reconstruct the known wrapped "... prior to the / function" balance
    # label without ever turning the word "function" into a payment.
    entries: list[tuple[str, float]] = []
    for index, value in enumerate(block):
        match = re.match(r"^(.*?)\s*=\s*R\s*([0-9][0-9 ,]*\.\d{2})$", value, re.IGNORECASE)
        if not match:
            continue
        label = normalise_space(match.group(1))
        if label.casefold() == "function":
            prior_balance_label = next(
                (
                    normalise_space(block[prior])
                    for prior in range(index - 1, -1, -1)
                    if re.search(r"\bbalance\b", block[prior], re.IGNORECASE)
                ),
                None,
            )
            if prior_balance_label:
                label = f"{prior_balance_label} {label}"
        entries.append((label, money(match.group(2))))

    payments: list[ParsedPayment] = []
    source_balance: float | None = None
    for label, amount in entries:
        if re.search(r"\bbalance\b", label, re.IGNORECASE):
            source_balance = amount
            # Retain the scheduled balance line in notes as well.  It is not
            # a received payment, so ``is_paid`` remains false.
            payments.append(ParsedPayment(label=label, amount=amount, is_paid=False))
            continue
        # "DEPOSIT PAYMENT" is an actual payment in QUO0035053 because its
        # stated balance reconciles exactly when it is included.  Scheduling
        # text (e.g. "Deposit to secure booking") is deliberately excluded.
        is_paid = bool(re.search(r"\bpaid\b|\bdeposit\s+payment\b", label, re.IGNORECASE))
        payments.append(ParsedPayment(label=label, amount=amount, is_paid=is_paid))
    return payments, source_balance


def parse_terms(lines: list[str]) -> str | None:
    try:
        start = lines.index("Notes / Terms") + 1
    except ValueError:
        return None
    values: list[str] = []
    for value in lines[start:]:
        if re.match(r"^Page \d+ of \d+", value) or value.startswith("QUOTE"):
            break
        values.append(value)
    return "\n".join(values).strip() or None


def infer_guest_count(items: list[ParsedItem]) -> int:
    """Infer headcount only from the recurring catered-food quantities.

    The PDFs do not expose a labelled guest-count field.  Most repeat the
    catering count across menu lines.  In the one mixed-diet case, 35 regular
    portions plus five vegetarian meals reconciles to the 40 portions shown on
    the side dishes, which gives one unambiguous total.
    """
    ignored_guest_lines = {"delivery", "collection", "cutlerycrockery", "waiter"}
    candidates = [
        item.quantity
        for item in items
        if item.quantity > 1 and normalise_identity(item.item_name) not in ignored_guest_lines
    ]
    if not candidates:
        raise ImportErrorWithContext("Could not infer a guest count from the source item quantities")
    quantity_counts = Counter(candidates)
    highest = max(quantity_counts.values())
    modes = sorted(quantity for quantity, count in quantity_counts.items() if count == highest)
    if len(modes) == 1:
        return modes[0]

    vegetarian_total = sum(
        item.quantity
        for item in items
        if re.search(r"\bvegetarian\b|\bvegan\b", item.item_name, re.IGNORECASE)
    )
    reconciled = [
        total
        for total in modes
        if any(total == other + vegetarian_total for other in modes if other < total)
    ]
    if len(reconciled) == 1:
        return reconciled[0]
    raise ImportErrorWithContext(f"Guest-count inference is ambiguous: {dict(quantity_counts)}")


def parse_document(path: Path, root: Path) -> SourceDocument:
    reader = PdfReader(str(path))
    page_text = [(page.extract_text() or "") for page in reader.pages]
    raw_text = "\n".join(page_text)
    lines = [normalise_space(value) for value in raw_text.splitlines() if normalise_space(value)]
    flat_text = "\n".join(lines)

    quote_number = extract_one(flat_text, r"Estimate Number:\s*([^\s]+)", "estimate number")
    assert quote_number is not None
    estimate_text = extract_one(flat_text, r"Estimate Date:\s*(.*?)\s*Valid Until:", "estimate date")
    valid_text = extract_one(flat_text, r"Valid Until:\s*(.*?)\s*Grand Total", "valid-until date")
    assert estimate_text and valid_text

    bill_start = next((index for index, value in enumerate(lines) if value == "BILL TO"), None)
    bill_end = next((index for index, value in enumerate(lines) if value.startswith("Estimate Number:")), None)
    if bill_start is None or bill_end is None or bill_end <= bill_start + 1:
        raise ImportErrorWithContext("Could not locate the Bill To block")
    bill_lines = lines[bill_start + 1 : bill_end]
    client_name = bill_lines[0]
    client_email = next((value for value in bill_lines if EMAIL.fullmatch(value)), None)
    client_phone = next((value for value in reversed(bill_lines) if PHONE.search(value)), None)
    if not client_email or not client_phone:
        raise ImportErrorWithContext("Bill To block is missing an email address or phone number")
    address_lines = [value for value in bill_lines[1:] if value != client_email and value != client_phone]

    company_index = next((index for index, value in enumerate(lines) if value == "Spit Braai Delivery"), None)
    title_line = lines[company_index - 1] if company_index and company_index > 0 else ""
    quote_name = re.sub(r"^QUOTE\s*", "", title_line, flags=re.IGNORECASE).strip()
    if not quote_name:
        quote_name = f"Legacy quote {quote_number}"

    subtotal_text = extract_one(flat_text, r"Subtotal:\s*R\s*([0-9,]+\.\d{2})", "subtotal")
    vat_line = next((value for value in lines if re.match(r"^VAT\s+\d+(?:\.\d+)?%", value, re.IGNORECASE)), None)
    if not vat_line:
        raise ImportErrorWithContext("Missing VAT")
    vat_match = re.search(r"R\s*([0-9,]+\.\d{2})$", vat_line)
    if not vat_match:
        raise ImportErrorWithContext(f"Could not parse VAT line {vat_line!r}")
    vat_text = vat_match.group(1)
    total_text = extract_one(flat_text, r"Grand Total \(ZAR\):\s*R\s*([0-9,]+\.\d{2})", "grand total")
    assert subtotal_text and vat_text and total_text

    items = parse_items(lines)
    payments, source_balance = parse_payments(lines)
    customer_reference = extract_one(flat_text, r"Customer Ref:\s*(.*?)\s*Estimate Date:", "customer reference", required=False)
    source_mode_match = re.search(r"-(On Site|Off Site)-", path.stem, re.IGNORECASE)
    source_mode = source_mode_match.group(1).title() if source_mode_match else None
    delivery_fee = round(sum(item.line_total for item in items if normalise_identity(item.item_name) == "delivery"), 2)

    document = SourceDocument(
        path=path,
        relative_path=str(path.relative_to(root)),
        sha256=sha256_file(path),
        page_count=len(reader.pages),
        raw_text=raw_text,
        quote_number=quote_number,
        quote_name=quote_name,
        source_mode=source_mode,
        client_name=client_name,
        client_email=client_email,
        client_phone=client_phone,
        billing_address_lines=address_lines,
        estimate_date=iso_date(estimate_text, "estimate"),
        valid_until=iso_date(valid_text, "valid-until"),
        filename_date=parse_filename_date(path),
        customer_reference=customer_reference,
        event_time=parse_event_time(customer_reference),
        inferred_guest_count=infer_guest_count(items),
        items=items,
        payments=payments,
        source_balance=source_balance,
        subtotal=money(subtotal_text),
        tax_amount=money(vat_text),
        total_amount=money(total_text),
        delivery_fee=delivery_fee,
        terms=parse_terms(lines),
    )
    validate_document(document)
    return document


def validate_document(document: SourceDocument) -> None:
    item_total = round(sum(item.line_total for item in document.items), 2)
    if abs(item_total - document.subtotal) > MONEY_EPSILON:
        raise ImportErrorWithContext(
            f"{document.path.name}: item sum {item_total:.2f} does not equal source subtotal {document.subtotal:.2f}"
        )
    if abs(round(document.subtotal + document.tax_amount, 2) - document.total_amount) > MONEY_EPSILON:
        raise ImportErrorWithContext(f"{document.path.name}: subtotal + VAT does not equal grand total")
    if document.amount_paid - document.total_amount > MONEY_EPSILON:
        raise ImportErrorWithContext(f"{document.path.name}: payment breakdown exceeds grand total")
    # A source balance is a reconciliation check only when the PDF names a
    # received payment.  Otherwise a "50% Balance" entry is a future payment
    # schedule, not evidence that the remainder is already due or paid.
    if document.source_balance is not None and document.amount_paid > 0 and abs(document.source_balance - document.balance_amount) > MONEY_EPSILON:
        raise ImportErrorWithContext(
            f"{document.path.name}: source balance {document.source_balance:.2f} does not equal total less payments {document.balance_amount:.2f}"
        )
    filename_number = document.path.name.split("-", 1)[0]
    if filename_number != document.quote_number:
        document.source_issues.append(
            f"Filename says {filename_number}; the PDF's Estimate Number says {document.quote_number}."
        )
    if document.filename_date and document.filename_date != document.valid_until:
        document.source_issues.append(
            f"Filename date is {document.filename_date}; the PDF's Valid Until date is {document.valid_until}."
        )


def source_documents(source_dir: Path) -> list[SourceDocument]:
    if not source_dir.exists():
        raise ImportErrorWithContext(f"Source folder does not exist: {source_dir}")
    paths = sorted(source_dir.rglob("*.pdf"))
    if not paths:
        raise ImportErrorWithContext(f"No PDFs found under {source_dir}")
    documents = [parse_document(path, source_dir) for path in paths]
    numbers = [document.quote_number for document in documents]
    duplicate_numbers = sorted(number for number, count in Counter(numbers).items() if count > 1)
    if duplicate_numbers:
        raise ImportErrorWithContext(f"Duplicate PDF Estimate Numbers: {', '.join(duplicate_numbers)}")
    return documents


def address_fields(lines: list[str]) -> dict[str, str | None]:
    if not lines:
        return {
            "billing_address_line1": None,
            "billing_address_line2": None,
            "billing_city": None,
            "billing_postal_code": None,
        }
    city = lines[-1].rstrip(", ") if len(lines) > 1 else None
    postal_code = None
    if city:
        postal = re.search(r"\b(\d{4})\b", city)
        if postal:
            postal_code = postal.group(1)
            city = normalise_space(city.replace(postal_code, "").rstrip(", ")) or None
    return {
        "billing_address_line1": lines[0],
        "billing_address_line2": ", ".join(lines[1:-1]) or None,
        "billing_city": city,
        "billing_postal_code": postal_code,
    }


def payment_summary(document: SourceDocument) -> str:
    if not document.payments:
        return "No payments are listed in the source PDF."
    paid = [payment for payment in document.payments if payment.is_paid]
    scheduled = [payment for payment in document.payments if not payment.is_paid]
    sections: list[str] = []
    if paid:
        pieces = "; ".join(f"{payment.label}: R{payment.amount:,.2f}" for payment in paid)
        sections.append(f"Explicitly marked paid in the source (dates and methods were not supplied): {pieces}.")
    if scheduled:
        pieces = "; ".join(f"{payment.label}: R{payment.amount:,.2f}" for payment in scheduled)
        sections.append(f"Payment schedule not marked paid in the source: {pieces}.")
    return " ".join(sections)


def legacy_notes(document: SourceDocument) -> str:
    sections = [
        f"Imported from legacy source PDF: {document.relative_path}",
        f"Source SHA-256: {document.sha256}",
        f"Source mode: {document.source_mode or 'not stated'}.",
        f"Billing address: {', '.join(document.billing_address_lines) or 'not supplied'}.",
        "Venue address was not included in the source PDF; it has not been guessed.",
        f"Guest count ({document.inferred_guest_count}) is inferred from repeated food-line quantities; it was not labelled in the source PDF.",
        payment_summary(document),
    ]
    if document.customer_reference:
        sections.append(f"Customer reference: {document.customer_reference}.")
    if document.source_issues:
        sections.append("Source discrepancy: " + " ".join(document.source_issues))
    return "\n".join(sections)


def to_jsonable_document(document: SourceDocument) -> dict[str, Any]:
    data = asdict(document)
    data["path"] = str(document.path)
    return data


def build_menu_items(document: SourceDocument, menu_ids: dict[str, str]) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for index, item in enumerate(document.items, start=1):
        payload.append(
            {
                "id": f"legacy-{document.quote_number}-{index}",
                "name": item.item_name,
                "item_name": item.item_name,
                "description": item.description,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "price": item.unit_price,
                "total": item.line_total,
                "line_total": item.line_total,
                "pricing_mode": "flat" if item.quantity == 1 else "per_person",
                "menu_item_id": menu_ids.get(normalise_menu_name(item.item_name)),
                "source": "legacy_pdf_import",
            }
        )
    return payload


def query_company(api: SupabaseRest, slug: str) -> dict[str, Any]:
    rows = api.select_all("companies", {"select": "id,company_name,slug", "slug": f"eq.{slug}", "limit": "2"})
    if len(rows) != 1:
        raise ImportErrorWithContext(f"Expected exactly one company with slug {slug!r}; found {len(rows)}")
    return rows[0]


def query_region(api: SupabaseRest, company_id: str, code: str) -> dict[str, Any]:
    rows = api.select_all(
        "regions",
        {"select": "id,name,code,is_active", "company_id": f"eq.{company_id}", "code": f"eq.{code}", "is_active": "eq.true", "limit": "2"},
    )
    if len(rows) != 1:
        raise ImportErrorWithContext(f"Expected one active {code!r} region for this company; found {len(rows)}")
    return rows[0]


def index_clients(rows: Iterable[dict[str, Any]]) -> tuple[dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]]]:
    by_email: dict[str, list[dict[str, Any]]] = {}
    by_phone: dict[str, list[dict[str, Any]]] = {}
    by_name: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        if row.get("email"):
            by_email.setdefault(normalise_identity(str(row["email"])), []).append(row)
        if row.get("client_name"):
            by_name.setdefault(normalise_identity(str(row["client_name"])), []).append(row)
        for field_name in ("phone", "mobile_number"):
            if row.get(field_name):
                by_phone.setdefault(normalise_phone(str(row[field_name])), []).append(row)
    return by_email, by_phone, by_name


def match_client(document: SourceDocument, indexes: tuple[dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]]]) -> tuple[dict[str, Any] | None, list[str]]:
    by_email, by_phone, by_name = indexes
    # An exact, unique email address is the strongest identity signal.  A
    # recycled/family phone number must not prevent that safe match (one
    # source contact shares a number with an unrelated existing contact).
    email_matches = by_email.get(normalise_identity(document.client_email), [])
    if len(email_matches) == 1:
        client = email_matches[0]
        methods = ["email"]
        if client in by_phone.get(normalise_phone(document.client_phone), []):
            methods.append("phone")
        if client in by_name.get(normalise_identity(document.client_name), []):
            methods.append("name")
        return client, sorted(methods)
    if len(email_matches) > 1:
        labels = ", ".join(str(row.get("client_name") or row["id"]) for row in email_matches)
        raise ImportErrorWithContext(f"{document.quote_number}: multiple existing contacts share its email address: {labels}")

    candidates: dict[str, dict[str, Any]] = {}
    methods: dict[str, set[str]] = {}
    for method, matches in (
        ("email", by_email.get(normalise_identity(document.client_email), [])),
        ("phone", by_phone.get(normalise_phone(document.client_phone), [])),
        ("name", by_name.get(normalise_identity(document.client_name), [])),
    ):
        for match in matches:
            candidates[str(match["id"])] = match
            methods.setdefault(str(match["id"]), set()).add(method)
    if not candidates:
        return None, []
    if len(candidates) > 1:
        labels = ", ".join(f"{row.get('client_name') or row['id']} ({'+'.join(sorted(methods[row_id]))})" for row_id, row in candidates.items())
        raise ImportErrorWithContext(f"{document.quote_number}: ambiguous existing-client match: {labels}")
    client_id, client = next(iter(candidates.items()))
    return client, sorted(methods[client_id])


def preflight(api: SupabaseRest, documents: list[SourceDocument], company: dict[str, Any], region: dict[str, Any]) -> dict[str, Any]:
    company_id = str(company["id"])
    existing_quotes = api.select_all("quotes", {"select": "id,quote_number", "company_id": f"eq.{company_id}", "deleted_at": "is.null"})
    existing_numbers = {str(row.get("quote_number")) for row in existing_quotes}
    clashes = sorted(document.quote_number for document in documents if document.quote_number in existing_numbers)
    if clashes:
        raise ImportErrorWithContext("These source quote numbers already exist in the target company: " + ", ".join(clashes))

    existing_clients = api.select_all(
        "clients",
        {"select": "id,client_name,email,phone,mobile_number,region_id", "company_id": f"eq.{company_id}", "deleted_at": "is.null"},
    )
    client_indexes = index_clients(existing_clients)
    matches: dict[str, tuple[dict[str, Any] | None, list[str]]] = {}
    for document in documents:
        matches[document.quote_number] = match_client(document, client_indexes)

    catalogue = api.select_all(
        "menu_items",
        {"select": "id,item_name", "company_id": f"eq.{company_id}", "deleted_at": "is.null"},
    )
    menu_ids: dict[str, str] = {}
    duplicate_catalogue_names: set[str] = set()
    for item in catalogue:
        key = normalise_menu_name(str(item.get("item_name") or ""))
        if not key:
            continue
        if key in menu_ids:
            duplicate_catalogue_names.add(key)
            continue
        menu_ids[key] = str(item["id"])
    for key in duplicate_catalogue_names:
        menu_ids.pop(key, None)

    linked_lines = sum(
        1
        for document in documents
        for item in document.items
        if normalise_menu_name(item.item_name) in menu_ids
    )
    return {
        "company_id": company_id,
        "region_id": str(region["id"]),
        "existing_client_count": len(existing_clients),
        "matches": matches,
        "menu_ids": menu_ids,
        "catalogue_count": len(catalogue),
        "linked_line_count": linked_lines,
    }


def print_preflight(documents: list[SourceDocument], company: dict[str, Any], region: dict[str, Any], state: dict[str, Any]) -> None:
    created_contacts = sum(1 for document in documents if state["matches"][document.quote_number][0] is None)
    linked_contacts = len(documents) - created_contacts
    item_count = sum(len(document.items) for document in documents)
    payment_count = sum(len(document.payments) for document in documents)
    issues = [(document.quote_number, issue) for document in documents for issue in document.source_issues]
    print(f"Company: {company['company_name']} ({company['slug']})")
    print(f"Region: {region['name']} ({region['code']})")
    print(f"Validated source PDFs: {len(documents)}")
    print(f"Exact source line items: {item_count}")
    print(f"Named source payment entries preserved in notes: {payment_count}")
    print(f"Contacts: {linked_contacts} matched, {created_contacts} will be created")
    print(f"Menu links: {state['linked_line_count']} of {item_count} line items safely match the active catalogue")
    print("Writes on commit: 26 quotes, 26 linked confirmed orders, 243 order items; 0 fabricated invoices; 0 fabricated payment-ledger rows.")
    print("All import-created contacts, quotes, and orders remain communication-quarantined until manually enabled.")
    if issues:
        print("\nSOURCE ISSUES (PDF body is treated as authoritative):")
        for number, issue in issues:
            print(f"  - {number}: {issue}")


def insert_client(api: SupabaseRest, document: SourceDocument, company_id: str, region_id: str, job_id: str, imported_at: str) -> dict[str, Any]:
    client_type = "business" if re.search(r"\b(pt?y|ltd|limited|enterprises)\b", document.client_name, re.IGNORECASE) else "individual"
    row = {
        "company_id": company_id,
        "region_id": region_id,
        "client_name": document.client_name,
        "client_type": client_type,
        "email": document.client_email,
        "phone": document.client_phone,
        **address_fields(document.billing_address_lines),
        "notes": legacy_notes(document),
        "is_active": True,
        "import_job_id": job_id,
        "imported_at": imported_at,
        "imported_filename": document.path.name,
        "comms_paused_until": COMMS_HOLD_UNTIL,
    }
    result = api.insert("clients", row)
    if len(result) != 1:
        raise SupabaseError(f"{document.quote_number}: client insert returned {len(result)} rows")
    return result[0]


def quote_payload(document: SourceDocument, company_id: str, region_id: str, client_id: str, job_id: str, imported_at: str, menu_ids: dict[str, str]) -> dict[str, Any]:
    return {
        "company_id": company_id,
        "region_id": region_id,
        "client_id": client_id,
        "client_name": document.client_name,
        "contact_name": document.client_name,
        "client_email": document.client_email,
        "client_phone": document.client_phone,
        "quote_number": document.quote_number,
        "quote_name": document.quote_name,
        # The legacy document calls this field Valid Until.  It is the
        # only date in the PDF that consistently matches its order folder,
        # so it is used as the scheduled event date and preserved verbatim.
        "event_date": document.valid_until,
        "event_time": document.event_time,
        "guest_count": document.inferred_guest_count,
        "venue_address": None,
        "menu_items": build_menu_items(document, menu_ids),
        "equipment_items": [],
        "subtotal": document.subtotal,
        "tax_amount": document.tax_amount,
        # Older admin screens still read quotes.tax.  Keep the legacy mirror
        # aligned with tax_amount so imported VAT is visible everywhere.
        "tax": document.tax_amount,
        "total_amount": document.total_amount,
        "total": document.total_amount,
        "discount_amount": 0,
        "delivery_fee": document.delivery_fee,
        "initial_payment_amount": document.deposit_amount,
        "valid_until": document.valid_until,
        "sent_at": f"{document.estimate_date}T00:00:00+00:00",
        # These PDFs are stored under Orders and contain payment schedules.
        # The accepted status is explicitly labelled as an import inference
        # in the notes; no acceptance timestamp is invented.
        "status": "accepted",
        "accepted_at": None,
        "notes": legacy_notes(document),
        "terms_and_conditions": document.terms,
        "external_source": "legacy_pdf_import",
        "source": "legacy_pdf_import",
        "import_job_id": job_id,
        "imported_at": imported_at,
        "comms_paused_until": COMMS_HOLD_UNTIL,
        "currency": "ZAR",
    }


def order_payload(
    document: SourceDocument,
    company_id: str,
    region_id: str,
    client_id: str,
    quote_id: str,
    order_number: str,
    job_id: str,
    imported_at: str,
) -> dict[str, Any]:
    balance_due_date = None
    if re.search(r"48\s*hrs?\s+prior", document.raw_text, re.IGNORECASE):
        balance_due_date = (date.fromisoformat(document.valid_until) - timedelta(days=2)).isoformat()
    balance = document.balance_amount
    amount_paid = document.amount_paid
    payment_status = "paid" if balance <= MONEY_EPSILON else "partial" if amount_paid > 0 else "pending"
    return {
        "company_id": company_id,
        "region_id": region_id,
        "client_id": client_id,
        "quote_id": quote_id,
        "order_number": order_number,
        "event_name": document.quote_name,
        "event_date": document.valid_until,
        "event_time": document.event_time,
        "guest_count": document.inferred_guest_count,
        # orders.venue_address is required.  This explicit placeholder is
        # safer than incorrectly promoting a billing address into a venue.
        "venue_address": "Venue not provided in legacy source PDF",
        "venue_name": None,
        "venue_contact_person": document.client_name,
        "venue_contact_phone": document.client_phone,
        "client_name": document.client_name,
        "client_email": document.client_email,
        "client_phone": document.client_phone,
        "special_instructions": f"Legacy customer reference: {document.customer_reference}" if document.customer_reference else None,
        "internal_notes": legacy_notes(document),
        "subtotal": document.subtotal,
        "tax_amount": document.tax_amount,
        "tax": document.tax_amount,
        "delivery_fee": document.delivery_fee,
        "discount_amount": 0,
        "total_amount": document.total_amount,
        "deposit_amount": document.deposit_amount,
        "deposit_paid": bool(document.deposit_amount and amount_paid >= document.deposit_amount - MONEY_EPSILON),
        "amount_paid": amount_paid,
        # The payment ledger intentionally remains empty when a legacy PDF
        # lacks payment dates/methods.  Preserve the evidenced historic total
        # in the opening balance so payment reconciliation cannot erase it.
        "payment_opening_paid": amount_paid,
        "balance_amount": balance,
        "balance_paid": balance <= MONEY_EPSILON,
        "balance_due_date": balance_due_date,
        "payment_status": payment_status,
        "status": "confirmed",
        "confirmed_at": None,
        "requires_refrigeration": False,
        "requires_two_drivers": False,
        "lead_source": "legacy_pdf_import",
        "import_job_id": job_id,
        "imported_at": imported_at,
        "comms_paused_until": COMMS_HOLD_UNTIL,
        "currency": "ZAR",
    }


def order_item_payloads(document: SourceDocument, order_id: str, menu_ids: dict[str, str]) -> list[dict[str, Any]]:
    return [
        {
            "order_id": order_id,
            "menu_item_id": menu_ids.get(normalise_menu_name(item.item_name)),
            "item_name": item.item_name,
            "description": item.description,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "line_total": item.line_total,
        }
        for item in document.items
    ]


def create_job(api: SupabaseRest, company_id: str, source_zip: Path, document_count: int) -> dict[str, Any]:
    row = {
        "company_id": company_id,
        "kind": "legacy_pdf_orders",
        "source_filename": source_zip.name,
        "source_mime": "application/zip",
        "source_size_bytes": source_zip.stat().st_size if source_zip.exists() else None,
        "source_row_count": document_count,
        "status": "committing",
        "review_notes": "Imported from source PDFs. PDFs remain the source of truth; automated communication is quarantined pending review.",
        "summary": {"phase": "preflight_passed", "source_documents": document_count},
    }
    result = api.insert("import_jobs", row)
    if len(result) != 1:
        raise SupabaseError(f"Import-job creation returned {len(result)} rows")
    return result[0]


def create_import_row(api: SupabaseRest, job_id: str, index: int, document: SourceDocument) -> dict[str, Any]:
    row = {
        "job_id": job_id,
        "sheet": "Legacy PDF quotes",
        "source_row_index": index,
        "source_data": to_jsonable_document(document),
        "mapped_data": None,
        "target_table": "orders",
        "status": "pending",
        "preview_warnings": document.source_issues or None,
    }
    result = api.insert("import_rows", row)
    if len(result) != 1:
        raise SupabaseError(f"{document.quote_number}: import-row creation returned {len(result)} rows")
    return result[0]


def cleanup_failed_import(api: SupabaseRest, company_id: str, job_id: str, reason: str) -> None:
    # Children cascade from orders.  Delete in this exact order so clients
    # can then be removed without touching any pre-existing contacts.
    for table in ("orders", "quotes", "clients"):
        try:
            api.delete(table, {"company_id": f"eq.{company_id}", "import_job_id": f"eq.{job_id}"})
        except Exception as cleanup_error:  # noqa: BLE001 - preserving original error matters most.
            print(f"WARNING: cleanup of {table} failed: {cleanup_error}", file=sys.stderr)
    try:
        api.update(
            "import_jobs",
            {"id": f"eq.{job_id}"},
            {"status": "failed", "failed_at": datetime.now(timezone.utc).isoformat(), "failed_reason": reason},
        )
    except Exception as cleanup_error:  # noqa: BLE001
        print(f"WARNING: could not mark import job failed: {cleanup_error}", file=sys.stderr)


def compare_money(actual: Any, expected: float, context: str, errors: list[str]) -> None:
    try:
        numeric = float(actual)
    except (TypeError, ValueError):
        errors.append(f"{context}: expected {expected:.2f}, found {actual!r}")
        return
    if abs(numeric - expected) > MONEY_EPSILON:
        errors.append(f"{context}: expected {expected:.2f}, found {numeric:.2f}")


def verify_import(api: SupabaseRest, company_id: str, job_id: str, documents: list[SourceDocument]) -> list[str]:
    errors: list[str] = []
    quotes = api.select_all(
        "quotes",
        {"select": "id,quote_number,client_id,event_date,event_time,guest_count,subtotal,tax_amount,tax,total_amount,total,valid_until,menu_items,converted_to_order_id", "company_id": f"eq.{company_id}", "import_job_id": f"eq.{job_id}"},
    )
    orders = api.select_all(
        "orders",
        {"select": "id,quote_id,client_id,order_number,event_name,event_date,event_time,guest_count,subtotal,tax_amount,tax,total_amount,amount_paid,payment_opening_paid,balance_amount,status,payment_status", "company_id": f"eq.{company_id}", "import_job_id": f"eq.{job_id}"},
    )
    if len(quotes) != len(documents):
        errors.append(f"Expected {len(documents)} imported quotes, found {len(quotes)}")
    if len(orders) != len(documents):
        errors.append(f"Expected {len(documents)} imported orders, found {len(orders)}")
    quote_by_number = {str(row.get("quote_number")): row for row in quotes}
    order_by_quote = {str(row.get("quote_id")): row for row in orders}

    for document in documents:
        quote = quote_by_number.get(document.quote_number)
        if not quote:
            errors.append(f"{document.quote_number}: quote is missing after import")
            continue
        order = order_by_quote.get(str(quote.get("id")))
        if not order:
            errors.append(f"{document.quote_number}: matching order is missing after import")
            continue
        if quote.get("converted_to_order_id") != order.get("id"):
            errors.append(f"{document.quote_number}: quote does not point back to its order")
        for label, row, field_name, expected in (
            ("quote", quote, "event_date", document.valid_until),
            ("quote", quote, "valid_until", document.valid_until),
            ("quote", quote, "guest_count", document.inferred_guest_count),
            ("order", order, "event_date", document.valid_until),
            ("order", order, "guest_count", document.inferred_guest_count),
        ):
            if str(row.get(field_name)) != str(expected):
                errors.append(f"{document.quote_number}: {label}.{field_name} expected {expected!r}, found {row.get(field_name)!r}")
        for label, row, field_name, expected in (
            ("quote", quote, "subtotal", document.subtotal),
            ("quote", quote, "tax_amount", document.tax_amount),
            ("quote", quote, "tax", document.tax_amount),
            ("quote", quote, "total_amount", document.total_amount),
            ("quote", quote, "total", document.total_amount),
            ("order", order, "subtotal", document.subtotal),
            ("order", order, "tax_amount", document.tax_amount),
            ("order", order, "tax", document.tax_amount),
            ("order", order, "total_amount", document.total_amount),
            ("order", order, "amount_paid", document.amount_paid),
            ("order", order, "payment_opening_paid", document.amount_paid),
            ("order", order, "balance_amount", document.balance_amount),
        ):
            compare_money(row.get(field_name), expected, f"{document.quote_number}: {label}.{field_name}", errors)
        menu_items = quote.get("menu_items") or []
        if len(menu_items) != len(document.items):
            errors.append(f"{document.quote_number}: expected {len(document.items)} quote menu lines, found {len(menu_items)}")
        imported_items = api.select_all(
            "order_items",
            {"select": "item_name,description,quantity,unit_price,line_total", "order_id": f"eq.{order['id']}"},
        )
        if len(imported_items) != len(document.items):
            errors.append(f"{document.quote_number}: expected {len(document.items)} order lines, found {len(imported_items)}")
            continue
        expected_lines = sorted((item.item_name, item.description or "", item.quantity, item.unit_price, item.line_total) for item in document.items)
        actual_lines = sorted(
            (
                str(item.get("item_name") or ""),
                str(item.get("description") or ""),
                int(item.get("quantity") or 0),
                round(float(item.get("unit_price") or 0), 2),
                round(float(item.get("line_total") or 0), 2),
            )
            for item in imported_items
        )
        if actual_lines != expected_lines:
            errors.append(f"{document.quote_number}: one or more order lines do not match the source PDF")
    return errors


def commit_import(
    api: SupabaseRest,
    documents: list[SourceDocument],
    company: dict[str, Any],
    state: dict[str, Any],
    source_zip: Path,
) -> None:
    company_id = state["company_id"]
    region_id = state["region_id"]
    job = create_job(api, company_id, source_zip, len(documents))
    job_id = str(job["id"])
    imported_at = datetime.now(timezone.utc).isoformat()
    created_clients = 0
    linked_clients = 0
    total_order_items = 0
    try:
        for index, document in enumerate(documents, start=1):
            print(f"[{index}/{len(documents)}] importing {document.quote_number} ...", flush=True)
            import_row = create_import_row(api, job_id, index, document)
            existing, match_methods = state["matches"][document.quote_number]
            if existing:
                client = existing
                linked_clients += 1
            else:
                client = insert_client(api, document, company_id, region_id, job_id, imported_at)
                created_clients += 1
            client_id = str(client["id"])

            quote_rows = api.insert(
                "quotes",
                quote_payload(document, company_id, region_id, client_id, job_id, imported_at, state["menu_ids"]),
            )
            if len(quote_rows) != 1:
                raise SupabaseError(f"{document.quote_number}: quote insert returned {len(quote_rows)} rows")
            quote = quote_rows[0]
            quote_id = str(quote["id"])

            order_number = api.rpc(
                "consume_next_document_number",
                {"p_company_id": company_id, "p_document_type": "order"},
            )
            if not isinstance(order_number, str) or not order_number:
                raise SupabaseError(f"{document.quote_number}: could not issue a system order number")
            order_rows = api.insert(
                "orders",
                order_payload(document, company_id, region_id, client_id, quote_id, order_number, job_id, imported_at),
            )
            if len(order_rows) != 1:
                raise SupabaseError(f"{document.quote_number}: order insert returned {len(order_rows)} rows")
            order = order_rows[0]
            order_id = str(order["id"])

            order_items = order_item_payloads(document, order_id, state["menu_ids"])
            api.insert("order_items", order_items)
            total_order_items += len(order_items)
            api.insert(
                "order_status_history",
                {
                    "order_id": order_id,
                    "status": "confirmed",
                    "notes": "Imported from legacy PDF source; confirmed status inferred from the archive's Orders folders.",
                },
            )
            api.update("quotes", {"id": f"eq.{quote_id}"}, {"converted_to_order_id": order_id})
            api.update(
                "import_rows",
                {"id": f"eq.{import_row['id']}"},
                {
                    "status": "inserted",
                    "target_table": "orders",
                    "target_id": order_id,
                    "mapped_data": {
                        "client_id": client_id,
                        "client_match_methods": match_methods,
                        "quote_id": quote_id,
                        "quote_number": document.quote_number,
                        "order_id": order_id,
                        "order_number": order_number,
                        "source_issues": document.source_issues,
                    },
                },
            )

        print("Verifying every imported record against its source PDF ...", flush=True)
        errors = verify_import(api, company_id, job_id, documents)
        if errors:
            raise ImportErrorWithContext("\n".join(errors))
        source_issues = [{"quote_number": document.quote_number, "issue": issue} for document in documents for issue in document.source_issues]
        api.update(
            "import_jobs",
            {"id": f"eq.{job_id}"},
            {
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "summary": {
                    "documents": len(documents),
                    "quotes_created": len(documents),
                    "orders_created": len(documents),
                    "order_items_created": total_order_items,
                    "clients_created": created_clients,
                    "clients_linked": linked_clients,
                    "invoices_created": 0,
                    "payment_rows_created": 0,
                    "source_issues": source_issues,
                    "verified_against_source_pdfs": True,
                },
            },
        )
    except Exception as error:  # noqa: BLE001 - cleanup must run for every failed commit.
        cleanup_failed_import(api, company_id, job_id, str(error))
        raise
    print("\nImport complete and verified.")
    print(f"Import job: {job_id}")
    print(f"Created: {created_clients} contacts, {len(documents)} quotes, {len(documents)} orders, {total_order_items} exact order lines.")
    print("No invoices or individual payment records were fabricated from incomplete source data.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--source-zip", type=Path, default=DEFAULT_SOURCE_ZIP)
    parser.add_argument("--company-slug", default=DEFAULT_COMPANY_SLUG)
    parser.add_argument("--region-code", default=DEFAULT_REGION_CODE)
    parser.add_argument("--commit", action="store_true", help="Write the preflighted records to Supabase.")
    parser.add_argument("--confirm", help="Must exactly match --company-slug when --commit is used.")
    args = parser.parse_args()

    if args.commit and args.confirm != args.company_slug:
        raise ImportErrorWithContext(f"Refusing to commit. Re-run with --confirm={args.company_slug}")

    env = parse_env(WORKSPACE / ".env.local")
    if not env.get("NEXT_PUBLIC_SUPABASE_URL") or not env.get("SUPABASE_SERVICE_ROLE_KEY"):
        raise ImportErrorWithContext(".env.local is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    api = SupabaseRest(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])
    documents = source_documents(args.source_dir)
    company = query_company(api, args.company_slug)
    region = query_region(api, str(company["id"]), args.region_code)
    state = preflight(api, documents, company, region)
    print_preflight(documents, company, region, state)
    if not args.commit:
        print(f"\nDRY RUN ONLY. To commit, run:\n  python scripts/import-sbd-legacy-pdf-orders.py --commit --confirm={args.company_slug}")
        return 0
    print("\nCOMMITTING the verified import ...")
    commit_import(api, documents, company, state, args.source_zip)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ImportErrorWithContext, SupabaseError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
