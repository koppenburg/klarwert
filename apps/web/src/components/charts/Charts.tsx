"use client";

import { COST_KINDS, type CostKind, type ScenarioResult, type SurrenderPoint, type YearRow } from "@klarwert/calc";
import type { ReactElement } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { euro } from "@/lib/format";
import { COST_COLORS, INK, SCENARIO_COLOR, SERIES, SHORT_COST_LABELS } from "./palette";

/** Feste Größe (Report/Druck, ohne Animation) oder responsive (UI). */
export interface ChartSize {
  fixed?: { width: number; height: number };
  height?: number;
}

function Frame({ size, children }: { size: ChartSize; children: (dims: { width?: number; height?: number }) => ReactElement }) {
  if (size.fixed) return children({ width: size.fixed.width, height: size.fixed.height });
  return (
    <div style={{ width: "100%", height: size.height ?? 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        {children({})}
      </ResponsiveContainer>
    </div>
  );
}

const axisProps = {
  stroke: INK.axis,
  tick: { fill: INK.secondary, fontSize: 11 },
  tickLine: false,
} as const;

function eurTick(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio. €`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toLocaleString("de-DE", { maximumFractionDigits: 0 })} T€`;
  return `${Math.round(v)} €`;
}

const tooltipStyle = { contentStyle: { borderRadius: 6, borderColor: INK.grid, fontSize: 12 }, labelStyle: { color: INK.primary, fontWeight: 600 } };

function legendFormatter(value: string) {
  return <span style={{ color: INK.secondary, fontSize: 12 }}>{value}</span>;
}

/** Kosten je Art über die Laufzeit (gestapelte Balken je Jahr oder gestapelte Fläche kumuliert). */
export function CostStackChart({
  years,
  mode = "year",
  calendarYear,
  size = {},
  animate = true,
}: {
  years: YearRow[];
  mode?: "year" | "cumulative";
  calendarYear?: (contractYear: number) => number;
  size?: ChartSize;
  animate?: boolean;
}) {
  const kinds = COST_KINDS.filter((k) => years.some((y) => Math.abs(y.costsCum[k]) > 0.005));
  const data = years.map((y) => {
    const row: Record<string, number> = { year: calendarYear ? calendarYear(y.year) : y.year };
    for (const k of kinds) row[k] = Math.round((mode === "year" ? y.costs[k] : y.costsCum[k]) * 100) / 100;
    return row;
  });
  const tip = <Tooltip {...tooltipStyle} formatter={(v, name) => [euro(Number(v)), SHORT_COST_LABELS[name as CostKind] ?? String(name)]} />;
  return (
    <Frame size={size}>
      {(dims) =>
        mode === "year" ? (
          <BarChart {...dims} data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }} barCategoryGap={2}>
            <CartesianGrid stroke={INK.grid} vertical={false} />
            <XAxis dataKey="year" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...axisProps} tickFormatter={eurTick} width={64} axisLine={false} />
            {tip}
            <Legend formatter={(v: string) => legendFormatter(SHORT_COST_LABELS[v as CostKind] ?? v)} iconType="square" iconSize={10} />
            {kinds.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                stackId="c"
                fill={COST_COLORS[k]}
                stroke={INK.surface}
                strokeWidth={1}
                radius={i === kinds.length - 1 ? [2, 2, 0, 0] : 0}
                isAnimationActive={animate}
              />
            ))}
          </BarChart>
        ) : (
          <AreaChart {...dims} data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={INK.grid} vertical={false} />
            <XAxis dataKey="year" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...axisProps} tickFormatter={eurTick} width={64} axisLine={false} />
            {tip}
            <Legend formatter={(v: string) => legendFormatter(SHORT_COST_LABELS[v as CostKind] ?? v)} iconType="square" iconSize={10} />
            {kinds.map((k) => (
              <Area key={k} type="monotone" dataKey={k} stackId="c" fill={COST_COLORS[k]} fillOpacity={0.85} stroke={INK.surface} strokeWidth={2} isAnimationActive={animate} />
            ))}
          </AreaChart>
        )
      }
    </Frame>
  );
}

/** Brutto- (ohne Kosten) gegen Nettoguthaben (nach Kosten) und Eigenbeiträge. */
export function ValueLinesChart({
  years,
  calendarYear,
  size = {},
  animate = true,
}: {
  years: YearRow[];
  calendarYear?: (contractYear: number) => number;
  size?: ChartSize;
  animate?: boolean;
}) {
  const data = years.map((y) => ({
    year: calendarYear ? calendarYear(y.year) : y.year,
    gross: Math.round(y.valueGross),
    net: Math.round(y.valueNet),
    own: Math.round(y.ownPremiumsCum + y.allowancesCum),
  }));
  const names: Record<string, string> = { gross: "Bruttoguthaben (ohne Kosten)", net: "Nettoguthaben (nach Kosten)", own: "Einzahlungen kumuliert" };
  return (
    <Frame size={size}>
      {(dims) => (
        <LineChart {...dims} data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={INK.grid} vertical={false} />
          <XAxis dataKey="year" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...axisProps} tickFormatter={eurTick} width={64} axisLine={false} />
          <Tooltip {...tooltipStyle} formatter={(v, n) => [euro(Number(v)), names[String(n)] ?? String(n)]} />
          <Legend formatter={(v: string) => legendFormatter(names[v] ?? v)} />
          <Line type="monotone" dataKey="gross" stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={animate} />
          <Line type="monotone" dataKey="net" stroke={SERIES[1]} strokeWidth={2} dot={false} isAnimationActive={animate} />
          <Line type="monotone" dataKey="own" stroke={INK.secondary} strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={animate} />
        </LineChart>
      )}
    </Frame>
  );
}

