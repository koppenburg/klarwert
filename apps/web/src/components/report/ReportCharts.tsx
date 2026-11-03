"use client";

import type { ScenarioResult, SurrenderPoint, YearRow } from "@klarwert/calc";
import { useEffect, useState } from "react";
import { CostStackChart, ScenarioBars, SurrenderChart, ValueLinesChart } from "@/components/charts/Charts";

const W = 680;
const H = 250;

function calendarFn(startYear: number, startMonth: number) {
  return (y: number) => startYear + Math.floor((startMonth - 1 + (y - 1) * 12) / 12);
}

export function ReportCostChart({ years, startYear, startMonth }: { years: YearRow[]; startYear: number; startMonth: number }) {
  return <CostStackChart years={years} calendarYear={calendarFn(startYear, startMonth)} size={{ fixed: { width: W, height: H } }} animate={false} />;
}

export function ReportValueChart({ years, startYear, startMonth }: { years: YearRow[]; startYear: number; startMonth: number }) {
  return <ValueLinesChart years={years} calendarYear={calendarFn(startYear, startMonth)} size={{ fixed: { width: W, height: H } }} animate={false} />;
}

export function ReportSurrenderChart({ curve, breakEvenYear, startYear, startMonth }: { curve: SurrenderPoint[]; breakEvenYear: number | null; startYear: number; startMonth: number }) {
  return <SurrenderChart curve={curve} breakEvenYear={breakEvenYear} calendarYear={calendarFn(startYear, startMonth)} size={{ fixed: { width: W, height: H } }} animate={false} />;
}

export function ReportScenarioChart({ scenarios }: { scenarios: Pick<ScenarioResult, "id" | "label" | "endCapital">[] }) {
  return <ScenarioBars scenarios={scenarios} size={{ fixed: { width: W, height: H } }} animate={false} />;
}

/** Signal für die PDF-Erzeugung: Client-Charts sind gerendert. */
export function ReportReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let a = 0;
    let b = 0;
    a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, []);
  return <span data-report-ready={ready ? "true" : "false"} hidden />;
}
