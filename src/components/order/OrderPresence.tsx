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
 * Cheap - presence is broadcast diffs, not full row pulls. Joining
 * tracks the viewer's user_id + display name + role so operators
 * see who else from their team is on the same order in real time.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Viewer {
  user_id: string;
  full_name: string;
  role: string | null;
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

// Deterministic colour from name so each viewer's avatar is stable
// across re-renders without needing avatar_url.
function colourClass(name: string): string {
  const palette = [
    "bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-brand-primary",
    "bg-brand-primary", "bg-blue-500", "bg-blue-500", "bg-slate-500", "bg-rose-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

export function OrderPresence({ orderId }: Props) {
  const { user } = useAuth();
  const [viewers, setViewers] = useState<Viewer[]>([]);

  useEffect(() => {
    if (!orderId || !user?.id) return;
    const channelName = `order-doc-presence:${orderId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: user.id } },
    });

    const syncViewers = () => {
      // presenceState returns a record keyed by user_id, each value
      // is an array of presence entries (one per tab/connection).
      // We collapse to one entry per user_id.
      const state = channel.presenceState() as Record<string, Array<{ user_id?: string; full_name?: string; role?: string | null }>>;
      const seen = new Map<string, Viewer>();
      Object.values(state).forEach((arr) => {
        for (const entry of arr) {
          const uid = entry.user_id;
          if (!uid) continue;
          if (!seen.has(uid)) {
            seen.set(uid, {
              user_id: uid,
              full_name: entry.full_name || "Someone",
              role: entry.role || null,
            });
          }
        }
      });
      setViewers(Array.from(seen.values()));
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
      supabase.removeChannel(channel);
    };
  }, [orderId, user?.id]);

  // Filter out the current viewer - they don't need to see themselves.
  const others = viewers.filter((v) => v.user_id !== user?.id);
  if (others.length === 0) return null;

  // Show up to 3 avatars, then a +N pill.
  const visible = others.slice(0, 3);
  const overflow = others.length - visible.length;

  return (
    <div className="inline-flex items-center gap-1.5" title={`Also viewing: ${others.map((v) => v.full_name).join(", ")}`}>
      <div className="flex -space-x-1.5">
        {visible.map((v) => (
          <span
            key={v.user_id}
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white border-2 border-white ${colourClass(v.full_name)}`}
          >
            {initials(v.full_name)}
          </span>
        ))}
        {overflow > 0 && (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-slate-700 bg-slate-200 border-2 border-white">
            +{overflow}
          </span>
        )}
      </div>
      <span className="text-[11px] text-slate-600 tabular-nums hidden sm:inline">
        {others.length} viewing
      </span>
    </div>
  );
}
