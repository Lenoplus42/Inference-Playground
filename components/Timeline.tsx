'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { SimulationState, Request, RequestState } from '@/lib/engine/types';

interface TooltipData {
  x: number;
  y: number;
  request: Request;
  currentTick: number;
}

interface Props {
  state: SimulationState | null;
  totalTicks: number;
  allRequestIds: number[];   // stable sorted list of all request IDs (for row ordering)
  requestTypes: Map<number, 'interactive' | 'batch'>; // from initial generation
}

// Color palette — must match CSS variables for consistency
const COLORS: Record<RequestState, string> = {
  queued: '#374151',    // dark gray
  prefill: '#3b82f6',   // blue
  decode: '#10b981',    // emerald
  evicted: '#ef4444',   // red
  complete: '#1f2937',  // very dark, faded
};

const COMPLETE_ALPHA = 0.35;
const ROW_HEIGHT = 16;
const ROW_GAP = 3;
const LABEL_WIDTH = 52;
const PADDING_TOP = 24;   // space for tick axis
const PADDING_BOTTOM = 4;

export default function Timeline({ state, totalTicks, allRequestIds, requestTypes }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const totalRows = allRequestIds.length;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !state) return;

    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = PADDING_TOP + totalRows * (ROW_HEIGHT + ROW_GAP) + PADDING_BOTTOM;

    // Resize canvas if needed
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
    }

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const chartWidth = W - LABEL_WIDTH;
    const ticksToShow = Math.max(totalTicks, state.tick, 1);
    const tickScale = chartWidth / ticksToShow;

    const requestMap = new Map<number, Request>();
    for (const r of state.requests) {
      requestMap.set(r.id, r);
    }

    // ── Tick axis ────────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(LABEL_WIDTH, 0, chartWidth, H);

    const tickInterval = Math.ceil(ticksToShow / 8 / 100) * 100 || 50;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';

    for (let t = 0; t <= ticksToShow; t += tickInterval) {
      const x = LABEL_WIDTH + t * tickScale;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x, PADDING_TOP, 0.5, H - PADDING_TOP - PADDING_BOTTOM);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(String(t), x, 12);
    }

    // Current tick indicator
    if (state.tick > 0) {
      const cx = LABEL_WIDTH + state.tick * tickScale;
      ctx.strokeStyle = 'rgba(253,181,21,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, PADDING_TOP);
      ctx.lineTo(cx, H - PADDING_BOTTOM);
      ctx.stroke();
    }

    // ── Request rows ─────────────────────────────────────────────────────────
    allRequestIds.forEach((id, rowIdx) => {
      const r = requestMap.get(id);
      const y = PADDING_TOP + rowIdx * (ROW_HEIGHT + ROW_GAP);

      // Row label
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      const typeChar = (requestTypes.get(id) ?? 'batch') === 'interactive' ? 'I' : 'B';
      ctx.fillText(`${typeChar}${id}`, LABEL_WIDTH - 4, y + ROW_HEIGHT - 3);

      if (!r) {
        // Request hasn't arrived yet — draw empty row placeholder
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(LABEL_WIDTH, y, chartWidth, ROW_HEIGHT);
        return;
      }

      // Background row
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(LABEL_WIDTH, y, chartWidth, ROW_HEIGHT);

      // Draw state segments by reading the current state snapshot
      // For a smooth Gantt, we draw from arrivalTick → current tick using the known state

      const arrX = LABEL_WIDTH + r.arrivalTick * tickScale;
      const nowX = LABEL_WIDTH + state.tick * tickScale;
      const maxX = LABEL_WIDTH + chartWidth;

      // Queued segment (arrival → prefillStart or now if still queued)
      const prefillStartX = r.timestamps.prefillStart > 0
        ? LABEL_WIDTH + r.timestamps.prefillStart * tickScale
        : (r.state === 'queued' || r.state === 'evicted' ? nowX : arrX);

      if (prefillStartX > arrX) {
        ctx.fillStyle = r.state === 'complete' ? adjustAlpha(COLORS.queued, COMPLETE_ALPHA) : COLORS.queued;
        ctx.fillRect(arrX, y + 1, Math.min(prefillStartX - arrX, maxX - arrX), ROW_HEIGHT - 2);
      }

      // Prefill segment
      if (r.timestamps.prefillStart > 0) {
        const firstTokX = r.timestamps.firstToken > 0
          ? LABEL_WIDTH + r.timestamps.firstToken * tickScale
          : (r.state === 'prefill' ? nowX : prefillStartX);

        if (firstTokX > prefillStartX) {
          ctx.fillStyle = r.state === 'complete' ? adjustAlpha(COLORS.prefill, COMPLETE_ALPHA) : COLORS.prefill;
          ctx.fillRect(prefillStartX, y + 1, Math.min(firstTokX - prefillStartX, maxX - prefillStartX), ROW_HEIGHT - 2);
        }
      }

      // Decode / evicted segment
      // evictedAt is set on first eviction and never cleared — so we always
      // split the bar at that tick regardless of whether the request later
      // resumed or completed. Red hatching persists to the end of the bar,
      // making eviction history permanently visible.
      if (r.timestamps.firstToken > 0) {
        const firstTokX = LABEL_WIDTH + r.timestamps.firstToken * tickScale;
        const endX = r.state === 'complete'
          ? LABEL_WIDTH + r.timestamps.complete * tickScale
          : nowX;
        const faded = r.state === 'complete';
        const evictedAtTick = r.timestamps.evictedAt;

        if (evictedAtTick > 0 && evictedAtTick > r.timestamps.firstToken) {
          const evictX = LABEL_WIDTH + evictedAtTick * tickScale;
          const resumedAtTick = r.timestamps.resumedAt;
          const resumeX = resumedAtTick > 0 ? LABEL_WIDTH + resumedAtTick * tickScale : null;

          // Green: firstToken → evictedAt
          if (evictX > firstTokX) {
            ctx.fillStyle = faded ? adjustAlpha(COLORS.decode, COMPLETE_ALPHA) : COLORS.decode;
            ctx.fillRect(firstTokX, y + 1, Math.min(evictX - firstTokX, maxX - firstTokX), ROW_HEIGHT - 2);
          }

          // Red + hatching: evictedAt → resumedAt (or endX if still evicted)
          const redEndX = resumeX ?? endX;
          if (redEndX > evictX) {
            ctx.fillStyle = faded ? adjustAlpha(COLORS.evicted, COMPLETE_ALPHA) : COLORS.evicted;
            ctx.fillRect(evictX, y + 1, Math.min(redEndX - evictX, maxX - evictX), ROW_HEIGHT - 2);
            ctx.strokeStyle = faded ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 0.5;
            const clampedRedEnd = Math.min(redEndX, maxX);
            for (let dx = 0; dx < clampedRedEnd - evictX; dx += 5) {
              ctx.beginPath();
              ctx.moveTo(evictX + dx, y + 1);
              ctx.lineTo(evictX + dx + (ROW_HEIGHT - 2), y + ROW_HEIGHT - 1);
              ctx.stroke();
            }
          }

          // Green: resumedAt → endX (request back in decode or completed after resume)
          if (resumeX !== null && endX > resumeX) {
            ctx.fillStyle = faded ? adjustAlpha(COLORS.decode, COMPLETE_ALPHA) : COLORS.decode;
            ctx.fillRect(resumeX, y + 1, Math.min(endX - resumeX, maxX - resumeX), ROW_HEIGHT - 2);
          }
        } else {
          // Never evicted — solid decode bar (faded if complete)
          if (endX > firstTokX) {
            ctx.fillStyle = faded ? adjustAlpha(COLORS.decode, COMPLETE_ALPHA) : COLORS.decode;
            ctx.fillRect(firstTokX, y + 1, Math.min(endX - firstTokX, maxX - firstTokX), ROW_HEIGHT - 2);
          }
        }
      }

      // Guard: evicted before any prefill (shouldn't occur but defensive)
      if (r.state === 'evicted' && r.timestamps.firstToken === 0) {
        ctx.fillStyle = COLORS.evicted;
        ctx.fillRect(arrX, y + 1, Math.min(nowX - arrX, maxX - arrX), ROW_HEIGHT - 2);
      }
    });
  }, [state, totalTicks, allRequestIds, requestTypes]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !state) { setTooltip(null); return; }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const chartWidth = canvas.clientWidth - LABEL_WIDTH;
    const ticksToShow = Math.max(totalTicks, state.tick, 1);
    const tickScale = chartWidth / ticksToShow;

    // Which row?
    const rowIdx = Math.floor((my - PADDING_TOP) / (ROW_HEIGHT + ROW_GAP));
    if (rowIdx < 0 || rowIdx >= allRequestIds.length || mx < LABEL_WIDTH) {
      setTooltip(null);
      return;
    }

    const id = allRequestIds[rowIdx];
    const r = state.requests.find(req => req.id === id);
    if (!r) { setTooltip(null); return; }

    setTooltip({ x: e.clientX, y: e.clientY, request: r, currentTick: state.tick });
  }, [state, totalTicks, allRequestIds]);

  const canvasHeight = PADDING_TOP + totalRows * (ROW_HEIGHT + ROW_GAP) + PADDING_BOTTOM;

  return (
    <div className="relative w-full" ref={containerRef}>
      <canvas
        ref={canvasRef}
        style={{ height: Math.max(canvasHeight, 100) }}
        className="w-full block"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {/* Legend */}
      <div className="flex gap-4 mt-2 px-1 flex-wrap">
        {(Object.entries(COLORS) as [RequestState, string][]).map(([state, color]) => (
          <div key={state} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-[var(--text-muted)] capitalize">{state}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--text-muted)]">I = interactive, B = batch</span>
        </div>
      </div>
      {tooltip && <RequestTooltip {...tooltip} />}
    </div>
  );
}

function RequestTooltip({ x, y, request: r, currentTick }: TooltipData) {
  const ttft = r.timestamps.firstToken > 0 ? r.timestamps.firstToken - r.arrivalTick : null;
  return (
    <div
      className="fixed z-50 pointer-events-none bg-[var(--surface-elevated)] border border-[var(--border)] rounded p-2 text-[10px] font-mono text-[var(--text-primary)] shadow-lg"
      style={{ left: x + 12, top: y - 8, maxWidth: 200 }}
    >
      <div className="font-semibold mb-1">Request #{r.id}</div>
      <div className="text-[var(--text-muted)] space-y-0.5">
        <div>Type: <span className="text-[var(--text-primary)]">{r.type}</span></div>
        <div>State: <span style={{ color: COLORS[r.state] }}>{r.state}</span></div>
        <div>Input: <span className="text-[var(--text-primary)]">{r.inputTokens} tok</span></div>
        <div>Output: <span className="text-[var(--text-primary)]">{r.outputTokens} tok</span></div>
        <div>Prefill: <span className="text-[var(--text-primary)]">{r.prefillProgress}/{r.inputTokens}</span></div>
        <div>Decode: <span className="text-[var(--text-primary)]">{r.decodeProgress}/{r.outputTokens}</span></div>
        {ttft !== null && <div>TTFT: <span className="text-[var(--accent)]">{ttft}t</span></div>}
        {r.penaltyRemaining > 0 && <div>PCIe wait: <span className="text-red-400">{r.penaltyRemaining}t</span></div>}
      </div>
    </div>
  );
}

function adjustAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
