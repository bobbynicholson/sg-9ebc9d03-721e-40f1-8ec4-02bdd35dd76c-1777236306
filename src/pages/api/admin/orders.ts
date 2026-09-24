import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const host = String(req.headers.host || "")
    .split(":")[0]
    .toLowerCase();
  if (
    req.method !== "GET" ||
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1"].includes(host)
  ) {
    return res.status(404).json({ error: "Not found" });
  }

  const companyId =
    typeof req.query.company_id === "string" ? req.query.company_id : "";
  const orderId =
    typeof req.query.order_id === "string" ? req.query.order_id : "";
  if (!companyId)
    return res.status(400).json({ error: "company_id is required" });

  try {
    const db = getServiceSupabase() as any;
    let query = db
      .from("orders")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (orderId) query = query.eq("id", orderId);
    const { data: orders, error } = await query;
    if (error) throw error;

    const rows = (orders || []) as any[];
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

    return res.status(200).json({ orders: rows });
  } catch (error: any) {
    return res
      .status(500)
      .json({ error: error?.message || "Could not load orders." });
  }
}
