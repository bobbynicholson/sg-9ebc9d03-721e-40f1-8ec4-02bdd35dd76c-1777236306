/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { cleanDailyOperationsTaskTitle } from "@/lib/dailyOperationsCopy";

export type DailyOperationsTarget = "kitchen" | "cleaning" | "both";
export type DailyOperationsTaskKind = "kitchen_cleaning" | "equipment_cleaning";
export type DailyOperationsScheduleMode = "every_day" | "selected_weekdays" | "staff_scheduled";

export interface DailyOperationsSettings {
  id?: string;
  company_id?: string;
  kitchen_cleaning_enabled: boolean;
  kitchen_cleaning_time: string;
  kitchen_cleaning_title: string;
  kitchen_cleaning_description: string;
  kitchen_cleaning_lead_hours: number;
  kitchen_cleaning_target: DailyOperationsTarget;
  kitchen_cleaning_schedule_mode: DailyOperationsScheduleMode;
  kitchen_cleaning_weekdays: number[];
  equipment_cleaning_enabled: boolean;
  equipment_cleaning_time: string;
  equipment_cleaning_title: string;
  equipment_cleaning_description: string;
  equipment_cleaning_lead_hours: number;
  equipment_cleaning_target: DailyOperationsTarget;
  equipment_cleaning_schedule_mode: DailyOperationsScheduleMode;
  equipment_cleaning_weekdays: number[];
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
  kitchen_cleaning_title: "Kitchen area cleaning",
  kitchen_cleaning_description: "Clean and reset the kitchen work area for service.",
  kitchen_cleaning_lead_hours: 2,
  kitchen_cleaning_target: "kitchen",
  kitchen_cleaning_schedule_mode: "staff_scheduled",
  kitchen_cleaning_weekdays: [1, 2, 3, 4, 5, 6, 0],
  equipment_cleaning_enabled: false,
  equipment_cleaning_time: "17:00",
  equipment_cleaning_title: "Kitchen equipment cleaning",
  equipment_cleaning_description: "Clean and sanitise equipment used to prepare food.",
  equipment_cleaning_lead_hours: 2,
  equipment_cleaning_target: "cleaning",
  equipment_cleaning_schedule_mode: "staff_scheduled",
  equipment_cleaning_weekdays: [1, 2, 3, 4, 5, 6, 0],
  admin_notifications_enabled: true,
};

function withoutLegacyFrequencyPrefix(settings: DailyOperationsSettings): DailyOperationsSettings {
  const next = { ...settings };
  next.kitchen_cleaning_title = cleanDailyOperationsTaskTitle("kitchen_cleaning", next.kitchen_cleaning_title);
  next.equipment_cleaning_title = cleanDailyOperationsTaskTitle("equipment_cleaning", next.equipment_cleaning_title);
  return next;
}

export async function getDailyOperationsSettings(companyId: string): Promise<DailyOperationsSettings> {
  const { data, error } = await (supabase as any)
    .from("company_daily_operations_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return withoutLegacyFrequencyPrefix({ ...DAILY_OPERATIONS_DEFAULTS, ...(data || {}), company_id: companyId });
}

export async function saveDailyOperationsSettings(
  companyId: string,
  settings: DailyOperationsSettings,
): Promise<DailyOperationsSettings> {
  const normalizedSettings = { ...settings };
  for (const prefix of ["kitchen_cleaning", "equipment_cleaning"] as const) {
    const mode = normalizedSettings[`${prefix}_schedule_mode`];
    const weekdays = Array.from(new Set(normalizedSettings[`${prefix}_weekdays`].map(Number)))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      .sort((a, b) => a - b);
    if (mode === "selected_weekdays" && weekdays.length === 0) {
      throw new Error("Select at least one weekday for each task using a weekday schedule.");
    }
    normalizedSettings[`${prefix}_weekdays`] = weekdays.length ? weekdays : DAILY_OPERATIONS_DEFAULTS[`${prefix}_weekdays`];
  }
  const payload = {
    ...normalizedSettings,
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
  return withoutLegacyFrequencyPrefix({ ...DAILY_OPERATIONS_DEFAULTS, ...(data || {}), company_id: companyId });
}

