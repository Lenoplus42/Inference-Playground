'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const TOKENS = [
  'The', ' capital', ' of', ' France', ' is', ' Paris', '.', ' Paris',
  ' is', ' known', ' for', ' the', ' Eiffel', ' Tower', ',', ' world-class',
  ' cuisine', ',', ' and', ' its', ' rich', ' cultural', ' history', '.',
];

const PREFILL_TICKS = 15;
const TOTAL_TICKS = PREFILL_TICKS + TOKENS.length; // 39
const TICK_MS = 110;

const BLUE = '#3b82f6';
const GREEN = '#10b981';
const GOLD = '#fdb515';

// ── Mini Timeline Canvas ───────────────────────────────────────────────────────

interface TimelineProps {
  tick: number;
}

function MiniTimeline({ tick }: TimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = 56;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const BAR_Y = 16;
    const BAR_H = 24;
    const prefillFrac = PREFILL_TICKS / TOTAL_TICKS;
    const prefillEndX = prefillFrac * W;

    // Background track
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.roundRect(0, BAR_Y, W, BAR_H, 4);
    ctx.fill();

    if (tick > 0) {
      // Blue prefill segment
      const prefillProgress = Math.min(tick, PREFILL_TICKS) / PREFILL_TICKS;
      const blueW = prefillProgress * prefillEndX;
      if (blueW > 0) {
        ctx.fillStyle = BLUE;
        ctx.beginPath();
        ctx.roundRect(0, BAR_Y, blueW, BAR_H, 4);
        ctx.fill();
      }

      // Green decode segment
      const decodeTick = Math.max(0, tick - PREFILL_TICKS);
      if (decodeTick > 0) {
        const greenW = (decodeTick / TOKENS.length) * (W - prefillEndX);
        if (greenW > 0) {
          ctx.fillStyle = GREEN;
          ctx.beginPath();
          ctx.roundRect(prefillEndX, BAR_Y, greenW, BAR_H, 4);
          ctx.fill();
        }

        // TBT tick marks within the drawn green portion
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        for (let i = 1; i < decodeTick; i++) {
          const tx = prefillEndX + (i / TOKENS.length) * (W - prefillEndX);
          ctx.beginPath();
          ctx.moveTo(tx, BAR_Y + 4);
          ctx.lineTo(tx, BAR_Y + BAR_H - 4);
          ctx.stroke();
        }
      }

      // TTFT marker — vertical gold line at prefill/decode boundary
      if (tick > PREFILL_TICKS - 2) {
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(prefillEndX, BAR_Y - 4);
        ctx.lineTo(prefillEndX, BAR_Y + BAR_H + 4);
        ctx.stroke();
      }
    }

    // Axis labels below bar
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText('tick 0', 2, BAR_Y + BAR_H + 13);
    ctx.textAlign = 'right';
    ctx.fillText(`tick ${TOTAL_TICKS}`, W - 2, BAR_Y + BAR_H + 13);

    // Phase labels inside bar (only when wide enough)
    if (tick >= 4 && W > 200) {
      ctx.font = '9px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'center';
      const blueMid = Math.min(tick, PREFILL_TICKS) / PREFILL_TICKS * prefillEndX / 2;
      ctx.fillText('prefill', blueMid, BAR_Y + BAR_H / 2 + 3.5);
    }

    const decodeTick2 = Math.max(0, tick - PREFILL_TICKS);
    if (decodeTick2 >= 3 && W > 200) {
      ctx.font = '9px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'center';
      const greenMid = prefillEndX + (decodeTick2 / TOKENS.length) * (W - prefillEndX) / 2;
      ctx.fillText('decode', greenMid, BAR_Y + BAR_H / 2 + 3.5);
    }
  }, [tick]);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
    </div>
  );
}

// ── Section 1 ─────────────────────────────────────────────────────────────────

