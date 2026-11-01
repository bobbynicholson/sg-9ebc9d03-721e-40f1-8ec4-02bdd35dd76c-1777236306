import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { loadLatestDocumentAmountChanges } from "@/services/documentAmountChanges";
import { isLocalAuthBypassEnabled } from "@/lib/localAuthBypass";

const PAGE_ID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const PAGE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_STATUSES = new Set([
  "pending", "confirmed", "preparing", "ready", "in_transit",
  "delivered", "completed", "paused", "cancelled",
]);

function escapeLikeTerm(value: string): string {
  return value.replace(/[\\%_*]/g, "\\$&").replace(/"/g, "\\\"");
}

function validDate(value: string): boolean {
  if (!PAGE_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const host = String(req.headers.host || "")
    .split(":")[0]
    .toLowerCase();
  if (
    req.method !== "GET" ||
    !isLocalAuthBypassEnabled(host)
  ) {
    return res.status(404).json({ error: "Not found" });
  }

  const companyId =
    typeof req.query.company_id === "string" ? req.query.company_id : "";
  const orderId =
    typeof req.query.order_id === "string" ? req.query.order_id : "";
  if (!companyId)
    return res.status(400).json({ error: "company_id is required" });
  if (!PAGE_ID_PATTERN.test(companyId))
    return res.status(400).json({ error: "Invalid company_id" });
  if (orderId && !PAGE_ID_PATTERN.test(orderId))
    return res.status(400).json({ error: "Invalid order_id" });

  try {
    const db = getServiceSupabase() as any;
    const requestedLimit = Number(req.query.limit ?? 25);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100)
      return res.status(400).json({ error: "limit must be between 1 and 100" });

    const status = typeof req.query.status === "string" ? req.query.status : "all";
    if (
      !orderId &&
      status !== "all" &&
      status !== "pending-amendments" &&
      status !== "pending-cancellations" &&
      !PAGE_STATUSES.has(status)
    ) {
      return res.status(400).json({ error: "Invalid status filter" });
    }

    let query = db
      .from("orders")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null);

    let hasMore = false;
    let nextCursor: { createdAt: string | null; id: string } | null = null;
    let fetchLimit = requestedLimit;
    if (orderId) {
      query = query.eq("id", orderId);
      fetchLimit = 1;
    } else {
      if (status === "pending-amendments" || status === "pending-cancellations") {
        const table = status === "pending-amendments"
          ? "order_amendment_requests"
          : "cancellation_requests";
        const { data: requests, error: requestError } = await db
          .from(table)
          .select("order_id")
          .eq("company_id", companyId)
          .eq("status", "pending");
        if (requestError) throw requestError;
        const pendingIds = [...new Set(
          ((requests || []) as Array<{ order_id?: string | null }>)
            .map((row) => row.order_id)
            .filter((id): id is string => !!id),
        )];
        if (pendingIds.length === 0) {
          return res.status(200).json({
            orders: [],
            amount_changes: {},
            has_more: false,
            next_cursor: null,
          });
        }
        query = query.in("id", pendingIds);
      } else if (status === "all") {
        query = query.neq("status", "cancelled");
      } else {
        query = query.eq("status", status);
      }

      const search = typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, 120)
        : "";
      if (search) {
        const pattern = `"%${escapeLikeTerm(search)}%"`;
        const clauses = [
          `client_name.ilike.${pattern}`,
          `order_number.ilike.${pattern}`,
          `venue_address.ilike.${pattern}`,
          `event_name.ilike.${pattern}`,
        ];
        if (PAGE_ID_PATTERN.test(search)) clauses.push(`id.eq.${search}`);
        query = query.or(clauses.join(","));
      }

      const dateFrom = typeof req.query.event_date_from === "string" ? req.query.event_date_from : "";
      const dateTo = typeof req.query.event_date_to === "string" ? req.query.event_date_to : "";
      if ((dateFrom && !validDate(dateFrom)) || (dateTo && !validDate(dateTo))) {
        return res.status(400).json({ error: "Invalid event date filter" });
      }
      if (dateFrom) query = query.gte("event_date", dateFrom);
      if (dateTo) query = query.lte("event_date", dateTo);

      const clientId = typeof req.query.client_id === "string" ? req.query.client_id : "";
      const regionId = typeof req.query.region_id === "string" ? req.query.region_id : "";
      const assignedUserId = typeof req.query.assigned_user_id === "string" ? req.query.assigned_user_id : "";
      for (const [name, value] of [
        ["client_id", clientId],
        ["region_id", regionId],
        ["assigned_user_id", assignedUserId],
      ]) {
        if (value && !PAGE_ID_PATTERN.test(value)) {
          return res.status(400).json({ error: `Invalid ${name}` });
        }
      }
      if (clientId) query = query.eq("client_id", clientId);
      if (regionId) query = query.or(`region_id.eq.${regionId},region_id.is.null`);
      if (assignedUserId) {
        query = query.or(
          `assigned_chef_id.eq.${assignedUserId},assigned_driver_id.eq.${assignedUserId}`,
        );
      }

      const cursorId = typeof req.query.cursor_id === "string" ? req.query.cursor_id : "";
      const cursorCreatedAt = typeof req.query.cursor_created_at === "string"
        ? req.query.cursor_created_at
        : null;
      if (cursorId) {
        if (!PAGE_ID_PATTERN.test(cursorId))
          return res.status(400).json({ error: "Invalid order page cursor" });
        if (
          cursorCreatedAt !== null &&
          (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(cursorCreatedAt) ||
            !Number.isFinite(Date.parse(cursorCreatedAt)))
        ) {
          return res.status(400).json({ error: "Invalid order page cursor" });
        }
        query = cursorCreatedAt === null
          ? query.is("created_at", null).lt("id", cursorId)
          : query.or(
              `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId}),created_at.is.null`,
            );
      } else if (cursorCreatedAt !== null) {
        return res.status(400).json({ error: "Invalid order page cursor" });
      }

      fetchLimit = requestedLimit + 1;
    }

    const { data: fetchedOrders, error } = await query
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(fetchLimit);
    if (error) throw error;

    const fetchedRows = (fetchedOrders || []) as any[];
    if (!orderId) {
      hasMore = fetchedRows.length > requestedLimit;
      const pageRows = fetchedRows.slice(0, requestedLimit);
      const lastOrder = pageRows[pageRows.length - 1];
      nextCursor = hasMore && lastOrder
        ? {
            createdAt: lastOrder.created_at ? String(lastOrder.created_at) : null,
            id: String(lastOrder.id),
          }
        : null;
    }
    const rows = orderId ? fetchedRows : fetchedRows.slice(0, requestedLimit);
    const ids = rows.map((row) => row.id).filter(Boolean);
    if (ids.length) {
      const { data: items } = await db
        .from("order_items")
        .select("*")
        .in("order_id", ids);
      const itemsByOrder = new Map<string, any[]>();
      for (const item of (items || []) as any[]) {
        const list = itemsByOrder.get(item.order_id) || [];
        list.push(item);
        itemsByOrder.set(item.order_id, list);
      }
      for (const row of rows) row.order_items = itemsByOrder.get(row.id) || [];
    }

    // The local admin page deliberately gets its order list through this
    // service-backed route. Its amount-change badges must use the same
    // authorized data path: querying audit_logs again from the browser can
    // be blocked by RLS when a local role has no hydrated session yet.
    const amountChanges = await loadLatestDocumentAmountChanges(db, companyId, ids);
    return res.status(200).json({
      orders: rows,
      amount_changes: Object.fromEntries(amountChanges),
      has_more: hasMore,
      next_cursor: nextCursor,
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ error: error?.message || "Could not load orders." });
  }
}
