/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier 4 chart 1 -- Lead source -> outcome funnel.
 *
 * Three columns of nodes connected by SVG ribbons. Custom render
 * (Recharts' Sankey is heavyweight + flaky on small datasets and we
 * only have 3 columns). Each ribbon's vertical thickness is
 * proportional to the count it carries. Hovering the ribbon reveals
 * the count + share-of-source.
 *
 * Layout:
 *   - 3 fixed-width columns: source nodes left, "Quoted/Not quoted"
 *     centre, "Won/Lost/In flight" right
 *   - Nodes are vertically stacked within each column proportional to
 *     their total volume
 *   - Ribbons drawn as cubic Bezier paths between node mid-points
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { GitBranch } from "lucide-react";
import type {
  LeadSourceFunnelResult,
  SourceNode, MiddleNode, OutcomeNode, FunnelLink,
} from "../extractors/aggregateLeadSourceFunnel";

interface Props {
  data: LeadSourceFunnelResult;
  loading?: boolean;
}

const COL_W = 110;       // node + label width
const NODE_W = 14;        // visible node bar
const GAP_BETWEEN_COLS = 130; // SVG horizontal distance between node columns
const NODE_GAP_Y = 6;     // vertical gap between stacked nodes
const CHART_HEIGHT = 320;

const SOURCE_COLOURS = ["#0ea5e9","#10b981","#8b5cf6","#f59e0b","#ec4899","#6366f1","#14b8a6","#f43f5e"];
const MIDDLE_COLOURS: Record<string, string> = { quoted: "#10b981", not_quoted: "#94a3b8" };
const OUTCOME_COLOURS: Record<string, string> = { won: "#10b981", lost: "#ef4444", in_flight: "#f59e0b" };

interface PositionedNode {
  key: string;
  label: string;
  total: number;
  x: number;
  y: number;
  height: number;
  colour: string;
}

const layoutColumn = (
  totals: { key: string; label: string; total: number; colour: string }[],
  x: number,
  totalLeads: number,
): PositionedNode[] => {
  // Available vertical space minus gaps.
  const gapTotal = NODE_GAP_Y * Math.max(0, totals.length - 1);
  const availableHeight = CHART_HEIGHT - gapTotal;
  const sumTotal = totalLeads || 1;
  let cursorY = 0;
  return totals.map((t) => {
    const h = Math.max(2, (t.total / sumTotal) * availableHeight);
    const node: PositionedNode = {
      key: t.key,
      label: t.label,
      total: t.total,
      x,
      y: cursorY,
      height: h,
      colour: t.colour,
    };
    cursorY += h + NODE_GAP_Y;
    return node;
  });
};

const ribbonPath = (
  fromX: number, fromY1: number, fromY2: number,
  toX: number, toY1: number, toY2: number,
): string => {
  const cx1 = fromX + (toX - fromX) / 2;
  const cx2 = fromX + (toX - fromX) / 2;
  return [
    `M ${fromX} ${fromY1}`,
    `C ${cx1} ${fromY1}, ${cx2} ${toY1}, ${toX} ${toY1}`,
    `L ${toX} ${toY2}`,
    `C ${cx2} ${toY2}, ${cx1} ${fromY2}, ${fromX} ${fromY2}`,
    "Z",
  ].join(" ");
};

