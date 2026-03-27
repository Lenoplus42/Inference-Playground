'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Hardcoded FCFS schedule ───────────────────────────────────────────────────
//
// Serial prefill (one request at a time), concurrent decode.
// FCFS order determined by arrival tick.
//
// Prefill schedule:
//   #0 (batch):       arrives 0,  prefill starts 0,  ends 40  → decode 40→240
//   #1 (interactive): arrives 5,  prefill starts 40, ends 43  → decode 43→58
//   #2 (interactive): arrives 10, prefill starts 43, ends 45  → decode 45→55
//   #3 (interactive): arrives 12, prefill starts 45, ends 48  → decode 48→60
//   #4 (batch):       arrives 20, prefill starts 48, ends 78  → decode 78→228
//
// Interactive TTFT values: 38, 35, 36  →  avg 36 ticks
// Batch request #0 blocks interactives #1–#3 for 38 ticks total

interface Req {
  id: number;
  label: string;
  type: 'interactive' | 'batch';
  arrivalTick: number;
  prefillStart: number;
  firstToken: number;
  complete: number;
}

const REQUESTS: Req[] = [
  { id: 0, label: 'B', type: 'batch',       arrivalTick: 0,  prefillStart: 0,  firstToken: 40, complete: 240 },
  { id: 1, label: 'I', type: 'interactive', arrivalTick: 5,  prefillStart: 40, firstToken: 43, complete: 58  },
  { id: 2, label: 'I', type: 'interactive', arrivalTick: 10, prefillStart: 43, firstToken: 45, complete: 55  },
  { id: 3, label: 'I', type: 'interactive', arrivalTick: 12, prefillStart: 45, firstToken: 48, complete: 60  },
  { id: 4, label: 'B', type: 'batch',       arrivalTick: 20, prefillStart: 48, firstToken: 78, complete: 228 },
];

const TOTAL_TICKS = 240;
const TICK_INTERVAL_MS = 50;
const TICKS_PER_STEP = 2;

// Colors matching the playground
const COLORS = {
  queued: '#374151',
  prefill: '#3b82f6',
  decode: '#10b981',
} as const;

const ROW_HEIGHT = 18;
const ROW_GAP = 4;
const LABEL_W = 36;
const PAD_TOP = 24;
const PAD_BOT = 6;

// ── Canvas renderer ───────────────────────────────────────────────────────────

interface GanttProps {
  currentTick: number;
}

function MiniGantt({ currentTick }: GanttProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = PAD_TOP + REQUESTS.length * (ROW_HEIGHT + ROW_GAP) + PAD_BOT;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const chartW = W - LABEL_W;
    const tickScale = chartW / TOTAL_TICKS;
    const tick = currentTick;

    // Background chart area
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(LABEL_W, 0, chartW, H);

    // Tick axis
    const tickInterval = 50;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    for (let t = 0; t <= TOTAL_TICKS; t += tickInterval) {
      const x = LABEL_W + t * tickScale;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, PAD_TOP, 0.5, H - PAD_TOP - PAD_BOT);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(String(t), x, 13);
    }

    // Current tick indicator
    if (tick > 0) {
      const cx = LABEL_W + tick * tickScale;
      ctx.strokeStyle = 'rgba(253,181,21,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, PAD_TOP);
      ctx.lineTo(cx, H - PAD_BOT);
      ctx.stroke();
    }

    // Request rows
    REQUESTS.forEach((r, rowIdx) => {
      const y = PAD_TOP + rowIdx * (ROW_HEIGHT + ROW_GAP);
      const maxX = LABEL_W + chartW;

      // Row label
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = r.type === 'interactive' ? '#10b981' : '#9ca3af';
      ctx.fillText(`${r.label}${r.id}`, LABEL_W - 4, y + ROW_HEIGHT - 3);

      // Background row
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(LABEL_W, y, chartW, ROW_HEIGHT);

      if (tick < r.arrivalTick) return; // not arrived yet

      const arrX = LABEL_W + r.arrivalTick * tickScale;
      const nowX = Math.min(LABEL_W + tick * tickScale, maxX);

      // Queued segment: arrival → prefillStart (or now if still queued)
      const prefillStartX = LABEL_W + r.prefillStart * tickScale;
      if (prefillStartX > arrX) {
        const queuedEnd = Math.min(prefillStartX, nowX);
        if (queuedEnd > arrX) {
          ctx.fillStyle = COLORS.queued;
          ctx.fillRect(arrX, y + 1, queuedEnd - arrX, ROW_HEIGHT - 2);
        }
      } else if (nowX > arrX) {
        // arrived but didn't queue (immediate prefill start)
      }

      if (tick <= r.prefillStart) return; // waiting in queue

      // Prefill segment
      const firstTokX = LABEL_W + r.firstToken * tickScale;
      const prefillEndX = Math.min(firstTokX, nowX);
      if (prefillEndX > prefillStartX) {
        ctx.fillStyle = COLORS.prefill;
        ctx.fillRect(prefillStartX, y + 1, Math.min(prefillEndX - prefillStartX, maxX - prefillStartX), ROW_HEIGHT - 2);
      }

      if (tick <= r.firstToken) return; // still in prefill

      // Decode segment
      const completeX = LABEL_W + r.complete * tickScale;
      const decodeEndX = Math.min(tick < r.complete ? nowX : completeX, maxX);
      if (decodeEndX > firstTokX) {
        const alpha = tick >= r.complete ? 0.35 : 1;
        ctx.fillStyle = alpha < 1
          ? `rgba(16,185,129,${alpha})`
          : COLORS.decode;
        ctx.fillRect(firstTokX, y + 1, decodeEndX - firstTokX, ROW_HEIGHT - 2);
      }
    });

    // Annotation: Head-of-Line Blocking arrow (batch blocks interactives)
    if (tick >= 58) {
      const batch0PrefillEnd = LABEL_W + 40 * tickScale;
      const interactive1Complete = LABEL_W + 58 * tickScale;
      const annotY = PAD_TOP + 0 * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT + ROW_GAP;
      const annotH = 3 * (ROW_HEIGHT + ROW_GAP);

      // Vertical bracket on the left of the blocked zone
      ctx.strokeStyle = 'rgba(253,181,21,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(batch0PrefillEnd, annotY);
      ctx.lineTo(batch0PrefillEnd, annotY + annotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      if (tick >= 80) {
        ctx.font = '9px sans-serif';
        ctx.fillStyle = 'rgba(253,181,21,0.7)';
        ctx.textAlign = 'left';
        ctx.fillText('← blocked by batch #0', batch0PrefillEnd + 4, annotY + annotH / 2 + 3);
      }
    }
  }, [currentTick]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  const canvasH = PAD_TOP + REQUESTS.length * (ROW_HEIGHT + ROW_GAP) + PAD_BOT;

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: canvasH }} />
    </div>
  );
}

