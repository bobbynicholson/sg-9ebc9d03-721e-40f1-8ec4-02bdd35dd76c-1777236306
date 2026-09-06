/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";

export type DailyOperationsTarget = "kitchen" | "cleaning" | "both";
export type DailyOperationsTaskKind = "kitchen_cleaning" | "equipment_cleaning";

export interface DailyOperationsSettings {
  id?: string;
  company_id?: string;
  kitchen_cleaning_enabled: boolean;
  kitchen_cleaning_time: string;
  kitchen_cleaning_title: string;
  kitchen_cleaning_description: string;
  kitchen_cleaning_lead_hours: number;
  kitchen_cleaning_target: DailyOperationsTarget;
  equipment_cleaning_enabled: boolean;
  equipment_cleaning_time: string;
  equipment_cleaning_title: string;
  equipment_cleaning_description: string;
  equipment_cleaning_lead_hours: number;
  equipment_cleaning_target: DailyOperationsTarget;
  admin_notifications_enabled: boolean;
}

export interface DailyOperationsTask {
  id: string;
  company_id: string;
  task_kind: DailyOperationsTaskKind;
  task_date: string;
  scheduled_time: string;
  scheduled_at: string | null;
  title: string;
  description: string | null;
  target_roles: string[];
  status: "scheduled" | "in_progress" | "completed" | "skipped";
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
}

export const DAILY_OPERATIONS_DEFAULTS: DailyOperationsSettings = {
  kitchen_cleaning_enabled: false,
  kitchen_cleaning_time: "09:00",
  kitchen_cleaning_title: "Clean kitchen area",
  kitchen_cleaning_description: "Clean and reset the kitchen work area for the next service.",
  kitchen_cleaning_lead_hours: 2,
  kitchen_cleaning_target: "kitchen",
  equipment_cleaning_enabled: false,
  equipment_cleaning_time: "17:00",
  equipment_cleaning_title: "Clean kitchen equipment",
  equipment_cleaning_description: "Clean and sanitise the equipment used to prepare orders.",
  equipment_cleaning_lead_hours: 2,
  equipment_cleaning_target: "cleaning",
  admin_notifications_enabled: true,
};

export async function getDailyOperationsSettings(companyId: string): Promise<DailyOperationsSettings> {
  const { data, error } = await (supabase as any)
    .from("company_daily_operations_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return { ...DAILY_OPERATIONS_DEFAULTS, ...(data || {}), company_id: companyId };
}

export async function saveDailyOperationsSettings(
  companyId: string,
  settings: DailyOperationsSettings,
): Promise<DailyOperationsSettings> {
  const payload = {
    ...settings,
    company_id: companyId,
    kitchen_cleaning_lead_hours: Math.max(0, Math.min(72, Number(settings.kitchen_cleaning_lead_hours) || 0)),
    equipment_cleaning_lead_hours: Math.max(0, Math.min(72, Number(settings.equipment_cleaning_lead_hours) || 0)),
  };
  const { data, error } = await (supabase as any)
    .from("company_daily_operations_settings")
    .upsert(payload, { onConflict: "company_id" })
    .select("*")
    .single();
  if (error) throw error;
  return { ...DAILY_OPERATIONS_DEFAULTS, ...(data || {}), company_id: companyId };
}

