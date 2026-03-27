'use client';

import React, { useState, useMemo } from 'react';
import Layout from '@/components/Layout';
import Sidebar from '@/components/Sidebar';
import Timeline from '@/components/Timeline';
import PlaybackControls from '@/components/PlaybackControls';
import VramGauge from '@/components/VramGauge';
import MetricsPanel from '@/components/MetricsPanel';
import { useSimulation } from '@/hooks/useSimulation';
import { SimConfig } from '@/lib/engine/types';
import { SCENARIO_PRESETS, scenarioToSimConfig } from '@/lib/engine/presets';
import HeroSection from '@/components/tutorial/HeroSection';
import Section1TokenGen from '@/components/tutorial/Section1TokenGen';
import Section2KVCache from '@/components/tutorial/Section2KVCache';
import Section3Gantt from '@/components/tutorial/Section3Gantt';
import TransitionSection from '@/components/tutorial/TransitionSection';

// Default config: Mixed Traffic (populated into sidebar on load, not auto-run)
const DEFAULT_CONFIG: SimConfig = scenarioToSimConfig(SCENARIO_PRESETS[1]);

export default function Home() {
  // `config` is the sidebar's current settings — the source of truth for what
  // will be computed next. It is NOT automatically synced to the running simulation;
  // the user must click "Update Simulation" to apply changes.
  const [config, setConfig] = useState<SimConfig>(DEFAULT_CONFIG);
  const [activeScenarioId, setActiveScenarioId] = useState<string>('mixed');

  const sim = useSimulation();

  // Scenario buttons: update sidebar config AND immediately compute.
  const handleScenarioSelect = (scenarioId: string) => {
    const preset = SCENARIO_PRESETS.find(s => s.id === scenarioId);
    if (!preset) return;
    const cfg = scenarioToSimConfig(preset);
    setConfig(cfg);
    setActiveScenarioId(scenarioId);
    sim.compute(cfg);
  };

  const handleConfigChange = (cfg: SimConfig) => {
    setConfig(cfg);
    setActiveScenarioId(''); // deselect scenario badge when user customizes
  };

  // "Update Simulation" button — the only path to computing a new simulation.
  const handleCompute = () => {
    sim.compute(config);
  };

  // Runtime request metadata: stable once a simulation is computed.
  // Sorted by arrivalTick for stable row ordering in the Gantt chart.
  const runtimeRequestIds = useMemo(() => {
    if (!sim.currentState) return [];
    return [...sim.currentState.requests]
      .sort((a, b) => a.arrivalTick - b.arrivalTick)
      .map(r => r.id);
  }, [sim.currentState?.requests.length]); // only re-sort when request count changes

  const runtimeTypes = useMemo(() => {
    if (!sim.currentState) return new Map<number, 'interactive' | 'batch'>();
    return new Map(sim.currentState.requests.map(r => [r.id, r.type] as const));
  }, [sim.currentState?.requests.length]);

  const isComputing = sim.status === 'computing';

  return (
    <>
      {/* Tutorial sections — scroll down to reach the playground */}
      <HeroSection />
      <Section1TokenGen />
      <Section2KVCache />
      <Section3Gantt />
      <TransitionSection />

      {/* Playground — anchored so the "Open the Playground" button can scroll here */}
      <div id="playground">
        <Layout
          header={
            <Header
              activeScenarioId={activeScenarioId}
              onScenarioSelect={handleScenarioSelect}
              simStatus={sim.status}
            />
          }
          sidebar={
            <Sidebar
              config={config}
              isComputing={isComputing}
              onChange={handleConfigChange}
              onRun={handleCompute}
            />
          }
          center={
            <CenterPanel
              sim={sim}
              runtimeRequestIds={runtimeRequestIds}
              runtimeTypes={runtimeTypes}
              onCompute={handleCompute}
            />
          }
          rightPanel={
            <RightPanel sim={sim} config={config} />
          }
        />
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Header({
  activeScenarioId,
  onScenarioSelect,
  simStatus,
}: {
  activeScenarioId: string;
  onScenarioSelect: (id: string) => void;
  simStatus: string;
}) {
  return (
    <>
      <div className="flex-shrink-0">
        <span className="text-sm font-semibold text-[var(--accent)] tracking-tight">
          Inference Playground
        </span>
        <span className="ml-2 text-[10px] text-[var(--text-muted)]">LLM Serving Simulator</span>
      </div>

      <div className="flex items-center gap-2 ml-4">
        <span className="text-[10px] text-[var(--text-muted)] mr-1">Scenarios:</span>
        {SCENARIO_PRESETS.map(s => (
          <button
            key={s.id}
            onClick={() => onScenarioSelect(s.id)}
            title={s.description}
            className={`text-xs px-3 py-1 rounded border transition-colors ${
              activeScenarioId === s.id
                ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="ml-auto text-[10px] text-[var(--text-muted)]">
        Clicking a scenario loads its parameters into the sidebar.{' '}
        <span className="text-[var(--text-secondary)]">Click "Update Simulation" to run.</span>
      </div>
    </>
  );
}

function CenterPanel({
  sim,
  runtimeRequestIds,
  runtimeTypes,
  onCompute,
}: {
  sim: ReturnType<typeof useSimulation>;
  runtimeRequestIds: number[];
  runtimeTypes: Map<number, 'interactive' | 'batch'>;
  onCompute: () => void;
}) {
  const showTimeline = sim.status !== 'idle' && sim.currentState !== null;

  return (
    <>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-2">
        {sim.status === 'computing' ? (
          <ComputingState />
        ) : !showTimeline ? (
          <EmptyState onCompute={onCompute} />
        ) : (
          <Timeline
            state={sim.currentState}
            totalTicks={sim.totalTicks}
            allRequestIds={runtimeRequestIds}
            requestTypes={runtimeTypes}
          />
        )}
      </div>

      <PlaybackControls
        status={sim.status}
        currentTick={sim.currentTick}
        totalTicks={sim.totalTicks}
        snapshotCount={sim.snapshotCount}
        currentSnapshotIndex={sim.currentSnapshotIndex}
        speed={sim.speed}
        onPlay={sim.play}
        onPause={sim.pause}
        onSeek={sim.seek}
        onSpeedChange={sim.setSpeed}
      />
    </>
  );
}

function EmptyState({ onCompute }: { onCompute: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
      <div className="w-12 h-12 rounded-full border-2 border-[var(--accent)]/30 flex items-center justify-center">
        <svg width="14" height="16" viewBox="0 0 14 16" fill="var(--accent)" opacity="0.6">
          <polygon points="0,0 14,8 0,16" />
        </svg>
      </div>
      <div>
        <div className="text-sm text-[var(--text-secondary)] mb-1">
          Select a scenario or configure the sidebar
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          then click <span className="text-[var(--text-secondary)]">"Update Simulation"</span> to compute
        </div>
      </div>
      <button
        onClick={onCompute}
        className="mt-2 px-5 py-2 text-sm border border-[var(--accent)] text-[var(--accent)] rounded hover:bg-[var(--accent)]/10 transition-colors"
      >
        Run Simulation
      </button>
    </div>
  );
}

function ComputingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="text-sm text-[var(--text-muted)]">Computing simulation…</div>
      <div className="text-xs text-[var(--text-muted)]">
        This runs synchronously in the browser — should take &lt;200ms
      </div>
    </div>
  );
}

function RightPanel({
  sim,
  config,
}: {
  sim: ReturnType<typeof useSimulation>;
  config: SimConfig;
}) {
  const completedCount = sim.currentState?.metrics.completedCount ?? 0;
  const evictionCount = sim.currentState?.metrics.evictionCount ?? 0;

  return (
    <>
      <VramGauge vram={sim.currentState?.vram ?? null} />
      <MetricsPanel
        metrics={sim.metrics}
        completedCount={completedCount}
        totalRequests={config.workload.numRequests}
        evictionCount={evictionCount}
      />
    </>
  );
}
