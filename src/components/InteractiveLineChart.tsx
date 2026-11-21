import React, { useMemo, useRef, useState } from 'react';
import type { ChartPoint } from '../types/portfolio';
import { formatChartDate, formatPrice } from '../utils/format';

export interface ChartMarker {
  id: string;
  time: number;
  dateStr: string;
  price: number;
  type: 'BUY' | 'SELL';
  quantity: number;
  currency: string;
}

interface InteractiveLineChartProps {
  points: ChartPoint[];
  range: string;
  currency?: string;
  referencePrice?: number | null;
  gavPrice?: number | null;
  showGav?: boolean;
  markers?: ChartMarker[];
  height?: number;
  isPositive?: boolean;
  showPriceLabels?: boolean;
  onHoverPoint?: (point: ChartPoint | null) => void;
  onHoverMarker?: (marker: ChartMarker | null) => void;
  loading?: boolean;
}

/**
 * Monotone cubic Hermite spline (Fritsch-Carlson) for smooth, non-overshooting financial curves
 */
function buildSmoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  if (pts.length === 2) {
    return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} L ${pts[1].x.toFixed(2)} ${pts[1].y.toFixed(2)}`;
  }

  const n = pts.length;
  const dx: number[] = new Array(n - 1);
  const dy: number[] = new Array(n - 1);
  const slope: number[] = new Array(n - 1);

  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x || 1;
    dy[i] = pts[i + 1].y - pts[i].y;
    slope[i] = dy[i] / dx[i];
  }

  const m: number[] = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
    }
  }

  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const seg = dx[i] / 3;
    const cp1x = pts[i].x + seg;
    const cp1y = pts[i].y + m[i] * seg;
    const cp2x = pts[i + 1].x - seg;
    const cp2y = pts[i + 1].y - m[i + 1] * seg;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${pts[i + 1].x.toFixed(2)} ${pts[i + 1].y.toFixed(2)}`;
  }
  return d;
}

