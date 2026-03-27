'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { SimConfig, SimulationState } from '@/lib/engine/types';
import { SimulationResult, runSimulation } from '@/lib/engine/simulator';
import { percentile } from '@/lib/utils';

export type PlaybackStatus = 'idle' | 'computing' | 'ready' | 'running' | 'paused' | 'complete';

export interface DerivedMetrics {
  p99TTFT: number;
  avgTBT: number;
  throughput: number;
  evictionCount: number;
}

export interface SimulationHook {
  status: PlaybackStatus;
  currentTick: number;
  totalTicks: number;
  snapshotCount: number;
  currentSnapshotIndex: number;
  currentState: SimulationState | null;
  metrics: DerivedMetrics;
  speed: number;

  // Compute the simulation — does NOT auto-play. Leaves status at 'ready'.
  compute: (cfg: SimConfig) => void;
  // Playback controls — only valid when status !== 'idle' / 'computing'
  play: () => void;
  pause: () => void;
  seek: (snapshotIndex: number) => void;
  setSpeed: (s: number) => void;
}

export function useSimulation(): SimulationHook {
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [currentTickIndex, setCurrentTickIndex] = useState(0);
  const [speed, setSpeed] = useState(2);

  const resultRef = useRef<SimulationResult | null>(null);
  const rafRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const tickAccumulatorRef = useRef<number>(0);
  // Mirror currentTickIndex in a ref so animation callbacks don't go stale
  const currentTickIndexRef = useRef(0);

  const currentState = resultRef.current?.snapshots[currentTickIndex] ?? null;
  const totalTicks = resultRef.current?.totalTicks ?? 0;
  const snapshotCount = resultRef.current?.snapshots.length ?? 0;

  const metrics: DerivedMetrics = (() => {
    if (!currentState) return { p99TTFT: 0, avgTBT: 0, throughput: 0, evictionCount: 0 };
    const m = currentState.metrics;
    const tick = currentState.tick;
    return {
      p99TTFT: percentile(m.ttftValues, 99),
      avgTBT: m.tbtValues.length > 0
        ? m.tbtValues.reduce((a, b) => a + b, 0) / m.tbtValues.length
        : 0,
      throughput: tick > 0 ? m.tokensGenerated / tick : 0,
      evictionCount: m.evictionCount,
    };
  })();

  const stopAnimation = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  // Keep ref in sync
  const setIndex = useCallback((idx: number) => {
    currentTickIndexRef.current = idx;
    setCurrentTickIndex(idx);
  }, []);

  const animate = useCallback((timestamp: number) => {
    if (!resultRef.current) return;
    const snapshots = resultRef.current.snapshots;

    if (lastFrameTimeRef.current === 0) lastFrameTimeRef.current = timestamp;
    const elapsed = timestamp - lastFrameTimeRef.current;
    lastFrameTimeRef.current = timestamp;

    tickAccumulatorRef.current += (elapsed / 16.67) * speed;
    const ticksToAdvance = Math.floor(tickAccumulatorRef.current);
    tickAccumulatorRef.current -= ticksToAdvance;

    const next = currentTickIndexRef.current + ticksToAdvance;
    if (next >= snapshots.length - 1) {
      stopAnimation();
      setStatus('complete');
      setIndex(snapshots.length - 1);
    } else {
      setIndex(next);
      rafRef.current = requestAnimationFrame(animate);
    }
  }, [speed, stopAnimation, setIndex]);

  const play = useCallback(() => {
    if (!resultRef.current) return;
    if (currentTickIndexRef.current >= resultRef.current.snapshots.length - 1) {
      // Restart from beginning
      setIndex(0);
    }
    lastFrameTimeRef.current = 0;
    tickAccumulatorRef.current = 0;
    setStatus('running');
    rafRef.current = requestAnimationFrame(animate);
  }, [animate, setIndex]);

  const pause = useCallback(() => {
    stopAnimation();
    setStatus('paused');
  }, [stopAnimation]);

  const seek = useCallback((index: number) => {
    if (!resultRef.current) return;
    const clamped = Math.max(0, Math.min(index, resultRef.current.snapshots.length - 1));
    setIndex(clamped);
  }, [setIndex]);

  // compute() runs the DES synchronously then stops at 'ready' — no auto-play.
  // The user explicitly clicks play when they want to start the animation.
  const compute = useCallback((cfg: SimConfig) => {
    stopAnimation();
    setStatus('computing');
    setIndex(0);
    tickAccumulatorRef.current = 0;
    lastFrameTimeRef.current = 0;
    resultRef.current = null;

    // Defer to next task so the 'computing' status renders before blocking the thread
    setTimeout(() => {
      const result = runSimulation(cfg);
      resultRef.current = result;
      setIndex(0);
      setStatus('ready');
    }, 0);
  }, [stopAnimation, setIndex]);

  // Restart animation loop when speed changes mid-play
  useEffect(() => {
    if (status === 'running') {
      stopAnimation();
      lastFrameTimeRef.current = 0;
      tickAccumulatorRef.current = 0;
      rafRef.current = requestAnimationFrame(animate);
    }
  }, [speed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopAnimation(), [stopAnimation]);

  return {
    status,
    currentTick: currentState?.tick ?? 0,
    totalTicks,
    snapshotCount,
    currentSnapshotIndex: currentTickIndex,
    currentState,
    metrics,
    speed,
    compute,
    play,
    pause,
    seek,
    setSpeed: (s: number) => setSpeed(s),
  };
}