export default function Section1TokenGen() {
  const [tick, setTick] = useState(0);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const startedRef = useRef(false);

  const start = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTick(0);
    setDone(false);
    let t = 0;
    intervalRef.current = setInterval(() => {
      t++;
      setTick(t);
      if (t >= TOTAL_TICKS) {
        clearInterval(intervalRef.current!);
        setDone(true);
      }
    }, TICK_MS);
  }, []);

  // Auto-start on scroll into view
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

  const handleReplay = () => {
    startedRef.current = true;
    start();
  };

  const decodeTick = Math.max(0, tick - PREFILL_TICKS);
  const tokenCount = decodeTick;
  const isInPrefill = tick > 0 && tick <= PREFILL_TICKS;
  const isInDecode = tick > PREFILL_TICKS && !done;
  const displayText = TOKENS.slice(0, tokenCount).join('');

  const ttftTicks = PREFILL_TICKS; // always the same for this demo

  return (
    <section ref={sectionRef} style={{ background: 'var(--bg-primary)', padding: '0 24px 96px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Section heading */}
        <div style={{ maxWidth: 680, marginBottom: 40 }}>
          <p style={{ fontSize: 12, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Section 1
          </p>
          <h2 style={{ fontSize: 30, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px', lineHeight: 1.2 }}>
            What happens when you send a prompt?
          </h2>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 16px' }}>
            When you type a message and press enter, the GPU does two things in sequence — and understanding this sequence explains almost everything about LLM performance.
          </p>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 16px' }}>
            First: <strong style={{ color: 'var(--text-primary)' }}>Prefill</strong>. The GPU reads your entire input prompt in parallel, processing all tokens at once. This is compute-heavy. It's why there's a brief pause before the first word appears.
          </p>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 16px' }}>
            Then: <strong style={{ color: 'var(--text-primary)' }}>Decode</strong>. The GPU generates the response one token at a time. Each new token depends on all previous tokens — so this is memory-heavy. The GPU reads from the <strong style={{ color: 'var(--text-primary)' }}>KV cache</strong> on every step. This is the text streaming you see in ChatGPT.
          </p>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
            Two key metrics fall out of this: <strong style={{ color: 'var(--text-primary)' }}>TTFT</strong> (Time to First Token) measures how long you wait for the first word. <strong style={{ color: 'var(--text-primary)' }}>TBT</strong> (Time Between Tokens) measures how smooth the streaming feels — the tick marks in the demo below.
          </p>
        </div>

        {/* Interactive demo */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 28,
          }}
        >
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>
            Live demo — request timeline
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 32, alignItems: 'start' }}>

            {/* Left: Mini timeline + annotations */}
            <div>
              <MiniTimeline tick={tick} />

              {/* Legend */}
              <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: BLUE, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Prefill</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: GREEN, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Decode (each tick mark = 1 token = 1 TBT)</span>
                </div>
                {tick > PREFILL_TICKS - 2 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 2, height: 10, background: GOLD, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: GOLD }}>TTFT = {ttftTicks} ticks</span>
                  </div>
                )}
              </div>

              {/* Metrics */}
              {done && (
                <div
                  style={{
                    marginTop: 16,
                    padding: '10px 14px',
                    background: 'var(--surface-elevated)',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 20 }}>
                    <div>
                      <span style={{ color: GOLD, fontWeight: 600 }}>TTFT</span>
                      <span style={{ marginLeft: 6, color: 'var(--text-secondary)' }}>{ttftTicks} ticks</span>
                    </div>
                    <div>
                      <span style={{ color: GREEN, fontWeight: 600 }}>TBT</span>
                      <span style={{ marginLeft: 6, color: 'var(--text-secondary)' }}>1 tick / token</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Tokens</span>
                      <span style={{ marginLeft: 6, color: 'var(--text-secondary)' }}>{TOKENS.length}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Chat bubble */}
            <div>
              <div
                style={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 16,
                  minHeight: 120,
                }}
              >
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Prompt</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
                  What is the capital of France?
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Response</p>
                <p
                  style={{
                    fontSize: 14,
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    lineHeight: 1.6,
                    minHeight: '3em',
                  }}
                >
                  {tick === 0 && (
                    <span style={{ color: 'var(--text-muted)' }}>
                      <BlinkingCursor />
                    </span>
                  )}
                  {isInPrefill && (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Processing prompt<AnimatedDots />
                    </span>
                  )}
                  {(isInDecode || done) && (
                    <>
                      {displayText}
                      {!done && <BlinkingCursor />}
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Replay button */}
          {done && (
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <button
                onClick={handleReplay}
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '6px 14px',
                  cursor: 'pointer',
                }}
              >
                Replay ↻
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function BlinkingCursor() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '0.55em',
        background: 'var(--text-primary)',
        marginLeft: 1,
        verticalAlign: 'text-bottom',
        animation: 'blink 1s step-end infinite',
        height: '1em',
      }}
    />
  );
}

function AnimatedDots() {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const id = setInterval(() => {
      setDots(d => (d.length >= 3 ? '' : d + '.'));
    }, 400);
    return () => clearInterval(id);
  }, []);
  return <span>{dots}</span>;
}