export const InteractiveLineChart: React.FC<InteractiveLineChartProps> = ({
  points,
  range,
  currency = 'SEK',
  referencePrice,
  gavPrice,
  showGav = false,
  markers = [],
  height = 230,
  isPositive,
  showPriceLabels = true,
  onHoverPoint,
  onHoverMarker,
  loading = false,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

  const viewWidth = 680;
  const viewHeight = height;
  const padTop = 20;
  const padBottom = 26;
  const padLeft = 2;
  const padRight = 8;
  const plotW = viewWidth - padLeft - padRight;
  const plotH = viewHeight - padTop - padBottom;

  const computedPositive = useMemo(() => {
    if (typeof isPositive === 'boolean') return isPositive;
    if (points.length < 2) return true;
    const base = referencePrice && referencePrice > 0 ? referencePrice : points[0].close;
    return points[points.length - 1].close >= base;
  }, [isPositive, points, referencePrice]);

  const { minVal, maxVal, dataMin, dataMax, linePath, areaPath, coords } = useMemo(() => {
    if (points.length === 0) {
      return {
        minVal: 0,
        maxVal: 1,
        dataMin: 0,
        dataMax: 1,
        linePath: '',
        areaPath: '',
        coords: [] as Array<{ x: number; y: number }>,
      };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) {
      if (p.close < min) min = p.close;
      if (p.close > max) max = p.close;
    }
    const rawMin = min;
    const rawMax = max;

    if (showGav && gavPrice && gavPrice > 0) {
      if (gavPrice > min * 0.45 && gavPrice < max * 1.8) {
        min = Math.min(min, gavPrice);
        max = Math.max(max, gavPrice);
      }
    }
    if (referencePrice && referencePrice > 0 && range === '1d') {
      min = Math.min(min, referencePrice);
      max = Math.max(max, referencePrice);
    }

    const span = max - min || Math.max(Math.abs(max) * 0.04, 1);
    const paddedMin = min - span * 0.1;
    const paddedMax = max + span * 0.1;
    const finalSpan = paddedMax - paddedMin || 1;

    const pts = points.map((p, i) => {
      const x =
        points.length === 1
          ? padLeft + plotW / 2
          : padLeft + (i / (points.length - 1)) * plotW;
      const y = padTop + (1 - (p.close - paddedMin) / finalSpan) * plotH;
      return { x, y };
    });

    const line = buildSmoothPath(pts);
    const area =
      pts.length > 1
        ? `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${(padTop + plotH).toFixed(2)} L ${pts[0].x.toFixed(2)} ${(padTop + plotH).toFixed(2)} Z`
        : '';

    return {
      minVal: paddedMin,
      maxVal: paddedMax,
      dataMin: rawMin,
      dataMax: rawMax,
      linePath: line,
      areaPath: area,
      coords: pts,
    };
  }, [points, showGav, gavPrice, referencePrice, range, plotW, plotH]);

  const yForPrice = (price: number): number | null => {
    if (maxVal === minVal) return null;
    if (price < minVal || price > maxVal) return null;
    return padTop + (1 - (price - minVal) / (maxVal - minVal)) * plotH;
  };

  // Map Buy/Sell markers to their exact position on the curve (with 2-day tolerance for weekends)
  const plottedMarkers = useMemo(() => {
    if (!markers.length || points.length < 2) return [];
    const firstT = points[0].time - 3 * 86_400_000;
    const lastT = points[points.length - 1].time + 3 * 86_400_000;

    return markers
      .filter((m) => m.time >= firstT && m.time <= lastT)
      .map((m) => {
        let bestIdx = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < points.length; i++) {
          const diff = Math.abs(points[i].time - m.time);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
          }
        }
        return {
          ...m,
          pointIndex: bestIdx,
          x: coords[bestIdx]?.x ?? 0,
          y: coords[bestIdx]?.y ?? 0,
        };
      });
  }, [markers, points, coords]);

  const handlePointer = (clientX: number) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx = Math.round(ratio * (points.length - 1));
    setActiveIndex(idx);
    onHoverPoint?.(points[idx] ?? null);

    // Check if pointer is close to a buy/sell dot so scrubbing effortlessly inspects the trade!
    const svgX = padLeft + ratio * plotW;
    let nearest: (typeof plottedMarkers)[number] | null = null;
    let nearestDist = 18;
    for (const m of plottedMarkers) {
      const dist = Math.abs(m.x - svgX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = m;
      }
    }
    if (nearest) {
      setActiveMarkerId(nearest.id);
      onHoverMarker?.(nearest);
    } else {
      setActiveMarkerId(null);
      onHoverMarker?.(null);
    }
  };

  const handleLeave = () => {
    setActiveIndex(null);
    setActiveMarkerId(null);
    onHoverPoint?.(null);
    onHoverMarker?.(null);
  };

  const strokeColor = computedPositive ? '#00C2C7' : '#FF4D6A';
  const gradientId = useMemo(
    () => `nn-grad-${computedPositive ? 'pos' : 'neg'}-${Math.random().toString(36).slice(2, 7)}`,
    [computedPositive]
  );

  if (loading) {
    return (
      <div
        className="w-full flex items-center justify-center rounded-xl bg-slate-100/60 dark:bg-[#11161F]/70 animate-pulse"
        style={{ height }}
      >
        <span className="text-xs text-[#526071] dark:text-[#7D8A9C]">Hämtar kursgraf...</span>
      </div>
    );
  }

  if (points.length < 2) {
    return (
      <div
        className="w-full flex items-center justify-center border-y border-[#E2E8F0] dark:border-[#1C232E] text-xs text-[#526071] dark:text-[#7D8A9C]"
        style={{ height }}
      >
        Ingen kurshistorik tillgänglig för vald period.
      </div>
    );
  }

  const refY = referencePrice && range === '1d' ? yForPrice(referencePrice) : null;
  const gavY = showGav && gavPrice ? yForPrice(gavPrice) : null;
  const activeCoord = activeIndex !== null ? coords[activeIndex] : null;
  const lastCoord = coords[coords.length - 1];
  const midIdx = Math.floor(points.length / 2);
  const gridY1 = padTop + plotH * 0.25;
  const gridY2 = padTop + plotH * 0.75;

  return (
    <div className="relative w-full select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        className="w-full overflow-visible touch-none cursor-crosshair"
        style={{ height }}
        onPointerMove={(e) => handlePointer(e.clientX)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handlePointer(e.clientX);
        }}
        onPointerUp={handleLeave}
        onPointerLeave={handleLeave}
        onPointerCancel={handleLeave}
        role="img"
        aria-label="Interaktiv kursgraf"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.22" />
            <stop offset="68%" stopColor={strokeColor} stopOpacity="0.04" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Subtle minimalist horizontal guide lines */}
        <line
          x1={padLeft}
          y1={gridY1}
          x2={viewWidth - padRight}
          y2={gridY1}
          className="stroke-slate-200/70 dark:stroke-[#1B222D]"
          strokeWidth="1"
          strokeDasharray="2 4"
        />
        <line
          x1={padLeft}
          y1={gridY2}
          x2={viewWidth - padRight}
          y2={gridY2}
          className="stroke-slate-200/70 dark:stroke-[#1B222D]"
          strokeWidth="1"
          strokeDasharray="2 4"
        />

        {/* Quiet high/low price watermarks on right edge */}
        {showPriceLabels && (
          <>
            <text
              x={viewWidth - padRight}
              y={padTop + 10}
              textAnchor="end"
              className="fill-slate-400/90 dark:fill-[#5E6B7D] text-[10px] font-num"
            >
              {formatPrice(dataMax, currency)}
            </text>
            <text
              x={viewWidth - padRight}
              y={padTop + plotH - 4}
              textAnchor="end"
              className="fill-slate-400/90 dark:fill-[#5E6B7D] text-[10px] font-num"
            >
              {formatPrice(dataMin, currency)}
            </text>
          </>
        )}

        {/* Previous close reference line on 1D chart */}
        {refY !== null && (
          <line
            x1={padLeft}
            y1={refY}
            x2={viewWidth - padRight}
            y2={refY}
            className="stroke-slate-400/50 dark:stroke-slate-500/45"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        )}

        {/* User GAV dashed reference line */}
        {gavY !== null && (
          <g>
            <line
              x1={padLeft}
              y1={gavY}
              x2={viewWidth - padRight}
              y2={gavY}
              stroke="#0099E5"
              strokeWidth="1.2"
              strokeDasharray="5 4"
              strokeOpacity="0.85"
            />
            <text
              x={padLeft + 4}
              y={Math.max(12, gavY - 5)}
              textAnchor="start"
              className="fill-[#0077CC] dark:fill-[#38BDF8] text-[10px] font-semibold font-num"
            >
              GAV {formatPrice(gavPrice, currency)}
            </text>
          </g>
        )}

        {/* Smooth vertical gradient area */}
        <path d={areaPath} fill={`url(#${gradientId})`} />

        {/* Smooth monotone price curve */}
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Subtle end-point beacon when not scrubbing */}
        {lastCoord && !activeCoord && (
          <g>
            <circle cx={lastCoord.x} cy={lastCoord.y} r="7" fill={strokeColor} fillOpacity="0.18" />
            <circle
              cx={lastCoord.x}
              cy={lastCoord.y}
              r="3.2"
              fill={strokeColor}
              className="stroke-white dark:stroke-[#090C10]"
              strokeWidth="1.5"
            />
          </g>
        )}

        {/* Clear Buy (K) and Sell (S) transaction dots on the curve */}
        {plottedMarkers.map((m) => {
          const isBuy = m.type === 'BUY';
          const isFocused = activeMarkerId === m.id;
          const fill = isBuy ? '#0099E5' : '#FF4D6A';
          return (
            <g
              key={m.id}
              onPointerEnter={() => {
                setActiveMarkerId(m.id);
                onHoverMarker?.(m);
              }}
              className="cursor-pointer"
            >
              {/* Soft outer halo */}
              <circle
                cx={m.x}
                cy={m.y}
                r={isFocused ? 11.5 : 8.5}
                fill={fill}
                fillOpacity={isFocused ? 0.28 : 0.16}
              />
              {/* Crisp high-contrast dot */}
              <circle
                cx={m.x}
                cy={m.y}
                r={isFocused ? 6 : 4.8}
                fill={fill}
                className="stroke-white dark:stroke-[#090C10]"
                strokeWidth="2"
              />
            </g>
          );
        })}

        {/* Active crosshair when scrubbing */}
        {activeCoord && (
          <g pointerEvents="none">
            <line
              x1={activeCoord.x}
              y1={padTop}
              x2={activeCoord.x}
              y2={padTop + plotH}
              className="stroke-slate-400/70 dark:stroke-slate-500/60"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle
              cx={activeCoord.x}
              cy={activeCoord.y}
              r="5.5"
              fill={strokeColor}
              className="stroke-white dark:stroke-[#090C10]"
              strokeWidth="2.5"
            />
          </g>
        )}

        {/* Minimalist date ticks */}
        <text
          x={padLeft}
          y={viewHeight - 4}
          textAnchor="start"
          className="fill-slate-400 dark:fill-[#687587] text-[10px]"
        >
          {formatChartDate(points[0].time, range)}
        </text>
        <text
          x={viewWidth / 2}
          y={viewHeight - 4}
          textAnchor="middle"
          className="fill-slate-400 dark:fill-[#687587] text-[10px]"
        >
          {formatChartDate(points[midIdx].time, range)}
        </text>
        <text
          x={viewWidth - padRight}
          y={viewHeight - 4}
          textAnchor="end"
          className="fill-slate-400 dark:fill-[#687587] text-[10px]"
        >
          {formatChartDate(points[points.length - 1].time, range)}
        </text>
      </svg>
    </div>
  );
};
