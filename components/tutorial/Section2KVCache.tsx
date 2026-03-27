'use client';

import { useState } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const VRAM_GB = 80;          // H100 SXM
const WEIGHTS_GB = 17;       // Llama 3 8B ≈ 17 GB
const KB_PER_TOKEN = 128;    // KV bytes per token (decimal KB): 128,000 bytes

// ── VRAM Bar ──────────────────────────────────────────────────────────────────

interface VramBarProps {
  kvGB: number;
  overflow: boolean;
}

function VramBar({ kvGB, overflow }: VramBarProps) {
  const freeGB = Math.max(0, VRAM_GB - WEIGHTS_GB - kvGB);
  const kvCapped = Math.min(kvGB, VRAM_GB - WEIGHTS_GB);
  const overflowGB = kvGB - kvCapped;

  const weightsPct = (WEIGHTS_GB / VRAM_GB) * 100;
  const kvPct = (kvCapped / VRAM_GB) * 100;
  const freePct = (freeGB / VRAM_GB) * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {/* Overflow indicator above bar */}
      <div style={{ height: 28, display: 'flex', alignItems: 'flex-end' }}>
        {overflow && (
          <div
            style={{
              fontSize: 12,
              color: '#ef4444',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            +{overflowGB.toFixed(1)} GB over capacity
          </div>
        )}
      </div>

      {/* Bar container */}
      <div
        style={{
          width: 120,
          height: 300,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}
      >
        {/* Capacity line at top */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: '#ef4444',
            zIndex: 2,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 9,
            color: '#ef4444',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        >
          {VRAM_GB} GB capacity
        </div>

        {/* Free segment */}
        <div
          style={{
            width: '100%',
            height: `${freePct}%`,
            background: 'rgba(255,255,255,0.04)',
            transition: 'height 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {freePct > 8 && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{freeGB.toFixed(1)} GB free</span>
          )}
        </div>

        {/* KV Cache segment */}
        <div
          style={{
            width: '100%',
            height: `${kvPct}%`,
            background: overflow ? '#ef4444' : '#3b82f6',
            transition: 'height 0.2s ease, background 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {kvPct > 6 && (
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', textAlign: 'center', padding: '0 4px' }}>
              {kvCapped.toFixed(1)} GB KV
            </span>
          )}
        </div>

        {/* Weights segment */}
        <div
          style={{
            width: '100%',
            height: `${weightsPct}%`,
            background: '#374151',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)' }}>{WEIGHTS_GB} GB weights</span>
        </div>
      </div>

      {/* GB label */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>H100 SXM 80 GB</div>
    </div>
  );
}

// ── Section 2 ─────────────────────────────────────────────────────────────────

export default function Section2KVCache() {
  const [users, setUsers] = useState(1);
  const [tokensPerUser, setTokensPerUser] = useState(500);

  // 128 KB per token (decimal): 128,000 bytes
  const kvBytes = users * tokensPerUser * KB_PER_TOKEN * 1000;
  const kvGB = kvBytes / 1e9;
  const overflow = WEIGHTS_GB + kvGB > VRAM_GB;

  return (
    <section style={{ background: 'var(--bg-secondary)', padding: '96px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        <div style={{ maxWidth: 680, marginBottom: 40 }}>
          <p style={{ fontSize: 12, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Section 2
          </p>
          <h2 style={{ fontSize: 30, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px', lineHeight: 1.2 }}>
            The memory problem: KV Cache
          </h2>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 16px' }}>
            During decode, the GPU needs to remember every previous token to generate the next one. It does this by storing Key and Value vectors for each token — this is the <strong style={{ color: 'var(--text-primary)' }}>KV cache</strong>. It grows linearly: every new token adds to it.
          </p>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 16px' }}>
            For Llama 3 8B, each token costs about <strong style={{ color: 'var(--text-primary)' }}>128 KB of GPU memory</strong>. An H100 has 80 GB total. The model weights take ~17 GB. That leaves ~63 GB for KV cache — sounds like a lot, until you have dozens of users at once.
          </p>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 16px' }}>
            When VRAM fills up, the system must <strong style={{ color: 'var(--text-primary)' }}>evict</strong> a request's KV cache to CPU memory over the PCIe bus. That request stalls until the data is paged back in. This is the core tension in LLM serving: memory is the bottleneck.
          </p>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
            Drag the sliders below to feel the pressure.
          </p>
        </div>

        {/* Interactive widget */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 32,
          }}
        >
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 28 }}>
            VRAM pressure calculator — Llama 3 8B on H100
          </p>

          <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap', alignItems: 'flex-start' }}>

            {/* VRAM bar */}
            <VramBar kvGB={kvGB} overflow={overflow} />

            {/* Controls + info */}
            <div style={{ flex: 1, minWidth: 240 }}>
              {/* Sliders */}
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Concurrent users: <strong style={{ color: 'var(--text-primary)' }}>{users}</strong>
                </label>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={users}
                  onChange={e => setUsers(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  <span>1</span><span>100</span>
                </div>
              </div>

              <div style={{ marginBottom: 32 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Tokens per user: <strong style={{ color: 'var(--text-primary)' }}>{tokensPerUser.toLocaleString()}</strong>
                </label>
                <input
                  type="range"
                  min={100}
                  max={32000}
                  step={100}
                  value={tokensPerUser}
                  onChange={e => setTokensPerUser(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  <span>100</span><span>32 K</span>
                </div>
              </div>

              {/* Breakdown */}
              <div
                style={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '14px 16px',
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}
              >
                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>Memory breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Row label="Model weights" value={`${WEIGHTS_GB} GB`} color="#374151" />
                  <Row
                    label={`KV cache (${users} × ${tokensPerUser.toLocaleString()} × 128 KB)`}
                    value={`${kvGB.toFixed(1)} GB`}
                    color={overflow ? '#ef4444' : '#3b82f6'}
                  />
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6 }}>
                    <Row
                      label="Total"
                      value={`${(WEIGHTS_GB + kvGB).toFixed(1)} / ${VRAM_GB} GB`}
                      color={overflow ? '#ef4444' : 'var(--text-secondary)'}
                      bold
                    />
                  </div>
                </div>
              </div>

              {/* Warning */}
              {overflow && (
                <div
                  style={{
                    marginTop: 16,
                    padding: '10px 14px',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 8,
                    fontSize: 13,
                    color: '#ef4444',
                    fontWeight: 500,
                  }}
                >
                  ⚠ VRAM full — eviction required
                  <div style={{ fontSize: 11, fontWeight: 400, color: 'rgba(239,68,68,0.8)', marginTop: 4 }}>
                    {(kvGB - (VRAM_GB - WEIGHTS_GB)).toFixed(1)} GB of KV cache won't fit. The serving system will swap requests to CPU RAM, stalling their responses.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  color,
  bold = false,
}: {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span
          style={{
            color: 'var(--text-muted)',
            fontSize: 11,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      </div>
      <span style={{ color: bold ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: bold ? 600 : 400, flexShrink: 0 }}>
        {value}
      </span>
    </div>
  );
}
