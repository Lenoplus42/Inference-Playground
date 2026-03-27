import { Scheduler, registerScheduler } from './interface';
import { Request } from '../types';

// First-Come, First-Served scheduler.
// Manages the prefill queue only. Requests are prefilled in arrival order.
// No preemption: once a batch request seizes the prefill slot it holds it until
// prefill completes, blocking all later arrivals. This is the industry baseline
// and the scheduler that produces Head-of-Line Blocking in the Mixed Traffic demo.
class FCFSScheduler implements Scheduler {
  readonly name = 'FCFS';
  readonly description = 'First-Come, First-Served. No preemption. Long batch requests block interactive ones during prefill.';

  private queue: Request[] = [];

  addRequest(request: Request): void {
    this.queue.push(request);
  }

  selectNext(): Request | null {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  removeRequest(requestId: number): void {
    const idx = this.queue.findIndex(r => r.id === requestId);
    if (idx !== -1) this.queue.splice(idx, 1);
  }

  // Eviction candidate from the decode batch: largest KV footprint first.
  // Break ties by arrival order (evict the newer one — older has more sunk compute).
  getEvictionCandidate(decoding: Request[]): Request | null {
    if (decoding.length === 0) return null;
    return decoding.reduce((best, r) =>
      r.kvCacheTokens > best.kvCacheTokens ||
      (r.kvCacheTokens === best.kvCacheTokens && r.arrivalTick > best.arrivalTick)
        ? r : best
    );
  }

  reset(): void {
    this.queue = [];
  }
}

registerScheduler('fcfs', () => new FCFSScheduler());