/** Rückkaufswertverlauf mit Break-even-Markierung. */
export function SurrenderChart({
  curve,
  breakEvenYear,
  calendarYear,
  size = {},
  animate = true,
}: {
  curve: SurrenderPoint[];
  breakEvenYear: number | null;
  calendarYear?: (contractYear: number) => number;
  size?: ChartSize;
  animate?: boolean;
}) {
  const subsidised = curve.some((p) => p.netAfterSubsidyRepayment !== null);
  const data = curve.map((p) => ({
    year: calendarYear ? calendarYear(p.year) : p.year,
    surrender: Math.round(p.surrenderValue),
    own: Math.round(p.ownContributionsCum),
    netAfter: p.netAfterSubsidyRepayment === null ? undefined : Math.round(p.netAfterSubsidyRepayment),
  }));
  const names: Record<string, string> = { surrender: "Rückkaufswert", own: "Summe Eigenbeiträge", netAfter: "Auszahlung nach Rückzahlung der Förderung" };
  const be = breakEvenYear === null ? null : calendarYear ? calendarYear(breakEvenYear) : breakEvenYear;
  return (
    <Frame size={size}>
      {(dims) => (
        <LineChart {...dims} data={data} margin={{ top: 16, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={INK.grid} vertical={false} />
          <XAxis dataKey="year" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...axisProps} tickFormatter={eurTick} width={64} axisLine={false} />
          <Tooltip {...tooltipStyle} formatter={(v, n) => [euro(Number(v)), names[String(n)] ?? String(n)]} />
          <Legend formatter={(v: string) => legendFormatter(names[v] ?? v)} />
          {be !== null && (
            <ReferenceLine x={be} stroke={INK.secondary} strokeDasharray="3 3" label={{ value: `Break-even ${be}`, position: "insideTopLeft", fill: INK.secondary, fontSize: 11 }} />
          )}
          <Line type="monotone" dataKey="surrender" stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={animate} />
          <Line type="monotone" dataKey="own" stroke={INK.secondary} strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={animate} />
          {subsidised && <Line type="monotone" dataKey="netAfter" stroke={SERIES[1]} strokeWidth={2} dot={false} isAnimationActive={animate} />}
        </LineChart>
      )}
    </Frame>
  );
}

/** Szenarienvergleich: Endkapital als Balken, alle in derselben neutralen Farbe (keine Hervorhebung). */
export function ScenarioBars({ scenarios, size = {}, animate = true }: { scenarios: Pick<ScenarioResult, "id" | "label" | "endCapital">[]; size?: ChartSize; animate?: boolean }) {
  const data = scenarios.map((s) => ({ id: s.id, label: s.label.split(" – ")[0] ?? s.id, full: s.label, endCapital: Math.round(s.endCapital) }));
  return (
    <Frame size={size}>
      {(dims) => (
        <BarChart {...dims} data={data} margin={{ top: 16, right: 12, bottom: 0, left: 4 }} barCategoryGap="30%">
          <CartesianGrid stroke={INK.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={eurTick} width={64} axisLine={false} />
          <Tooltip {...tooltipStyle} labelFormatter={(_l, p) => String(p?.[0]?.payload?.full ?? _l)} formatter={(v) => [euro(Number(v)), "Endkapital"]} />
          <Bar dataKey="endCapital" fill={SCENARIO_COLOR} radius={[4, 4, 0, 0]} isAnimationActive={animate} label={{ position: "top", fill: INK.primary, fontSize: 11, formatter: (v: unknown) => euro(Number(v)) }} />
        </BarChart>
      )}
    </Frame>
  );
}

/** Vergleich mehrerer Verträge: Endkapital netto. */
export function CompareBars({ rows, size = {}, animate = true }: { rows: Array<{ label: string; endCapital: number }>; size?: ChartSize; animate?: boolean }) {
  const data = rows.map((r) => ({ label: r.label, endCapital: Math.round(r.endCapital) }));
  return (
    <Frame size={size}>
      {(dims) => (
        <BarChart {...dims} data={data} margin={{ top: 16, right: 12, bottom: 0, left: 4 }} barCategoryGap="35%">
          <CartesianGrid stroke={INK.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={eurTick} width={64} axisLine={false} />
          <Tooltip {...tooltipStyle} formatter={(v) => [euro(Number(v)), "Endkapital nach Kosten"]} />
          <Bar dataKey="endCapital" fill={SCENARIO_COLOR} radius={[4, 4, 0, 0]} isAnimationActive={animate} label={{ position: "top", fill: INK.primary, fontSize: 11, formatter: (v: unknown) => euro(Number(v)) }} />
        </BarChart>
      )}
    </Frame>
  );
}
