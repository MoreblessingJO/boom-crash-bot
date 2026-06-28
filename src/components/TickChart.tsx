import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Tick } from "@/lib/deriv-client";

interface Props {
  ticks: Tick[];
  spikeEpochs: number[];
  kind: "boom" | "crash";
}

export function TickChart({ ticks, spikeEpochs, kind }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#9aa6b8",
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: true,
      },
      crosshair: { mode: 1 },
      autoSize: true,
    });
    const color = kind === "boom" ? "#7ee787" : "#ff7b72";
    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => chart.remove();
  }, [kind]);

  useEffect(() => {
    if (!seriesRef.current) return;
    const data = ticks.map((t) => ({
      time: t.epoch as UTCTimestamp,
      value: t.quote,
    }));
    seriesRef.current.setData(data);

    const markers = spikeEpochs
      .filter((e) => ticks.some((t) => t.epoch === e))
      .map((e) => ({
        time: e as UTCTimestamp,
        position: (kind === "boom" ? "belowBar" : "aboveBar") as
          | "belowBar"
          | "aboveBar",
        color: kind === "boom" ? "#7ee787" : "#ff7b72",
        shape: (kind === "boom" ? "arrowUp" : "arrowDown") as
          | "arrowUp"
          | "arrowDown",
        text: "spike",
      }));
    // v5 markers via plugin (typed loosely to avoid extra import surface)
    const setMarkers = (seriesRef.current as unknown as {
      setMarkers?: (m: unknown[]) => void;
    }).setMarkers;
    setMarkers?.(markers);
  }, [ticks, spikeEpochs, kind]);

  return <div ref={containerRef} className="h-full w-full" />;
}
