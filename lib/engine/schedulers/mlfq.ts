import { Scheduler, registerScheduler } from './interface';
import { Request } from '../types';

// MLFQ (Multi-Level Feedback Queue) scheduler.
//
// TWO complementary mechanisms keep this visually different from FCFS:
//
// 1. PREFILL PREEMPTION (via afterPrefill)
//    The prefill slot is divided into quantum-limited slices per queue level.
//    Long batch requests exhaust their Q0 quantum and are demoted to Q1/Q2,
//    letting newly arrived interactive requests (which land in Q0) cut ahead.
//    Max wait before a new interactive request gets served: Q0 quantum = 4 ticks
//    (vs. up to 40 ticks under FCFS for a 20K-token batch prefill).
//
//    Quantums:  Q0 = 4 prefill-chunks (~2048 tokens)
//               Q1 = 8 prefill-chunks (~4096 tokens)
//               Q2 = ∞ (runs to completion)
//
// 2. DECODE-PROGRESS EVICTION (via getEvictionCandidate)
//    When VRAM overflows, eviction priority is based on how many tokens
//    each decoding request has already generated — not on its prefill history.
//    Heavily decoding batch jobs (Q2: > 200 tokens) are evicted first.
//    Fresh/interactive requests (Q0: ≤ 50 tokens) are protected.
//
//    Q0 (≤  50 decoded): evict last   — protects short interactive responses
//    Q1 (≤ 200 decoded): evict second
//    Q2 (>  200 decoded): evict first  — these are the long-running batch jobs

class MLFQScheduler implements Scheduler {
  readonly name = 'MLFQ';
  readonly description =
    'Multi-Level Feedback Queue. Interactive requests get preemptive prefill priority. Long-running decode requests are evicted first, protecting short interactive responses.';

  // Prefill slot queues.  Only requests waiting for (or currently in) prefill
  // live here.  Decode requests are outside these queues — they run concurrently
  // and are only touched via getEvictionCandidate().
  private queues: Request[][] = [[], [], []];

  // Per-request count of prefill chunks consumed at the current queue level.
  // Reset to 0 on demotion.
  private prefillChunksUsed = new Map<number, number>();

  // Prefill-chunk quantums per level.
  // Each chunk processes up to 512 tokens, so Q0 ≈ 2 KB, Q1 ≈ 4 KB.
  private static readonly PREFILL_QUANTUMS = [4, 8, Infinity] as const;

  // Decode-progress thresholds for real-time eviction priority.
  // Chosen so that interactive requests (50–300 output tokens) stay in Q0 for
  // most of their lifetime, while batch requests (1 000–4 000 tokens) quickly
  // sink to Q1 then Q2.
  private static readonly DECODE_Q1_THRESHOLD = 50;   // tokens decoded → enter Q1
  private static readonly DECODE_Q2_THRESHOLD = 200;  // tokens decoded → enter Q2

  // Derive the eviction-priority level purely from current decode progress.
  // This is computed on-the-fly so it tracks the request's real resource use,
  // regardless of which prefill queue level it originally went through.
  private static decodeLevel(r: Request): 0 | 1 | 2 {
    if (r.decodeProgress > MLFQScheduler.DECODE_Q2_THRESHOLD) return 2;
    if (r.decodeProgress > MLFQScheduler.DECODE_Q1_THRESHOLD) return 1;
    return 0;
  }

  // ── Scheduler interface ────────────────────────────────────────────────────

  addRequest(request: Request): void {
    // All new arrivals enter Q0 — no decode history yet.
    request.schedulerMetadata.priorityLevel = 0;
    this.queues[0].push(request);
    this.prefillChunksUsed.set(request.id, 0);
  }

  selectNext(): Request | null {
    // Strict priority: serve Q0 before Q1, Q1 before Q2.
    // Within each queue: FCFS (queue[0] is the oldest request at that level).
    for (const queue of this.queues) {
      if (queue.length > 0) return queue[0];
    }
    return null;
  }

  // Called by the simulator after each prefill chunk executes for requestId.
  // This is the preemption hook: once a batch request exhausts its Q-level
  // quantum, it is demoted so that interactive requests waiting in Q0 can
  // cut ahead on the very next tick.
  afterPrefill(requestId: number): void {
    for (let level = 0; level < this.queues.length; level++) {
      const queue = this.queues[level];
      if (queue.length === 0 || queue[0].id !== requestId) continue;

      const used = (this.prefillChunksUsed.get(requestId) ?? 0) + 1;
      this.prefillChunksUsed.set(requestId, used);

      const quantum = MLFQScheduler.PREFILL_QUANTUMS[level];
      if (used >= quantum && level < 2) {
        // Quantum exhausted — demote to the next queue level.
        const req = queue.shift()!;
        req.schedulerMetadata.priorityLevel = level + 1;
        this.prefillChunksUsed.set(requestId, 0); // reset chunk counter for new level
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
        this.prefillChunksUsed.delete(requestId);
        return;
      }
    }
  }

  // Eviction candidate selection — strictly follows the spec's reverse-priority rule:
  //   Look in Q2 first (> 200 tokens decoded — the heavy batch hitters).
  //   If none, look in Q1 (> 50 tokens decoded).
  //   If none, look in Q0 (≤ 50 tokens decoded — protect interactive requests).
  //   Tiebreaker within a level: largest KV cache footprint (evicting it frees the most VRAM).
  getEvictionCandidate(decoding: Request[]): Request | null {
    if (decoding.length === 0) return null;

    // Group decoding requests by their real-time decode-progress level.
    const byLevel: [Request[], Request[], Request[]] = [[], [], []];
    for (const r of decoding) {
      byLevel[MLFQScheduler.decodeLevel(r)].push(r);
    }

    // Pick from the lowest-priority occupied level (highest level number).
    for (let level = 2; level >= 0; level--) {
      const candidates = byLevel[level];
      if (candidates.length === 0) continue;
      // Within the level, evict the request with the largest KV footprint.
      return candidates.reduce((best, r) =>
        r.kvCacheTokens > best.kvCacheTokens ? r : best,
      );
    }

    return null; // unreachable — decoding is non-empty
  }

  reset(): void {
    this.queues = [[], [], []];
    this.prefillChunksUsed.clear();
  }
}

registerScheduler('mlfq', () => new MLFQScheduler());
