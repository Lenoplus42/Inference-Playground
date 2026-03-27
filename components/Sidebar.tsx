'use client';

import React from 'react';
import { SimConfig, WorkloadConfig, ArrivalPattern } from '@/lib/engine/types';
import { MODEL_PRESETS, HARDWARE_PRESETS } from '@/lib/engine/presets';
import { getSchedulerMeta } from '@/lib/engine/schedulers/interface';
import { derivePhysicalConstants } from '@/lib/engine/types';
import { fmtBytes, fmtNumber } from '@/lib/utils';

interface Props {
  config: SimConfig;
  isComputing: boolean;
  onChange: (cfg: SimConfig) => void;
  onRun: () => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
        <span className="text-xs font-mono text-[var(--accent)]">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 appearance-none bg-[var(--border)] rounded cursor-pointer accent-[var(--accent)]"
      />
    </div>
  );
}

export default function Sidebar({ config, isComputing, onChange, onRun }: Props) {
  const schedulers = getSchedulerMeta();
  const consts = derivePhysicalConstants(config);

  const setModel = (id: string) => {
    const model = MODEL_PRESETS[id];
    if (!model) return;
    onChange({ ...config, model });
  };

  const setHardware = (id: string) => {
    const hardware = HARDWARE_PRESETS[id];
    if (!hardware) return;
    onChange({ ...config, hardware });
  };

  const setWorkload = (patch: Partial<WorkloadConfig>) => {
    onChange({ ...config, workload: { ...config.workload, ...patch } });
  };

  const modelKey = Object.keys(MODEL_PRESETS).find(k => MODEL_PRESETS[k].name === config.model.name) ?? 'llama3_8b';
  const hwKey = Object.keys(HARDWARE_PRESETS).find(k => HARDWARE_PRESETS[k].name === config.hardware.name) ?? 'h100';

  return (
    <aside className="w-[220px] flex-shrink-0 border-r border-[var(--border)] flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-3">
          Configuration
        </div>

        {/* Model preset */}
        <section className="mb-4">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">Model</div>
          <select
            value={modelKey}
            onChange={e => setModel(e.target.value)}
            className="w-full text-xs bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          >
            {Object.entries(MODEL_PRESETS).map(([k, m]) => (
              <option key={k} value={k}>{m.name}</option>
            ))}
          </select>
          <div className="mt-1.5 text-[10px] text-[var(--text-muted)] font-mono leading-relaxed">
            KV/token: {fmtBytes(consts.kvBytesPerToken)}<br />
            Max KV: {fmtNumber(consts.maxKVCacheTokens)} tok
          </div>
        </section>

        {/* Hardware preset */}
        <section className="mb-4">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">Hardware</div>
          <select
            value={hwKey}
            onChange={e => setHardware(e.target.value)}
            className="w-full text-xs bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          >
            {Object.entries(HARDWARE_PRESETS).map(([k, h]) => (
              <option key={k} value={k}>{h.name}</option>
            ))}
          </select>
        </section>

        {/* Workload */}
        <section className="mb-4">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">Workload</div>

          <SliderRow
            label="Arrival rate (λ)"
            value={config.workload.arrivalLambda}
            min={0.005}
            max={0.1}
            step={0.005}
            format={v => v.toFixed(3)}
            onChange={v => setWorkload({ arrivalLambda: v })}
          />

          <SliderRow
            label="Interactive ratio"
            value={config.workload.interactiveRatio}
            min={0}
            max={1}
            step={0.05}
            format={v => Math.round(v * 100) + '%'}
            onChange={v => setWorkload({ interactiveRatio: v })}
          />

          <SliderRow
            label="Total requests"
            value={config.workload.numRequests}
            min={10}
            max={500}
            step={10}
            format={v => String(Math.round(v))}
            onChange={v => setWorkload({ numRequests: Math.round(v) })}
          />

          <div className="mb-2">
            <div className="text-xs text-[var(--text-muted)] mb-1">Arrival pattern</div>
            <div className="flex gap-1.5">
              {(['poisson', 'fixed', 'burst'] as ArrivalPattern[]).map(p => (
                <button
                  key={p}
                  onClick={() => setWorkload({ arrivalPattern: p })}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    config.workload.arrivalPattern === p
                      ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Scheduler */}
        <section className="mb-4">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">Scheduler</div>
          <select
            value={config.schedulerId}
            onChange={e => onChange({ ...config, schedulerId: e.target.value })}
            className="w-full text-xs bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          >
            {schedulers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="mt-1 text-[10px] text-[var(--text-muted)] leading-relaxed">
            {schedulers.find(s => s.id === config.schedulerId)?.description}
          </div>
        </section>
      </div>

      {/* Run button — pinned to bottom of sidebar */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-[var(--border)]">
        <button
          onClick={onRun}
          disabled={isComputing}
          className={`w-full py-2 text-xs font-semibold rounded border transition-colors ${
            isComputing
              ? 'border-[var(--border)] text-[var(--text-muted)] cursor-not-allowed'
              : 'border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)]/10 active:bg-[var(--accent)]/20'
          }`}
        >
          {isComputing ? 'Computing…' : 'Update Simulation'}
        </button>
      </div>
    </aside>
  );
}