export function LeadSourceFunnelChart({ data, loading }: Props) {
  const { sourceNodes, middleNodes, outcomeNodes, links1, links2, ariaSummary, isEmpty } = useMemo(() => {
    const isEmpty = data.totalLeads === 0;
    if (isEmpty) {
      return {
        sourceNodes: [], middleNodes: [], outcomeNodes: [],
        links1: [], links2: [], ariaSummary: "No leads to chart.", isEmpty: true,
      };
    }

    const sourceColoured = data.sources.map((s, i) => ({
      key: s.key, label: s.label, total: s.total, colour: SOURCE_COLOURS[i % SOURCE_COLOURS.length],
    }));
    const middleColoured = data.middles.map((m) => ({
      key: m.key, label: m.label, total: m.total, colour: MIDDLE_COLOURS[m.key] || "#64748b",
    }));
    const outcomeColoured = data.outcomes.map((o) => ({
      key: o.key, label: o.label, total: o.total, colour: OUTCOME_COLOURS[o.key] || "#64748b",
    }));

    const sourceNodes  = layoutColumn(sourceColoured,  COL_W,                            data.totalLeads);
    const middleNodes  = layoutColumn(middleColoured,  COL_W + GAP_BETWEEN_COLS,         data.totalLeads);
    const outcomeNodes = layoutColumn(outcomeColoured, COL_W + GAP_BETWEEN_COLS * 2,     data.totalLeads);

    // Ribbon offsets: walk each node's outgoing links + incoming links
    // and slice the node vertically into bands.
    const sourceOutCursor = new Map<string, number>();
    const middleInCursor = new Map<string, number>();
    const middleOutCursor = new Map<string, number>();
    const outcomeInCursor = new Map<string, number>();
    sourceNodes.forEach((n) => sourceOutCursor.set(n.key, 0));
    middleNodes.forEach((n) => { middleInCursor.set(n.key, 0); middleOutCursor.set(n.key, 0); });
    outcomeNodes.forEach((n) => outcomeInCursor.set(n.key, 0));

    const sourceById = new Map(sourceNodes.map((n) => [n.key, n]));
    const middleById = new Map(middleNodes.map((n) => [n.key, n]));
    const outcomeById = new Map(outcomeNodes.map((n) => [n.key, n]));

    const buildLinks = (
      links: FunnelLink[],
      fromMap: Map<string, PositionedNode>,
      toMap: Map<string, PositionedNode>,
      fromCursor: Map<string, number>,
      toCursor: Map<string, number>,
    ) => {
      // Sort by from-node y so ribbons leave nodes in stable order.
      const sorted = [...links].sort((a, b) => {
        const aFrom = fromMap.get(a.from)?.y ?? 0;
        const bFrom = fromMap.get(b.from)?.y ?? 0;
        if (aFrom !== bFrom) return aFrom - bFrom;
        const aTo = toMap.get(a.to)?.y ?? 0;
        const bTo = toMap.get(b.to)?.y ?? 0;
        return aTo - bTo;
      });
      return sorted.map((link) => {
        const fromNode = fromMap.get(link.from);
        const toNode = toMap.get(link.to);
        if (!fromNode || !toNode) return null;
        const fromOffset = fromCursor.get(link.from) || 0;
        const toOffset = toCursor.get(link.to) || 0;
        const fromHeight = (link.count / fromNode.total) * fromNode.height;
        const toHeight = (link.count / toNode.total) * toNode.height;
        const path = ribbonPath(
          fromNode.x + NODE_W, fromNode.y + fromOffset, fromNode.y + fromOffset + fromHeight,
          toNode.x,             toNode.y   + toOffset,   toNode.y   + toOffset   + toHeight,
        );
        fromCursor.set(link.from, fromOffset + fromHeight);
        toCursor.set(link.to, toOffset + toHeight);
        return {
          path,
          colour: fromNode.colour,
          count: link.count,
          fromLabel: fromNode.label,
          toLabel: toNode.label,
          fromKey: link.from,
        };
      }).filter(Boolean) as Array<{ path: string; colour: string; count: number; fromLabel: string; toLabel: string; fromKey: string }>;
    };

    const links1 = buildLinks(data.sourceToMiddle, sourceById, middleById, sourceOutCursor, middleInCursor);
    const links2 = buildLinks(data.middleToOutcome, middleById, outcomeById, middleOutCursor, outcomeInCursor);

    const topSource = data.sources[0];
    const winRate = data.totalLeads > 0 ? ((data.outcomes.find((o) => o.key === "won")?.total || 0) / data.totalLeads * 100).toFixed(1) : "0.0";
    const ariaSummary = `Lead source funnel: ${data.totalLeads} leads across ${data.sources.length} source${data.sources.length === 1 ? "" : "s"}. ${topSource?.label || "Top source"} contributed ${topSource?.total || 0}. Overall win rate ${winRate}%.`;

    return { sourceNodes, middleNodes, outcomeNodes, links1, links2, ariaSummary, isEmpty: false };
  }, [data]);

  const totalSvgWidth = COL_W + GAP_BETWEEN_COLS * 2 + NODE_W + 70;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-sky-600" />
          Lead source -> outcome
          <InfoTooltip
            content={
              "Each lead's journey: where it came in (left), whether it got a quote (middle), and how it ended (right). Ribbon thickness = number of leads.\n\n" +
              "Use this to find sources that bring volume but never convert -- a fat ribbon ending in 'Lost' or 'In flight' is a leak."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-72 flex items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : isEmpty ? (
          <div className="h-72 flex flex-col items-center justify-center text-center gap-1 text-slate-400">
            <GitBranch className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Lead source funnel will show here</p>
            <p className="text-xs">once you have leads with source attribution.</p>
          </div>
        ) : (
          <div className="overflow-x-auto" aria-label={ariaSummary}>
            <svg
              width={totalSvgWidth}
              height={CHART_HEIGHT + 30}
              className="block min-w-full"
              role="img"
            >
              {/* Column labels */}
              <text x={COL_W} y={CHART_HEIGHT + 20} fontSize="10" fill="#64748b" textAnchor="end">Source</text>
              <text x={COL_W + GAP_BETWEEN_COLS + NODE_W / 2} y={CHART_HEIGHT + 20} fontSize="10" fill="#64748b" textAnchor="middle">Quoted?</text>
              <text x={COL_W + GAP_BETWEEN_COLS * 2 + NODE_W / 2} y={CHART_HEIGHT + 20} fontSize="10" fill="#64748b" textAnchor="middle">Outcome</text>

              {/* Ribbons -- behind nodes */}
              {[...links1, ...links2].map((l, i) => (
                <path
                  key={`r-${i}`}
                  d={l.path}
                  fill={l.colour}
                  fillOpacity={0.32}
                >
                  <title>{`${l.fromLabel} -> ${l.toLabel}: ${l.count}`}</title>
                </path>
              ))}

              {/* Nodes */}
              {[...sourceNodes, ...middleNodes, ...outcomeNodes].map((n) => (
                <g key={`n-${n.key}-${n.x}`}>
                  <rect x={n.x} y={n.y} width={NODE_W} height={n.height} fill={n.colour} rx={2} />
                  <text
                    x={n.x === COL_W ? n.x - 6 : n.x + NODE_W + 6}
                    y={n.y + n.height / 2 + 3}
                    fontSize="10"
                    fill="#334155"
                    textAnchor={n.x === COL_W ? "end" : "start"}
                  >
                    <tspan fontWeight="600">{n.label}</tspan>
                    <tspan fill="#94a3b8" fontSize="9"> {n.total}</tspan>
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
