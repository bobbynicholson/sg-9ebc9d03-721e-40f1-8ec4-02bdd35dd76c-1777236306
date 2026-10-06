/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /account/achievements
 *
 * Universal points + achievements + leaderboard view. Any signed-in
 * user lands here from a `gamification_points` or `gamification_
 * achievement` notification. Powered entirely by the existing
 * gamificationService methods so it stays in sync with team activity.
 *
 * Highlight handling: `?highlight=points|achievement` and an optional
 * `&awardedAt=ISO` from the notification trigger an animated ring
 * around the most recent matching row so the operator's eye lands on
 * the entry that fired the alert.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalLayout } from "@/components/Layout";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { gamificationService } from "@/services/gamificationService";
import { PageWorkbench, PortalCard, PortalCardHeader, PortalHeader, StatTile } from "@/components/portal/ui";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trophy, Medal, Star, Sparkles, Crown } from "lucide-react";
import { format } from "date-fns";

interface PointEntry {
  id: string;
  points: number;
  action_type: string | null;
  action_description: string | null;
  awarded_at: string;
}

interface AchievementEntry {
  id: string;
  achievement_key: string;
  achievement_name: string;
  achievement_description: string | null;
  icon: string | null;
  unlocked_at: string;
}

interface LeaderboardEntry {
  user_id: string;
  full_name: string | null;
  role: string | null;
  total_points: number;
  rank: number;
  avatar_url?: string | null;
}

function AchievementsContent() {
  const router = useRouter();
  const { user } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [totalPoints, setTotalPoints] = useState(0);
  const [history, setHistory] = useState<PointEntry[]>([]);
  const [achievements, setAchievements] = useState<AchievementEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Highlight handling. The notification link adds ?highlight=points or
  // ?highlight=achievement so the most recent matching entry pulses
  // briefly when the operator arrives.
  const highlight = String(router.query.highlight || "");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [pts, hist, ach, lb] = await Promise.all([
          gamificationService.getUserPoints(user.id),
          gamificationService.getUserPointHistory(user.id, 50),
          gamificationService.getUserAchievements(user.id),
          gamificationService.getLeaderboard(undefined, 10),
        ]);
        if (cancelled) return;
        setTotalPoints(pts);
        setHistory(hist as any);
        setAchievements(ach as any);
        setLeaderboard(lb);
      } catch (e) {
        console.warn("[achievements] load failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Nobody ranks on zero points: a list of 0s ordered at random reads
  // like a real ranking.
  const ranked = useMemo(() => leaderboard.filter((e) => e.total_points > 0), [leaderboard]);
  const myRank = useMemo(() => {
    return ranked.find((e) => e.user_id === user?.id)?.rank ?? null;
  }, [ranked, user?.id]);

  const newestPointId = history[0]?.id;
  const newestAchievementId = achievements[0]?.id;

  return (
    <>
      <Head>
        <title>Achievements | CateringMS</title>
      </Head>
      <NoIndexMeta />

      <PortalHeader
        variant="hero"
        title="Your achievements"
        subtitle="Points you've earned, badges you've unlocked, and how you stack up against the team."
        icon={Trophy}
      />
      <PageWorkbench />

      {loading ? (
        <PortalCard className="py-12 text-center text-slate-500">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
          Loading your stats...
        </PortalCard>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile label="Total points" value={totalPoints.toLocaleString()} hint="Earned from your work" icon={Star} />
            <StatTile label="Badges" value={achievements.length} hint={achievements.length === 0 ? "First one at 100 points" : "Unlocked so far"} icon={Medal} />
            <StatTile label="Team rank" value={myRank ? `#${myRank}` : "Unranked"} hint={myRank ? "On the top 10 below" : "Not in the top 10 yet"} icon={Crown} />
          </div>

          <PortalCard>
            <PortalCardHeader
              title={<><Sparkles className="h-4 w-4 text-slate-500" />Badges you&apos;ve unlocked</>}
              description={
                achievements.length === 0
                  ? "No badges yet - earn your first 100 points to unlock the Century Club."
                  : `${achievements.length} unlocked. Keep going.`
              }
            />
            {achievements.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing here yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {achievements.map((a) => {
                  const isHighlight = highlight === "achievement" && a.id === newestAchievementId;
                  return (
                    <div
                      key={a.id}
                      className={`rounded-lg border p-4 text-center transition-shadow ${
                        isHighlight
                          ? "border-amber-400 ring-2 ring-amber-300 shadow-md animate-pulse"
                          : "border-slate-200 hover:shadow-md dark:border-slate-700"
                      }`}
                    >
                      <div className="mb-2 text-3xl">{a.icon || "🏆"}</div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{a.achievement_name}</p>
                      {a.achievement_description && (
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{a.achievement_description}</p>
                      )}
                      <p className="mt-2 text-[10px] text-slate-500">
                        {format(new Date(a.unlocked_at), "d MMM yyyy")}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </PortalCard>

          <PortalCard>
            <PortalCardHeader
              title={<><Crown className="h-4 w-4 text-brand-primary" />Top 10 across the team</>}
            />
            {ranked.length === 0 ? (
              <p className="text-sm text-slate-500">No one&apos;s earned points yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {ranked.map((entry) => {
                  const isMe = entry.user_id === user?.id;
                  return (
                    <li
                      key={entry.user_id}
                      className={`flex items-center justify-between gap-3 py-2 ${
                        isMe ? "font-semibold text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="w-8 text-center font-mono text-sm">#{entry.rank}</span>
                        <span className="truncate">{entry.full_name || "Unnamed"}</span>
                        {entry.role && (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {entry.role.replace(/_/g, " ")}
                          </Badge>
                        )}
                        {isMe && <Badge className="bg-slate-100 text-[10px] text-slate-700">You</Badge>}
                      </div>
                      <span className="shrink-0 font-mono text-sm">{entry.total_points.toLocaleString()}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </PortalCard>

          {/* Up to 50 rows: folded unless a points notification sent the
              user here to see the newest one. */}
          <PortalCard
            collapsible
            defaultOpen={highlight === "points"}
            collapseLabel="point activity"
            key={highlight === "points" ? "points-open" : "points"}
          >
            <PortalCardHeader
              title="Recent point activity"
              description={
                history.length === 0
                  ? "No point activity yet."
                  : `Your last ${history.length} action${history.length === 1 ? "" : "s"} that earned points.`
              }
            />
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">Points show up here as you complete work.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map((p) => {
                  const isHighlight = highlight === "points" && p.id === newestPointId;
                  return (
                    <li
                      key={p.id}
                      className={`flex items-center justify-between gap-3 rounded px-2 py-2 transition-colors ${
                        isHighlight ? "bg-amber-50 ring-2 ring-amber-300 animate-pulse" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {p.action_description || (p.action_type ? p.action_type.replace(/_/g, " ") : "Points earned")}
                        </p>
                        <p className="text-xs text-slate-500">
                          {format(new Date(p.awarded_at), "d MMM yyyy, HH:mm")}
                        </p>
                      </div>
                      <Badge className="shrink-0 bg-amber-100 font-bold text-amber-800">+{p.points}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </PortalCard>
        </div>
      )}
    </>
  );
}

export default function AchievementsPage() {
  return (
    <ProtectedRoute>
      <PortalLayout maxWidth="full" showWorkbench={false}>
        <AchievementsContent />
      </PortalLayout>
    </ProtectedRoute>
  );
}
