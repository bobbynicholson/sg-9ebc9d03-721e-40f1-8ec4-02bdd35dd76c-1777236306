import type { NextApiRequest, NextApiResponse } from "next";
import { withApiRequestLogging } from "@/lib/withApiLogging";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isLocalAuthBypassEnabled } from "@/lib/localAuthBypass";

function n(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function feeFromGatewayResponse(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const row = value as Record<string, unknown>;
  for (const key of [
    "fee",
    "fees",
    "processing_fee",
    "processingFee",
    "transaction_fee",
    "transactionFee",
  ]) {
    if (typeof row[key] === "number" || typeof row[key] === "string")
      return Math.max(0, n(row[key]));
  }
  return 0;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const host = String(req.headers.host || "")
    .split(":")[0]
    .toLowerCase();
  if (
    !isLocalAuthBypassEnabled(host)
  ) {
    return res.status(404).json({ error: "Not found" });
  }

  const companyId =
    typeof req.query.company_id === "string" ? req.query.company_id : "";
  const from =
    typeof req.query.from === "string" ? req.query.from : "1900-01-01";
  const to = typeof req.query.to === "string" ? req.query.to : "2999-12-31";
  const viewMode = req.query.view === "all" ? "all" : "completed";
  if (!companyId)
    return res.status(400).json({ error: "company_id is required" });

  try {
    const db = getServiceSupabase() as any;
    const orderRows: any[] = [];
    let offset = 0;
    while (true) {
      let ordersQuery = db
        .from("orders")
        .select(
          "id, order_number, event_name, client_name, internal_notes, event_date, total_amount, quote_id, status, payment_status, deposit_paid, confirmed_at, cancelled_at, order_items(quantity, unit_cost, line_total)",
        )
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("event_date", from)
        .lte("event_date", to)
        .order("event_date", { ascending: false })
        .order("id", { ascending: false });
      ordersQuery = viewMode === "completed"
        ? ordersQuery.in("status", ["delivered", "completed"])
        : ordersQuery.neq("status", "cancelled");
      const { data: page, error: orderError } = await ordersQuery.range(offset, offset + 999);
      if (orderError) throw orderError;
      const pageRows = page || [];
      orderRows.push(...pageRows);
      if (pageRows.length < 1000) break;
      offset += pageRows.length;
    }
    const orderIds = orderRows.map((row: any) => row.id).filter(Boolean);
    const quoteIds = orderRows.map((row: any) => row.quote_id).filter(Boolean);
    if (!orderIds.length)
      return res.status(200).json({
        orders: [],
        quotes: [],
        shopping: [],
        hire: [],
        drivers: [],
        payments: [],
      });

    const [quotesRes, shoppingRes, hireRes, driverRes, paymentsRes] =
      await Promise.all([
        quoteIds.length
          ? db
              .from("quotes")
              .select("id, total_amount, total")
              .in("id", quoteIds)
          : { data: [], error: null },
        db
          .from("shopping_list_items")
          .select("source_order_id, actual_cost, estimated_cost, removed_at")
          .in("source_order_id", orderIds),
        db
          .from("equipment_hire_orders")
          .select("order_id, total_cost, status")
          .in("order_id", orderIds),
        db
          .from("driver_assignments")
          .select("order_id, total_earnings, base_fee, distance_fee")
          .in("order_id", orderIds),
        db
          .from("payments")
          .select("order_id, gateway_response, payment_status")
          .in("order_id", orderIds)
          .eq("payment_status", "completed"),
      ]);
    for (const result of [
      quotesRes,
      shoppingRes,
      hireRes,
      driverRes,
      paymentsRes,
    ]) {
      if (result.error) throw result.error;
    }
    return res.status(200).json({
      orders: orderRows,
      quotes: quotesRes.data || [],
      shopping: shoppingRes.data || [],
      hire: hireRes.data || [],
      drivers: driverRes.data || [],
      payments: paymentsRes.data || [],
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ error: error?.message || "Could not load event profitability." });
  }
}

export default withApiRequestLogging(handler);
