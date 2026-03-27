'use client';

import React from 'react';
import { VRAMState } from '@/lib/engine/types';
import { fmtBytes } from '@/lib/utils';

interface Props {
  vram: VRAMState | null;
}

export default function VramGauge({ vram }: Props) {
  if (!vram) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-1">
          VRAM
        </div>
        <div className="h-40 bg-[var(--surface)] border border-[var(--border)] rounded flex items-center justify-center">
          <span className="text-[10px] text-[var(--text-muted)]">—</span>
        </div>
      </div>
    );
  }

  const total = vram.capacityBytes;
  const modelPct = (vram.modelWeightsBytes / total) * 100;
  const kvPct = (vram.kvCacheUsedBytes / total) * 100;
  const freePct = Math.max(0, 100 - modelPct - kvPct);

  const isOverBudget = vram.modelWeightsBytes + vram.kvCacheUsedBytes > total;

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2">
        VRAM
      </div>

      {/* Stacked vertical bar */}
      <div className="flex gap-2 items-stretch mb-2">
        <div className="w-6 flex-shrink-0 flex flex-col-reverse rounded overflow-hidden border border-[var(--border)] h-36">
          {/* Free — top */}
          <div
            className="transition-all duration-100"
            style={{ height: `${freePct}%`, backgroundColor: 'rgba(255,255,255,0.06)' }}
          />
          {/* KV Cache — middle */}
          <div
            className="transition-all duration-100"
            style={{
              height: `${Math.min(kvPct, 100 - modelPct)}%`,
              backgroundColor: isOverBudget ? '#ef4444' : '#10b981',
            }}
          />
          {/* Model weights — bottom */}
          <div
            className="transition-all duration-100"
            style={{ height: `${modelPct}%`, backgroundColor: '#6366f1' }}
          />
        </div>

        {/* Legend */}
        <div className="flex flex-col justify-between py-0.5 text-[10px] font-mono text-[var(--text-muted)] leading-tight">
          <div>
            <div className="text-[var(--text-secondary)]">Free</div>
            <div>{fmtBytes(Math.max(0, total - vram.modelWeightsBytes - vram.kvCacheUsedBytes))}</div>
          </div>
          <div>
            <div className={isOverBudget ? 'text-red-400' : 'text-emerald-400'}>KV Cache</div>
            <div>{fmtBytes(vram.kvCacheUsedBytes)}</div>
          </div>
          <div>
            <div className="text-indigo-400">Weights</div>
            <div>{fmtBytes(vram.modelWeightsBytes)}</div>
          </div>
        </div>
      </div>

      {/* Capacity */}
      <div className="text-[10px] font-mono text-[var(--text-muted)]">
        Cap: <span className="text-[var(--text-primary)]">{fmtBytes(total)}</span>
      </div>
      {isOverBudget && (
        <div className="text-[10px] text-red-400 mt-0.5">VRAM overflow!</div>
      )}
    </div>
  );
}
