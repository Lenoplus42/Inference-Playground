import { Scheduler, registerScheduler } from './interface';
import { Request } from '../types';

// MLFQ (Multi-Level Feedback Queue) scheduler.
// Manages the prefill queue with priority demotion.
//
// Three priority queues:
//   Q0 (highest): quantum = 4 prefill-ticks  (~2048 tokens)
//   Q1 (middle):  quantum = 8 prefill-ticks  (~4096 tokens)
//   Q2 (lowest):  quantum = ∞ (FCFS)
//
// New requests enter Q0. After exhausting the quantum, the request is demoted to
// the next queue. Short interactive requests (≤512 tokens) finish in 1 prefill-tick
// and never get demoted. Long batch requests fall through to Q2 and complete
// prefill there without interruption.
//
// In the concurrent-decode model, MLFQ only manages the prefill slot. Decode runs
// automatically for all in-flight requests. Eviction from the decode batch uses
// lowest-priority-queue-first: the batch request with the most decode progress
// (lowest queue level at time of original arrival) is sacrificed first.
class MLFQScheduler implements Scheduler {
  readonly name = 'MLFQ';
  readonly description = 'Multi-Level Feedback Queue. Interactive requests get preemptive prefill priority. Long batch jobs are demoted, reducing P99 TTFT.';

  private static QUANTUMS = [4, 8, Infinity];
  private queues: Request[][] = [[], [], []];
  private quantumUsed = new Map<number, number>();

  addRequest(request: Request): void {
    // New arrivals always enter Q0. Evicted-then-resumed requests retain their level.
    const level = Math.min(Math.max((request.schedulerMetadata.priorityLevel as number) ?? 0, 0), 2);
    request.schedulerMetadata.priorityLevel = level;
    this.queues[level].push(request);
    if (!this.quantumUsed.has(request.id)) {
      this.quantumUsed.set(request.id, 0);
    }
  }

  selectNext(): Request | null {
    for (const queue of this.queues) {
      if (queue.length > 0) return queue[0];
    }
    return null;
  }

  // Called by the simulator AFTER each prefill chunk is executed for requestId.
  // Increments quantum usage; demotes if the quota is exhausted.
  afterPrefill(requestId: number): void {
    for (let level = 0; level < this.queues.length; level++) {
      if (this.queues[level].length === 0 || this.queues[level][0].id !== requestId) continue;

      const used = (this.quantumUsed.get(requestId) ?? 0) + 1;
      this.quantumUsed.set(requestId, used);

      const quantum = MLFQScheduler.QUANTUMS[level];
      if (used >= quantum && level < 2) {
        const req = this.queues[level].shift()!;
        req.schedulerMetadata.priorityLevel = level + 1;
        this.quantumUsed.set(requestId, 0);
        this.queues[level + 1].push(req);
      }
      break;
    }
  }

  removeRequest(requestId: number): void {
    for (const queue of this.queues) {
      const idx = queue.findIndex(r => r.id === requestId);
      if (idx !== -1) {
        queue.splice(idx, 1);
        this.quantumUsed.delete(requestId);
        return;
      }
    }
  }

  // Eviction from decode batch: target the request that arrived at the lowest
  // priority (highest queue number = longest-running batch) with the most KV.
  getEvictionCandidate(decoding: Request[]): Request | null {
    if (decoding.length === 0) return null;
    // Highest schedulerMetadata.priorityLevel = most demoted = lowest priority
    return decoding.reduce((best, r) => {
      const rLevel = (r.schedulerMetadata.priorityLevel as number) ?? 0;
      const bLevel = (best.schedulerMetadata.priorityLevel as number) ?? 0;
      if (rLevel > bLevel) return r;
      if (rLevel === bLevel && r.kvCacheTokens > best.kvCacheTokens) return r;
      return best;
    });
  }

  reset(): void {
    this.queues = [[], [], []];
    this.quantumUsed.clear();
  }
}

registerScheduler('mlfq', () => new MLFQScheduler());
