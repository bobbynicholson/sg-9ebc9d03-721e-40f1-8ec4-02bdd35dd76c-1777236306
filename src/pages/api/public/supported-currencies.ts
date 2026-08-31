import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { currencyMonitoringService } from "@/services/currencyMonitoringService";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ code: "METHOD_NOT_ALLOWED", error: "Method not allowed" });
  }

  try {
    const currencies = await currencyMonitoringService.getSupportedCurrencies(getServiceSupabase());
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.status(200).json({ currencies, as_of: new Date().toISOString() });
  } catch (error) {
    console.error("[supported-currencies] load failed:", error);
    return res.status(503).json({
      code: "SUPPORTED_CURRENCIES_UNAVAILABLE",
      error: "Supported currencies are temporarily unavailable. Please try again.",
    });
  }
}
