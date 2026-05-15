/**
 * MyShiftTodayCard -- Wave 42 Tier 3.
 *
 * Personal "your shifts today" card for the team-portal dashboards
 * (driver / kitchen / cleaning). Lists the user's own shifts for
 * today, with the same ShiftTasksChips inline rendering admins see
 * on /admin/*-schedule grids.
 *
 * Self-add task chips work for non-admins because Wave 42 Tier 1
 * added the staff_shift_tasks_self_write RLS policy.
 *
 * Self-hides when the user has no shifts today.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { ShiftTasksChips } from "@/components/admin/ShiftTasksChips";
import { AddShiftTaskModal } from "@/components/admin/AddShiftTaskModal";
import {
  listTasksForShifts,
  type ShiftTaskRow,
  type TaskType,
} from "@/services/staffShiftTasksService";

interface ShiftRow {
  id: string;
  shift_date: string;
  shift_type: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: string;
}

interface Props {
  /**
   * Restrict the rendered shifts + the AddShiftTask default to one
   * surface. Driver portal => 'delivery', kitchen => 'kitchen', etc.
   * Pass null/undefined to render every shift_type the user owns
   * today (a cross-role overview).
   */
  scopeShiftTypes?: string[] | null;
  defaultTaskType?: TaskType;
  /** Card title -- defaults to "Your shifts today". */
  title?: string;
}

const SHIFT_TONE: Record<string, string> = {
  kitchen: "border-orange-200 bg-orange-50",
  cleaning: "border-cyan-200 bg-cyan-50",
  kitchen_and_cleaning: "border-violet-200 bg-violet-50",
  delivery: "border-teal-200 bg-teal-50",
  general: "border-slate-200 bg-slate-50",
};

function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${h}:${m}`;
}

export function MyShiftTodayCard({
  scopeShiftTypes,
  defaultTaskType,
  title = "Your shifts today",
}: Props) {
  const { user } = useAuth();
  const userId = user?.id;
  const companyId = user?.company_id;
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [tasksByShift, setTasksByShift] = useState<Map<string, ShiftTaskRow[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [addTaskTarget, setAddTaskTarget] = useState<{ shiftId: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!userId || !companyId) return;
    setLoading(true);
    try {
      const todayIso = toLocalISO(new Date());
      let q = (supabase as any)
        .from("kitchen_shifts")
        .select("id, shift_date, shift_type, planned_start, planned_end, actual_start, actual_end, status")
        .eq("company_id", companyId)
        .eq("staff_id", userId)
        .eq("shift_date", todayIso)
        .is("deleted_at", null);
      if (scopeShiftTypes && scopeShiftTypes.length > 0) {
        q = q.in("shift_type", scopeShiftTypes);
      }
      const { data, error } = await q;
      if (error) {
        console.error("[MyShiftTodayCard] kitchen_shifts fetch failed:", error);
      }
      const rows = (data || []) as ShiftRow[];
      setShifts(rows);
      if (rows.length > 0) {
        const map = await listTasksForShifts(supabase as any, rows.map((r) => r.id));
        setTasksByShift(map);
      } else {
        setTasksByShift(new Map());
      }
    } finally {
      setLoading(false);
    }
  }, [userId, companyId, scopeShiftTypes]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!userId || !companyId) return null;
  if (loading) {
    return (
      <Card className="mb-6 border-0 shadow-md">
        <CardContent className="py-6 text-center text-sm text-slate-500">
          Loading your shifts...
        </CardContent>
      </Card>
    );
  }
  if (shifts.length === 0) return null;

  return (
    <>
      <Card className="mb-6 border-0 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="w-4 h-4 text-slate-600" />
            {title}
            <Badge variant="outline" className="ml-2 bg-slate-50">
              {shifts.length} shift{shifts.length === 1 ? "" : "s"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {shifts.map((s) => {
            const tone = SHIFT_TONE[s.shift_type] || SHIFT_TONE.general;
            const todayIso = toLocalISO(new Date());
            const isMissed =
              s.status === "missed" ||
              (s.shift_date < todayIso && !s.actual_start && s.status === "scheduled");
            return (
              <div
                key={s.id}
                className={`rounded-md border px-3 py-2 ${tone}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900 tabular-nums">
                    {s.planned_start
                      ? `${fmtTime(s.planned_start)} -- ${fmtTime(s.planned_end)}`
                      : "Open shift"}
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize bg-white">
                    {s.shift_type.replace(/_/g, " ")}
                  </Badge>
                </div>
                {isMissed ? (
                  <div className="text-[11px] text-red-700 font-medium mt-1 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Missed clock-in
                  </div>
                ) : s.actual_start ? (
                  <div className="text-[11px] text-emerald-700 mt-1 tabular-nums">
                    Clocked in
                    {s.actual_end ? " + out" : ""}
                  </div>
                ) : null}
                <ShiftTasksChips
                  tasks={tasksByShift.get(s.id) || []}
                  onAddClick={() => setAddTaskTarget({ shiftId: s.id })}
                  onChanged={refresh}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {addTaskTarget && companyId && (
        <AddShiftTaskModal
          open={!!addTaskTarget}
          onOpenChange={(o) => !o && setAddTaskTarget(null)}
          companyId={companyId}
          shiftId={addTaskTarget.shiftId}
          defaultType={defaultTaskType}
          actorUserId={userId}
          onCreated={() => {
            setAddTaskTarget(null);
            void refresh();
          }}
        />
      )}
    </>
  );
}
