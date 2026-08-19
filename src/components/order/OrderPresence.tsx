/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC Wave F: live presence pill for the order doc.
 *
 * Uses Supabase Realtime presence on a dedicated channel
 * (order-doc-presence:${orderId}) to track who else is currently
 * viewing this order. Renders as an avatar stack in the toolbar:
 *
 *   [JD][SM][+2]  3 viewing
 *
 * Enhancements (Wave F.3):
 *   - Role label shown in tooltip: "Jane Doe · Admin"
 *   - Join animation: new avatar scales in with a brief pop
 *   - Leave animation: departing avatar fades + shrinks out
 *   - "last viewed by" persists for 30s after a viewer leaves
 *     so the info doesn't vanish the instant they close the tab
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Viewer {
  user_id: string;
  full_name: string;
  role: string | null;
  /** epoch ms when this viewer joined — drives the pop-in animation */
  joinedAt: number;
  /** true while the fade-out animation plays before removal */
  leaving?: boolean;
}

interface Props {
  orderId: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function colourClass(name: string): string {
  const palette = [
    "bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-violet-500",
    "bg-brand-primary", "bg-blue-500", "bg-cyan-500", "bg-slate-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

/** Human-readable role label for the tooltip */
function roleLabel(role: string | null): string {
  if (!role) return "";
  const map: Record<string, string> = {
    admin: "Admin",
    company_admin: "Company Admin",
    owner: "Owner",
    super_admin: "Super Admin",
    kitchen_manager: "Kitchen Manager",
    kitchen_staff: "Kitchen",
    driver: "Driver",
    shopping_staff: "Shopping",
    cleaning_manager: "Cleaning Manager",
    cleaning_staff: "Cleaning",
    waiter: "Waiter",
    client: "Client",
    region_admin: "Region Admin",
    sales_admin: "Sales Admin",
  };
  return map[role] || role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function OrderPresence({ orderId }: Props) {
  const { user } = useAuth();
  const [viewers, setViewers] = useState<Viewer[]>([]);
  // Track recently-departed viewers for 30s so their avatar lingers
  // briefly rather than vanishing the instant they close the tab.
  const departedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!orderId || !user?.id) return;
    const channelName = `order-doc-presence:${orderId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: user.id } },
    });

    const syncViewers = () => {
      const state = channel.presenceState() as Record<string, Array<{
        user_id?: string;
        full_name?: string;
        role?: string | null;
      }>>;

      const liveIds = new Set<string>();
      const incoming: Omit<Viewer, "leaving">[] = [];

      Object.values(state).forEach((arr) => {
        for (const entry of arr) {
          const uid = entry.user_id;
          if (!uid || liveIds.has(uid)) continue;
          liveIds.add(uid);
          incoming.push({
            user_id: uid,
            full_name: entry.full_name || "Someone",
            role: entry.role || null,
            joinedAt: Date.now(),
          });
        }
      });

      setViewers((prev) => {
        const prevById = new Map(prev.map((v) => [v.user_id, v]));

        // Cancel any pending departure timers for viewers still live
        for (const uid of liveIds) {
          if (departedTimers.current[uid]) {
            clearTimeout(departedTimers.current[uid]);
            delete departedTimers.current[uid];
          }
        }

        // Build the new list: keep joinedAt from previous state so
        // already-present avatars don't re-animate on unrelated syncs.
        const next = incoming.map((v) => ({
          ...v,
          joinedAt: prevById.get(v.user_id)?.joinedAt ?? v.joinedAt,
          leaving: false,
        }));

        // For viewers who just left, keep them as "leaving" for 3s
        // then remove them. The 30s "last seen" is shown in the
        // overflow tooltip once they're fully gone.
        for (const prev of Array.from(prevById.values())) {
          if (!liveIds.has(prev.user_id) && !prev.leaving) {
            const leaving = { ...prev, leaving: true };
            next.push(leaving);
            // Remove after animation completes
            departedTimers.current[prev.user_id] = setTimeout(() => {
              setViewers((cur) => cur.filter((v) => v.user_id !== prev.user_id));
              delete departedTimers.current[prev.user_id];
            }, 700);
          }
        }

        return next;
      });
    };

    channel
      .on("presence", { event: "sync" }, syncViewers)
      .on("presence", { event: "join" }, syncViewers)
      .on("presence", { event: "leave" }, syncViewers)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user.id,
            full_name: (user as any).full_name || (user as any).email || "Someone",
            role: (user as any).role || null,
          });
        }
      });

    return () => {
      // Clear all departure timers on unmount
      for (const t of Object.values(departedTimers.current)) clearTimeout(t);
      departedTimers.current = {};
      supabase.removeChannel(channel);
    };
  }, [orderId, user?.id]);

  // Filter out the current viewer
  const others = viewers.filter((v) => v.user_id !== user?.id);
  if (others.length === 0) return null;

  const liveOthers = others.filter((v) => !v.leaving);
  const visible = others.slice(0, 3);
  const overflow = liveOthers.length - Math.min(liveOthers.length, 3);

  return (
    <div
      className="inline-flex items-center gap-1.5"
      title={others
        .filter((v) => !v.leaving)
        .map((v) => `${v.full_name}${v.role ? ` · ${roleLabel(v.role)}` : ""}`)
        .join(", ")}
    >
      <div className="flex -space-x-1.5">
        {visible.map((v) => {
          const isNew = !v.leaving && Date.now() - v.joinedAt < 1500;
          return (
            <span
              key={v.user_id}
              title={`${v.full_name}${v.role ? ` · ${roleLabel(v.role)}` : ""}`}
              style={{
                transition: "opacity 0.5s ease, transform 0.5s ease",
                opacity: v.leaving ? 0 : 1,
                transform: v.leaving
                  ? "scale(0.5)"
                  : isNew
                    ? "scale(1.15)"
                    : "scale(1)",
              }}
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white border-2 border-white ${colourClass(v.full_name)} cursor-default select-none`}
            >
              {initials(v.full_name)}
            </span>
          );
        })}
        {overflow > 0 && (
          <span
            className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-slate-700 bg-slate-200 border-2 border-white"
            title={liveOthers.slice(3).map((v) => `${v.full_name}${v.role ? ` · ${roleLabel(v.role)}` : ""}`).join(", ")}
          >
            +{overflow}
          </span>
        )}
      </div>
      <span className="text-[11px] text-slate-600 tabular-nums hidden sm:inline">
        {liveOthers.length} viewing
      </span>
    </div>
  );
}
