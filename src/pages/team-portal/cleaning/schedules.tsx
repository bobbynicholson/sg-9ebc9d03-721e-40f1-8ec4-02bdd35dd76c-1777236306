import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Plus, Loader2, Clock } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Schedule {
  id: string;
  area_name: string | null;
  description: string | null;
  frequency: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  assigned_to: string | null;
  status: string | null;
  notes: string | null;
}

const statusTone: Record<string, string> = {
  pending:     "bg-slate-100 text-slate-700 border-slate-200",
  scheduled:   "bg-blue-100 text-blue-800 border-blue-200",
  in_progress: "bg-purple-100 text-purple-800 border-purple-200",
  completed:   "bg-emerald-100 text-emerald-800 border-emerald-200",
  overdue:     "bg-rose-100 text-rose-700 border-rose-200",
};

export default function CleaningSchedulesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [areaName, setAreaName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().slice(0, 10));
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cleaning_schedules")
        .select("*")
        .eq("company_id", user.company_id)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true })
        .limit(200)
        .returns<Schedule[]>();
      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      toast({ title: "Could not load schedules", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    items.forEach((s) => {
      const k = s.scheduled_date ?? "Unscheduled";
      if (!map[k]) map[k] = [];
      map[k].push(s);
    });
    return map;
  }, [items]);

  const openCreate = () => {
    setCreating(true);
    setAreaName("");
    setDescription("");
    setFrequency("daily");
    setScheduledDate(new Date().toISOString().slice(0, 10));
    setScheduledTime("09:00");
  };
  const closeCreate = () => setCreating(false);

  const saveCreate = async () => {
    if (!user?.id || !user?.company_id || !areaName.trim()) {
      toast({ title: "Area name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("cleaning_schedules").insert([{
        company_id: user.company_id,
        area_name: areaName.trim(),
        description: description.trim() || null,
        frequency,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime || null,
        status: "scheduled",
      }] as never);
      if (error) throw error;
      toast({ title: "Schedule created" });
      closeCreate();
      load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head><title>Cleaning Schedules - CateringMS</title></Head>
      <NoIndexMeta />
      <CleaningNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent flex items-center gap-3">
                <Calendar className="h-7 w-7 text-cyan-600" />
                Cleaning Schedules
              </h1>
              <p className="text-sm text-slate-600 mt-1">Recurring cleaning plan -- daily / weekly / monthly cadence per area</p>
            </div>
            <Button onClick={openCreate} className="bg-cyan-600 hover:bg-cyan-700">
              <Plus className="h-4 w-4 mr-2" />New schedule
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading...</div>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="text-center py-16 text-slate-500">
                <Calendar className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No schedules yet</p>
                <p className="text-xs mt-1">Click "New schedule" to add one</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([date, list]) => (
                <div key={date}>
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">{date} -- {list.length}</h2>
                  <Card>
                    <CardContent className="p-0">
                      <ul className="divide-y divide-slate-100">
                        {list.map((s) => (
                          <li key={s.id} className="p-4 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-slate-900">{s.area_name}</span>
                                {s.status && (
                                  <Badge variant="outline" className={`${statusTone[s.status] ?? "bg-slate-100 text-slate-700 border-slate-200"} text-xs capitalize`}>
                                    {s.status.replace("_", " ")}
                                  </Badge>
                                )}
                                {s.frequency && (
                                  <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-xs capitalize">{s.frequency}</Badge>
                                )}
                              </div>
                              {s.description && <p className="text-xs text-slate-600 mt-0.5">{s.description}</p>}
                            </div>
                            {s.scheduled_time && (
                              <span className="text-sm tabular-nums text-slate-500 flex items-center gap-1 flex-shrink-0">
                                <Clock className="h-3 w-3" />{s.scheduled_time.slice(0, 5)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={creating} onOpenChange={(o) => !o && closeCreate()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New cleaning schedule</DialogTitle>
            <DialogDescription>Add a recurring or one-off cleaning task</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="area">Area / item</Label>
              <Input id="area" value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="e.g. Main kitchen, Cold room, Walk-in fridge" autoFocus />
            </div>
            <div>
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional task detail" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="freq">Frequency</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger id="freq"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="once">One-off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dt">Date</Label>
                <Input id="dt" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="tm">Time</Label>
                <Input id="tm" type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreate} disabled={saving}>Cancel</Button>
            <Button onClick={saveCreate} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : "Create schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
