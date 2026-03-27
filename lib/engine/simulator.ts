// Import schedulers to trigger self-registration
import './schedulers/fcfs';
import './schedulers/mlfq';

import {
  SimConfig,
  SimulationState,
  Request,
  VRAMState,
  LiveMetrics,
  derivePhysicalConstants,
  computeEvictionPenalty,
} from './types';
import { createScheduler } from './schedulers/interface';
import { generateRequests } from './arrival';

export interface SimulationResult {
  snapshots: SimulationState[];
  totalTicks: number;
  finalMetrics: LiveMetrics;
}

function cloneRequest(r: Request): Request {
  return {
    ...r,
    schedulerMetadata: { ...r.schedulerMetadata },
    timestamps: { ...r.timestamps },
  };
}

// ── Concurrent-Decode Simulation Model ───────────────────────────────────────
//
// Each tick:
//   1. ARRIVE:   Requests whose Poisson arrival tick has come enter the prefill queue.
//   2. RESUME:   Evicted decode requests decrement their PCIe penalty; resume when done.
//   3. PREFILL:  The scheduler picks ONE request to prefill (serial prefill slot).
//                After the chunk, afterPrefill() is called so MLFQ can demote.
//   4. DECODE:   ALL requests in 'decode' state advance by 1 token in parallel.
//                This is the key driver of VRAM pressure: multiple requests accumulate
//                KV simultaneously while the prefill slot is busy with the next job.
//   5. EVICT:    Sum KV across prefill + decode requests. If over budget, evict the
//                largest-KV decode request (via scheduler.getEvictionCandidate).
//   6. SNAPSHOT: Capture state (downsampled if simulation is long).
//
// Why concurrent decode creates VRAM pressure under FCFS:
//   - Request A (40K tokens) starts prefill → takes ~78 ticks to fill
//   - Meanwhile requests B, C, D finish their prefill and enter decode
//   - After 100 ticks: A is still prefilling, B+C+D+... are all decoding in parallel
//   - Combined KV of decode batch overflows budget → eviction visible in the demo
export function runSimulation(cfg: SimConfig): SimulationResult {
  const consts = derivePhysicalConstants(cfg);
  const scheduler = createScheduler(cfg.schedulerId);
  scheduler.reset();

  const allRequests = generateRequests(cfg.workload);

  const liveRequests = new Map<number, Request>();
  for (const r of allRequests) {
    liveRequests.set(r.id, r);
  }

  const metrics: LiveMetrics = {
    completedCount: 0,
    evictionCount: 0,
    tokensGenerated: 0,
    ttftValues: [],
    tbtValues: [],
  };

  const snapshots: SimulationState[] = [];
  let tick = 0;
  let nextArrivalIdx = 0;
  let pending = allRequests.length;

  // Track which request holds the prefill slot across ticks.
  // When the scheduler selects a different request (MLFQ preemption), the old one
  // reverts to 'queued' so the scheduler can reinsert it at the right level.
  let activePrefillId: number | null = null;

  // Snapshot downsampling: for long simulations, storing every tick wastes memory.
  // We estimate the total ticks upfront and sample accordingly, capping at ~2000 snapshots.
  const lastArrivalTick = allRequests[allRequests.length - 1]?.arrivalTick ?? 1;
  const estTotalTicks = Math.max(lastArrivalTick * 3, 500);
  const snapshotEvery = Math.max(1, Math.floor(estTotalTicks / 2000));

  while (pending > 0) {
    tick++;

    // ── Phase 1: ARRIVE ──────────────────────────────────────────────────────
    while (nextArrivalIdx < allRequests.length && allRequests[nextArrivalIdx].arrivalTick <= tick) {
      const r = liveRequests.get(allRequests[nextArrivalIdx].id)!;
      r.state = 'queued';
      r.timestamps.queued = tick;
      scheduler.addRequest(r);
      nextArrivalIdx++;
    }

    // ── Phase 2: RESUME (PCIe page-in timers, budget-aware) ─────────────────
    // Evicted requests come from the decode batch; they resume directly to decode
    // without going through the prefill scheduler.
    //
    // Budget-aware: only resume if the KV budget has enough headroom. This prevents
    // the evict → immediate-resume → evict loop that would otherwise cause nearly
    // every batch request to be evicted repeatedly. Requests with expired penalty but
    // no budget headroom stay in 'evicted' state until running requests complete and
    // free up VRAM. This models the real "waiting for page-in slot" behaviour.
    const currentDecodeKV = Array.from(liveRequests.values()).reduce(
      (sum, r) => (r.state === 'decode' || r.state === 'prefill' ? sum + r.kvCacheTokens : sum),
      0,
    );
    let availableKV = consts.maxKVCacheTokens > 0
      ? consts.maxKVCacheTokens - currentDecodeKV
      : Infinity;

    for (const r of liveRequests.values()) {
      if (r.state !== 'evicted') continue;
      if (r.penaltyRemaining > 0) {
        r.penaltyRemaining--;
        continue;
      }
      // Penalty expired — only resume if there's budget headroom
      if (availableKV >= r.kvCacheTokens) {
        r.state = 'decode';
        if (r.timestamps.resumedAt === 0) r.timestamps.resumedAt = tick;
        availableKV -= r.kvCacheTokens;
      }
      // else: keep waiting (state stays 'evicted', penaltyRemaining stays 0)
    }

    // ── Phase 3: SCHEDULE (prefill slot selection) ───────────────────────────
    const selected = scheduler.selectNext();

    // Handle MLFQ preemption: if the scheduler chose a different request than
    // last tick, the previous request's prefill was interrupted — reset it to
    // 'queued' so it stays in the scheduler at its demoted queue level.
    if (activePrefillId !== null && selected?.id !== activePrefillId) {
      const prev = liveRequests.get(activePrefillId);
      if (prev && prev.state === 'prefill') prev.state = 'queued';
    }
    activePrefillId = selected?.id ?? null;

    // ── Phase 4: PREFILL (serial, one request per tick) ──────────────────────
    if (selected && selected.state !== 'complete' && selected.state !== 'decode') {
      const r = selected;

      if (r.state === 'queued') {
        r.state = 'prefill';
        if (r.timestamps.prefillStart === 0) r.timestamps.prefillStart = tick;
      }

      const remaining = r.inputTokens - r.prefillProgress;
      const chunk = Math.min(consts.prefillChunkSize, remaining);
      r.prefillProgress += chunk;
      r.kvCacheTokens += chunk;

      // Notify scheduler (MLFQ uses this to track per-request quantum usage)
      scheduler.afterPrefill?.(r.id);

      if (r.prefillProgress >= r.inputTokens) {
        // Prefill complete → move to parallel decode batch
        r.state = 'decode';
        r.timestamps.firstToken = tick;
        metrics.ttftValues.push(tick - r.arrivalTick);
        scheduler.removeRequest(r.id);
        activePrefillId = null;
      }
    }

    // ── Phase 5: DECODE (parallel, all decode requests advance 1 token) ──────
    // This is what creates VRAM pressure: every in-flight request grows its KV
    // by 1 token per tick simultaneously, independent of the prefill slot.
    for (const r of liveRequests.values()) {
      if (r.state !== 'decode') continue;

      r.decodeProgress += consts.decodeTokensPerTick;
      r.kvCacheTokens += consts.decodeTokensPerTick;
      metrics.tokensGenerated += consts.decodeTokensPerTick;

      if (r.decodeProgress >= r.outputTokens) {
        r.state = 'complete';
        r.timestamps.lastToken = tick;
        r.timestamps.complete = tick;
        const decodeSpan = tick - r.timestamps.firstToken;
        const intervals = Math.max(1, r.decodeProgress - 1);
        metrics.tbtValues.push(decodeSpan / intervals);
        metrics.completedCount++;
        pending--;
        if (r.id === activePrefillId) activePrefillId = null;
      }
    }

    // ── Phase 6: VRAM accounting + EVICTION ──────────────────────────────────
    let vramUsed = 0;
    const decoding: Request[] = [];

    for (const r of liveRequests.values()) {
      if (r.state === 'prefill' || r.state === 'decode') {
        vramUsed += r.kvCacheTokens;
        if (r.state === 'decode') decoding.push(r);
      }
    }

    if (consts.maxKVCacheTokens > 0 && vramUsed > consts.maxKVCacheTokens) {
      // Build a stable snapshot of decode requests for the scheduler to evaluate
      const decodingCopy = [...decoding];
      while (vramUsed > consts.maxKVCacheTokens && decodingCopy.length > 0) {
        const victim = scheduler.getEvictionCandidate(decodingCopy);
        if (!victim) break;

        const penalty = computeEvictionPenalty(
          victim.kvCacheTokens,
          consts.kvBytesPerToken,
          cfg.hardware.pcieBandwidthBytesPerSec,
          cfg.tickDurationMs,
        );

        vramUsed -= victim.kvCacheTokens;
        victim.state = 'evicted';
        victim.penaltyRemaining = penalty;
        // Record first eviction tick for split-color rendering in Timeline
        if (victim.timestamps.evictedAt === 0) victim.timestamps.evictedAt = tick;
        metrics.evictionCount++;

        const idx = decodingCopy.indexOf(victim);
        if (idx !== -1) decodingCopy.splice(idx, 1);
      }
    }

    // ── Phase 7: SNAPSHOT (downsampled) ──────────────────────────────────────
    if (tick % snapshotEvery === 0 || pending === 0) {
      // Recompute vramUsed post-eviction for the snapshot
      let snapVram = 0;
      for (const r of liveRequests.values()) {
        if (r.state === 'prefill' || r.state === 'decode') snapVram += r.kvCacheTokens;
      }

      const vram: VRAMState = {
        modelWeightsBytes: cfg.model.modelWeightBytes,
        kvCacheUsedBytes: snapVram * consts.kvBytesPerToken,
        capacityBytes: cfg.hardware.vramBytes,
      };

      snapshots.push({
        tick,
        requests: Array.from(liveRequests.values()).map(cloneRequest),
        vram,
        metrics: {
          ...metrics,
          ttftValues: [...metrics.ttftValues],
          tbtValues: [...metrics.tbtValues],
        },
      });
    }

    // Safety cap: prevent infinite loops on pathological configs
    if (tick >= 50000) break;
  }

  return {
    snapshots,
    totalTicks: tick,
    finalMetrics: metrics,
  };
}
