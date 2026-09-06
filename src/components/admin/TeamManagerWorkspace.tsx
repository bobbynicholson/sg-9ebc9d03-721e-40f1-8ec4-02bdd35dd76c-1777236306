import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Activity, BookOpen, Clock, Loader2, MessageSquare, Play, RefreshCw, Square, Users } from "lucide-react";

type Department = "kitchen" | "cleaning";
type TeamMember = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  active_role: string | null;
  status: { on_duty: boolean; started_at: string | null; shift_id: string | null; source: string | null };
};
type TeamNote = {
  id: string;
  body: string;
  note_date: string;
  created_at: string;
  author_name: string;
  member_name: string | null;
};

const roleLabel = (role: string | null) => String(role || "team member").replaceAll("_", " ");
const initials = (member: TeamMember) => (member.full_name || member.email || "?").split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
const elapsed = (start: string | null) => {
  if (!start) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
};

export function TeamManagerWorkspace({ department }: { department: Department }) {
  const { user } = useAuth() as any;
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteMember, setNoteMember] = useState("team");
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [tick, setTick] = useState(0);
  const [clockOutTarget, setClockOutTarget] = useState<TeamMember | null>(null);
  const [clockOutNote, setClockOutNote] = useState("");

  const title = department === "kitchen" ? "Kitchen team management" : "Cleaning team management";
  const teamName = department === "kitchen" ? "kitchen" : "cleaning";
  const sessionHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token
      ? { Authorization: `Bearer ${sessionData.session.access_token}` }
      : {};
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/team-management?department=${department}`, {
        credentials: "same-origin",
        headers: await sessionHeaders(),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load the team");
      setMembers(payload.members || []);
      setNotes(payload.notes || []);
      if (payload.diary_available === false) {
        setError("The diary database table is not available yet. Apply the latest Supabase migration to enable notes.");
      }
    } catch (loadError: any) {
      setError(loadError?.message || "Could not load the team");
    } finally {
      setLoading(false);
    }
  }, [department, sessionHeaders]);

  useEffect(() => { void load(); }, [load, tick]);

  useEffect(() => {
    const companyId = user?.company_id;
    if (!companyId) return;
    const channel = supabase
      .channel(`team-manager:${department}:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: department === "kitchen" ? "kitchen_duty_shifts" : "cleaning_duty_logs", filter: `company_id=eq.${companyId}` }, () => setTick((value) => value + 1))
      .on("postgres_changes", { event: "*", schema: "public", table: "team_manager_notes", filter: `company_id=eq.${companyId}` }, () => setTick((value) => value + 1))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [department, user?.company_id]);

  const onDuty = useMemo(() => members.filter((member) => member.status.on_duty).length, [members]);
  const submitClock = async (member: TeamMember, note?: string) => {
    const action = member.status.on_duty ? "clock_out" : "clock_in";
    if (action === "clock_out" && note === undefined) {
      setClockOutTarget(member);
      setClockOutNote("");
      return;
    }
    setSaving(`${action}:${member.id}`);
    try {
      const response = await fetch("/api/admin/team-management", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await sessionHeaders()) },
        credentials: "same-origin",
        body: JSON.stringify({ department, action, member_id: member.id, note: note || undefined }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Could not clock ${action === "clock_in" ? "in" : "out"}`);
      toast({ title: action === "clock_in" ? "Team member clocked in" : "Team member clocked out", description: `${member.full_name || member.email || "The team member"} was updated and notified.` });
      if (action === "clock_out") {
        setClockOutTarget(null);
        setClockOutNote("");
      }
      setTick((value) => value + 1);
    } catch (clockError: any) {
      toast({ title: "Clock update failed", description: clockError?.message || "Please try again", variant: "destructive" });
    } finally { setSaving(null); }
  };

  const saveNote = async () => {
    if (!noteBody.trim()) {
      toast({ title: "Add a note first", description: "Write what happened or what work was completed.", variant: "destructive" });
      return;
    }
    setSaving("note");
    try {
      const response = await fetch("/api/admin/team-management", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await sessionHeaders()) },
        credentials: "same-origin",
        body: JSON.stringify({ department, action: "add_note", member_id: noteMember === "team" ? null : noteMember, note_date: noteDate, body: noteBody }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save the note");
      toast({ title: "Diary note saved", description: "The manager note is now recorded for this team." });
      setNoteBody("");
      setNoteMember("team");
      setTick((value) => value + 1);
    } catch (noteError: any) {
      toast({ title: "Could not save note", description: noteError?.message || "Please try again", variant: "destructive" });
    } finally { setSaving(null); }
  };

  return (
    <section className="mb-8 space-y-4" aria-labelledby={`${department}-manager-workspace`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-primary">Manager workspace</p>
          <h2 id={`${department}-manager-workspace`} className="mt-1 text-xl font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">See everyone assigned to {teamName}, manage live clock status, and keep the daily work diary.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setTick((value) => value + 1)} disabled={loading} className="gap-2">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Team members</p><p className="mt-1 text-2xl font-semibold text-slate-900">{members.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">On duty now</p><p className="mt-1 text-2xl font-semibold text-emerald-700">{onDuty}</p></CardContent></Card>
        <Card className="col-span-2 sm:col-span-1"><CardContent className="p-4"><p className="text-xs text-slate-500">Diary notes</p><p className="mt-1 text-2xl font-semibold text-slate-900">{notes.length}</p></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-brand-primary" /> {department === "kitchen" ? "Kitchen" : "Cleaning"} roster</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {loading && members.length === 0 ? <div className="flex items-center justify-center py-10 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading team members...</div> : members.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No active users are assigned to this team yet. Assign a {department}_staff or {department}_manager role from Users & roles.</div> : members.map((member) => {
              const busy = saving === `clock_in:${member.id}` || saving === `clock_out:${member.id}`;
              const managerMember = member.active_role === `${department}_manager` || member.role === `${department}_manager`;
              return <div key={member.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${member.status.on_duty ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{initials(member)}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{member.full_name || "Unnamed user"}</p><p className="truncate text-xs text-slate-500">{member.email || "No email"} · {roleLabel(member.active_role || member.role)}</p><p className={`mt-1 flex items-center gap-1 text-xs ${member.status.on_duty ? "text-emerald-700" : "text-slate-500"}`}>{member.status.on_duty ? <><Activity className="h-3 w-3" /> On duty{member.status.started_at ? ` · ${elapsed(member.status.started_at)}` : ""}</> : <><Clock className="h-3 w-3" /> Off duty</>}</p></div></div>
                {managerMember ? <span className="max-w-[220px] text-right text-xs text-slate-500">Manager work is tracked from the manager portal, not as a crew shift.</span> : <Button size="sm" variant={member.status.on_duty ? "destructive" : "default"} disabled={busy} onClick={() => void submitClock(member)} className="shrink-0 gap-2">{member.status.on_duty ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{busy ? "Updating..." : member.status.on_duty ? "Clock out" : "Clock in"}</Button>}
              </div>;
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-4 w-4 text-brand-primary" /> Daily work diary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">Record completed work, handovers, issues, or follow-ups. Notes are stored for the {teamName} team.</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><label className="text-xs font-medium text-slate-700">Date<input type="date" value={noteDate} onChange={(event) => setNoteDate(event.target.value)} className="mt-1 block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm" /></label><label className="text-xs font-medium text-slate-700">For<input type="hidden" value={noteMember} readOnly /><Select value={noteMember} onValueChange={setNoteMember}><SelectTrigger className="mt-1"><SelectValue placeholder="Whole team" /></SelectTrigger><SelectContent><SelectItem value="team">Whole team</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email || "Team member"}</SelectItem>)}</SelectContent></Select></label></div>
            <Textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="Example: Deep-cleaned the prep area, checked chemical stock, and handed over the late return..." rows={5} maxLength={4000} />
            <div className="flex justify-end"><Button onClick={() => void saveNote()} disabled={saving === "note" || !noteBody.trim()} className="gap-2">{saving === "note" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />} Save note</Button></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4 text-brand-primary" /> Recent notes</CardTitle></CardHeader>
        <CardContent>{notes.length === 0 ? <p className="py-5 text-center text-sm text-slate-500">No diary notes yet.</p> : <div className="space-y-3">{notes.slice(0, 12).map((note) => <div key={note.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3"><div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><Badge variant="outline" className="capitalize">{note.member_name || "Whole team"}</Badge><span>{new Date(`${note.note_date}T12:00:00`).toLocaleDateString()}</span><span>by {note.author_name}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{note.body}</p></div>)}</div>}</CardContent>
      </Card>
      <p className="text-xs text-slate-500">Clock changes are saved to the live {department === "kitchen" ? "kitchen duty" : "cleaning duty"} record and the affected user receives an in-app notification.</p>
      <a className="sr-only" href={withSlug(department === "kitchen" ? "/team-portal/kitchen/duty" : "/team-portal/cleaning/dashboard")}>Open {teamName} staff portal</a>

      <Dialog open={!!clockOutTarget} onOpenChange={(open) => { if (!open && !saving) { setClockOutTarget(null); setClockOutNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clock out {clockOutTarget?.full_name || "team member"}</DialogTitle>
            <DialogDescription>What work did they complete during this {teamName} shift? Choose a quick answer or add a note. A blank note saves the default.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick answers</p>
            <div className="flex flex-wrap gap-2">
              {["Completed the assigned work.", "Finished the current task and handed it over.", "No additional work to report.", "Clocked out by mistake; no work completed."].map((suggestion) => (
                <Button key={suggestion} type="button" variant="outline" size="sm" onClick={() => setClockOutNote(suggestion)} className="text-left text-xs">{suggestion}</Button>
              ))}
            </div>
          </div>
          <Textarea value={clockOutNote} onChange={(event) => setClockOutNote(event.target.value)} rows={4} placeholder="Describe the work completed or handover..." autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setClockOutTarget(null); setClockOutNote(""); }} disabled={!!saving}>Cancel</Button>
            <Button onClick={() => clockOutTarget && void submitClock(clockOutTarget, clockOutNote)} disabled={!!saving} variant="destructive">{saving ? "Saving..." : "Clock out"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
