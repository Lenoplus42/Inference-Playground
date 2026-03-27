'use client';

import React from 'react';
import { DerivedMetrics } from '@/hooks/useSimulation';
import { fmtTicks } from '@/lib/utils';

interface Props {
  metrics: DerivedMetrics;
  completedCount: number;
  totalRequests: number;
  evictionCount: number;
}

interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
  color?: 'green' | 'yellow' | 'red' | 'neutral';
}

function MetricCard({ label, value, subtext, color = 'neutral' }: MetricCardProps) {
  const colorClass = {
    green: 'text-emerald-400',
    yellow: 'text-amber-400',
    red: 'text-red-400',
    neutral: 'text-[var(--text-primary)]',
  }[color];

  return (
    <div className="border border-[var(--border)] rounded p-2 bg-[var(--surface)]">
      <div className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-1">{label}</div>
      <div className={`text-base font-mono font-semibold tabular-nums ${colorClass}`}>{value}</div>
      {subtext && <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{subtext}</div>}
    </div>
  );
}

export default function MetricsPanel({ metrics, completedCount, totalRequests, evictionCount }: Props) {
  const ttftColor = metrics.p99TTFT === 0 ? 'neutral'
    : metrics.p99TTFT < 50 ? 'green'
    : metrics.p99TTFT < 200 ? 'yellow'
    : 'red';

  const tbtColor = metrics.avgTBT === 0 ? 'neutral'
    : metrics.avgTBT < 5 ? 'green'
    : metrics.avgTBT < 20 ? 'yellow'
    : 'red';

  const evictionColor = evictionCount === 0 ? 'neutral' : 'red';

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2">
        Metrics
      </div>
      <div className="flex flex-col gap-2">
        <MetricCard
          label="P99 TTFT"
          value={fmtTicks(metrics.p99TTFT)}
          subtext="Time to first token"
          color={ttftColor}
        />
        <MetricCard
          label="Avg TBT"
          value={fmtTicks(metrics.avgTBT)}
          subtext="Time between tokens"
          color={tbtColor}
        />
        <MetricCard
          label="Throughput"
          value={metrics.throughput > 0 ? metrics.throughput.toFixed(2) : '—'}
          subtext="tokens / tick"
          color="neutral"
        />
        <MetricCard
          label="Evictions"
          value={String(evictionCount)}
          subtext={`${completedCount} / ${totalRequests} done`}
          color={evictionColor}
        />
      </div>
    </div>
  );
}