// ── Section 3 ─────────────────────────────────────────────────────────────────

export default function Section3Gantt() {
  const [currentTick, setCurrentTick] = useState(0);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const startedRef = useRef(false);

  const start = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setCurrentTick(0);
    setDone(false);
    let t = 0;
    intervalRef.current = setInterval(() => {
      t += TICKS_PER_STEP;
      if (t >= TOTAL_TICKS) {
        t = TOTAL_TICKS;
        clearInterval(intervalRef.current!);
        setDone(true);
      }
      setCurrentTick(t);
    }, TICK_INTERVAL_MS);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          start();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [start]);

  // Computed metrics
  const interactiveTTFTs = [43 - 5, 45 - 10, 48 - 12]; // 38, 35, 36
  const avgTTFT = Math.round(interactiveTTFTs.reduce((a, b) => a + b, 0) / interactiveTTFTs.length);
  // Total ticks interactive requests spent waiting in queue due to batch #0
  const totalBlocked = (40 - 5) + (40 - 10) + (40 - 12); // 35+30+28 = 93

  return (
    <section ref={sectionRef} style={{ background: 'var(--bg-primary)', padding: '96px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        <div style={{ maxWidth: 680, marginBottom: 40 }}>
          <p style={{ fontSize: 12, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Section 3
          </p>
          <h2 style={{ fontSize: 30, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px', lineHeight: 1.2 }}>
            When requests compete
          </h2>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 16px' }}>
            A real GPU doesn't serve one user at a time. Dozens of requests share the same chip. The simplest way to manage them: <strong style={{ color: 'var(--text-primary)' }}>FCFS</strong> — First Come, First Served. Process requests in the order they arrive.
          </p>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 16px' }}>
            This works fine when all requests are similar in size. But when a 50K-token document summarization arrives before your 100-token chat message, you wait for that entire long request to finish prefill before yours can start. This is called <strong style={{ color: 'var(--text-primary)' }}>Head-of-Line Blocking</strong>.
          </p>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
            The Gantt chart below shows 5 requests arriving at a shared GPU. Watch what happens to the interactive ones.
          </p>
        </div>

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 28,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              FCFS scheduling — 5 requests (I = interactive, B = batch)
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['queued', 'prefill', 'decode'] as const).map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[s] }} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{s}</span>
                </div>
              ))}
            </div>
          </div>

          <MiniGantt currentTick={currentTick} />

          {/* Request table */}
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {REQUESTS.map(r => {
              const ttft = r.firstToken - r.arrivalTick;
              const visible = currentTick >= r.firstToken;
              return (
                <div
                  key={r.id}
                  style={{
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    opacity: visible ? 1 : 0.4,
                    transition: 'opacity 0.3s ease',
                  }}
                >
                  <div style={{ fontSize: 10, color: r.type === 'interactive' ? '#10b981' : 'var(--text-muted)', marginBottom: 2 }}>
                    {r.label}{r.id} — {r.type.slice(0, 5)}.
                  </div>
                  {visible && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      TTFT: <span style={{ color: r.type === 'interactive' && ttft > 20 ? '#ef4444' : 'var(--text-primary)', fontWeight: 600 }}>{ttft}t</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary metrics */}
          {done && (
            <div
              style={{
                marginTop: 20,
                padding: '14px 16px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8,
                fontSize: 13,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: 'var(--text-primary)' }}>Interactive avg TTFT: {avgTTFT} ticks.</strong>
              {' '}Batch request #0 kept interactive requests in the queue for{' '}
              <strong style={{ color: '#ef4444' }}>{totalBlocked} ticks combined</strong>.
              {' '}This is Head-of-Line Blocking. The playground below lets you switch to MLFQ scheduling to see how priority queues fix this.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
