const fs=require('fs');const p='src/components/admin/orders/TimelineTrack.tsx';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{if(!s.includes(a))throw a.slice(0,80);s=s.replace(a,b);};
rep(`type PhaseState = "done" | "current" | "blocked" | "upcoming" | "na";`,`type PhaseState = "done" | "current" | "started" | "blocked" | "upcoming" | "na";`);
rep(`function summarisePhase(group: StageGroup, stages: OrderTimelineStage[]): PhaseSummary {`,`function summarisePhase(group: StageGroup, stages: OrderTimelineStage[], isActive: boolean): PhaseSummary {`);
rep(`          : current || done > 0 ? "current"
            : "upcoming";`,`          // Only the phase holding the order's current step is "current";
          // phases with a few steps ticked off early read as "started".
          : isActive || current ? "current"
            : done > 0 ? "started"
              : "upcoming";`);
rep(`  current: "bg-white border-orange-500 text-orange-600 ring-4 ring-orange-100",`,`  current: "bg-white border-orange-500 text-orange-600 ring-4 ring-orange-100",
  started: "bg-white border-emerald-300 text-emerald-700",`);
rep(`  current: "text-orange-700",
  blocked`,`  current: "text-orange-700",
  started: "text-emerald-700",
  blocked`);
rep(`        const prev = phases[idx - 1];
        // Connector into this phase is green once the previous phase is done.
        const lineTone = prev && (prev.state === "done" || prev.state === "na") && p.state !== "upcoming" && p.state !== "na"
          ? "bg-emerald-500"
          : prev?.state === "done"
            ? "bg-gradient-to-r from-emerald-500 to-slate-200"
            : "bg-slate-200";`,`        // Connector into this phase is green only when every phase before
        // it is finished (or not needed) - never green across a gap.
        const before = phases.slice(0, idx);
        const allBeforeDone = before.length > 0
          && before.every((b) => b.state === "done" || b.state === "na")
          && before.some((b) => b.state === "done");
        const lineTone = allBeforeDone ? "bg-emerald-500" : "bg-slate-200";`);
rep(`    return CLUSTER_ORDER.map((g) => summarisePhase(g, map.get(g) || []));
  }, [timeline.stages]);`,`    return CLUSTER_ORDER.map((g) => summarisePhase(g, map.get(g) || [], g === timeline.currentClusterKey));
  }, [timeline.stages, timeline.currentClusterKey]);`);
fs.writeFileSync(p,s);console.log('ok');
