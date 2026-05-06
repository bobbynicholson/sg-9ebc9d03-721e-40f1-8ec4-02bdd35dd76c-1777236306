/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /account/achievements
 *
 * Universal points + achievements + leaderboard view. Any signed-in
 * user lands here from a `gamification_points` or `gamification_
 * achievement` notification. Powered entirely by the existing
 * gamificationService methods so it stays in sync with what the
 * driver portal's CateringDashGame already shows.
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const myRank = useMemo(() => {
    return leaderboard.find((e) => e.user_id === user?.id)?.rank ?? null;
  }, [leaderboard, user?.id]);

  const newestPointId = history[0]?.id;
  const newestAchievementId = achievements[0]?.id;

  return (
    <>
      <Head>
        <title>Achievements | CateringMS</title>
      </Head>
      <NoIndexMeta />

      <div className="min-h-screen bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Trophy className="w-7 h-7 text-amber-500" />
              Your achievements
            </h1>
            <p className="text-slate-600 mt-1">
              Points you've earned, badges you've unlocked, and how you stack up against the team.
            </p>
          </div>

          {loading ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="p-12 text-center text-slate-500">
                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                Loading your stats...
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Headline stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-yellow-50">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <Star className="w-5 h-5 text-amber-500" />
                      <p className="text-sm text-slate-600 font-semibold">Total points</p>
                    </div>
                    <p className="text-4xl font-bold text-slate-900">{totalPoints.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-indigo-50">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <Medal className="w-5 h-5 text-purple-600" />
                      <p className="text-sm text-slate-600 font-semibold">Achievements</p>
                    </div>
                    <p className="text-4xl font-bold text-slate-900">{achievements.length}</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-50 to-teal-50">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <Crown className="w-5 h-5 text-emerald-600" />
                      <p className="text-sm text-slate-600 font-semibold">Leaderboard rank</p>
                    </div>
                    <p className="text-4xl font-bold text-slate-900">
                      {myRank ? `#${myRank}` : "Unranked"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Achievements grid */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                    Badges you've unlocked
                  </CardTitle>
                  <CardDescription>
                    {achievements.length === 0
                      ? "No badges yet -- earn your first 100 points to unlock the Century Club."
                      : `${achievements.length} unlocked. Keep going.`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {achievements.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">Nothing here yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {achievements.map((a) => {
                        const isHighlight = highlight === "achievement" && a.id === newestAchievementId;
                        return (
                          <div
                            key={a.id}
                            className={`rounded-lg border p-4 text-center transition-shadow ${
                              isHighlight
                                ? "border-amber-400 ring-2 ring-amber-300 shadow-md animate-pulse"
                                : "border-slate-200 hover:shadow-md"
                            }`}
                          >
                            <div className="text-3xl mb-2">{a.icon || "🏆"}</div>
                            <p className="font-semibold text-slate-900 text-sm">{a.achievement_name}</p>
                            {a.achievement_description && (
                              <p className="text-xs text-slate-600 mt-1">{a.achievement_description}</p>
                            )}
                            <p className="text-[10px] text-slate-500 mt-2">
                              {format(new Date(a.unlocked_at), "d MMM yyyy")}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent points */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Recent point activity</CardTitle>
                  <CardDescription>The last 50 actions that earned you points.</CardDescription>
                </CardHeader>
                <CardContent>
                  {history.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No point activity yet.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {history.map((p) => {
                        const isHighlight = highlight === "points" && p.id === newestPointId;
                        return (
                          <li
                            key={p.id}
                            className={`flex items-center justify-between py-2 px-2 rounded transition-colors ${
                              isHighlight ? "bg-amber-50 ring-2 ring-amber-300 animate-pulse" : ""
                            }`}
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-900">
                                {p.action_description || p.action_type || "Points earned"}
                              </p>
                              <p className="text-xs text-slate-500">
                                {format(new Date(p.awarded_at), "d MMM yyyy, HH:mm")}
                              </p>
                            </div>
                            <Badge className="bg-amber-100 text-amber-800 font-bold">
                              +{p.points}
                            </Badge>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Leaderboard */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="w-5 h-5 text-emerald-600" />
                    Top 10 across the team
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {leaderboard.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No one's earned points yet.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {leaderboard.map((entry) => {
                        const isMe = entry.user_id === user?.id;
                        return (
                          <li
                            key={entry.user_id}
                            className={`flex items-center justify-between py-2 ${
                              isMe ? "font-semibold text-slate-900" : "text-slate-700"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-8 text-center font-mono text-sm">
                                #{entry.rank}
                              </span>
                              <span>{entry.full_name || "Unnamed"}</span>
                              {entry.role && (
                                <Badge variant="outline" className="text-[10px] capitalize">
                                  {entry.role.replace(/_/g, " ")}
                                </Badge>
                              )}
                              {isMe && (
                                <Badge className="bg-purple-100 text-purple-700 text-[10px]">You</Badge>
                              )}
                            </div>
                            <span className="font-mono text-sm">{entry.total_points.toLocaleString()}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function AchievementsPage() {
  return (
    <ProtectedRoute>
      <PortalLayout>
        <AchievementsContent />
      </PortalLayout>
    </ProtectedRoute>
  );
}
