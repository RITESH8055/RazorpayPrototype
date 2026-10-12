import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Scenario } from "../lib/types";
import { hourLabel } from "../lib/scenarios";
import { splitOrders } from "../lib/features";

const dayLabel = (s: Scenario, hour: number) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(new Date(new Date(s.startIso).getTime() + hour * 3600_000));

const C = {
  brand: "#305EFF",
  ink: "#192839",
  subtle: "#8996A9",
  line: "#CCD7EB",
  light: "#75A3FF",
  danger: "#C4302B",
};
const axis = { fontSize: 10, fill: "#64748A" };

export function VolumeChart({ s, height = 190, from = 0 }: { s: Scenario; height?: number; from?: number }) {
  const data = useMemo(
    () =>
      s.hourly.slice(from).map((h) => ({
        hour: h.hour,
        label: hourLabel(s, h.hour, true),
        orders: h.orders,
        baseline: s.baseline.hourly[(h.hour + s.startHourOfDay) % 24],
      })),
    [s, from],
  );
  // Full view: one tick per midnight. Zoomed view: every 12 hours.
  const ticks = data.map((d) => d.hour).filter((h) => (from ? (h - from) % 12 === 0 : (h + s.startHourOfDay) % 24 === 0));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
        <ReferenceArea x1={s.spikeStartHour} x2={s.hourly.length - 1} fill={C.brand} fillOpacity={0.06} />
        <XAxis dataKey="hour" type="number" domain={["dataMin", "dataMax"]} ticks={ticks} tick={axis} tickLine={false} axisLine={{ stroke: C.line }} tickFormatter={(h) => (from ? hourLabel(s, h, true) : dayLabel(s, h))} />
        <YAxis tick={axis} tickLine={false} axisLine={false} />
        <Tooltip
          labelFormatter={(h) => hourLabel(s, Number(h), true)}
          formatter={(v: number, n) => [n === "baseline" ? v.toFixed(1) : v, n === "baseline" ? "Baseline" : "Orders"]}
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: C.line }}
        />
        <Bar dataKey="orders" fill={C.brand} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        <Line dataKey="baseline" stroke={C.ink} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const BINS = [0, 500, 1000, 1500, 2000, 3000, 4000, 6000, 10000, 20000, 30000, 40000, 50000];
const binLabel = (lo: number) => (lo >= 1000 ? `${lo / 1000}k` : `${lo}`);

export function OrderValueHistogram({ s, height = 190 }: { s: Scenario; height?: number }) {
  const data = useMemo(() => {
    const { baseline, spike } = splitOrders(s);
    const maxAmount = Math.max(...s.orders.map((o) => o.amount));
    const edges = BINS.filter((_, i) => i === 0 || BINS[i - 1] < maxAmount);
    return edges.map((lo, i) => {
      const hi = edges[i + 1] ?? Infinity;
      const share = (arr: typeof baseline) => (arr.filter((o) => o.amount >= lo && o.amount < hi).length / arr.length) * 100;
      return { bin: i === edges.length - 1 ? `${binLabel(lo)}+` : binLabel(lo), baseline: +share(baseline).toFixed(1), spike: +share(spike).toFixed(1) };
    });
  }, [s]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }} barGap={0} barCategoryGap="12%">
        <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="bin" tick={axis} tickLine={false} axisLine={{ stroke: C.line }} interval={0} />
        <YAxis tick={axis} tickLine={false} axisLine={false} unit="%" />
        <Tooltip formatter={(v: number, n) => [`${v}% of orders`, n === "spike" ? "Spike (24h)" : "Baseline (72h)"]} labelFormatter={(l) => `₹${l}`} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: C.line }} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "spike" ? "Spike" : "Baseline")} />
        <Bar dataKey="baseline" fill={C.subtle} fillOpacity={0.55} isAnimationActive={false} />
        <Bar dataKey="spike" fill={C.brand} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Sparkline({ values, markAt, height = 46, color = C.brand }: { values: number[]; markAt?: number; height?: number; color?: string }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
        {markAt !== undefined && <ReferenceLine x={markAt} stroke={C.ink} strokeDasharray="3 3" />}
        <XAxis dataKey="i" hide />
        <YAxis hide domain={[0, (max: number) => Math.max(20, max)]} />
        <Line dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
