import { Request } from '../types';

// The Scheduler interface is the critical extensibility boundary.
// The core simulation loop interacts with scheduling logic ONLY through these methods.
// Adding a new scheduler (MLFQ, SJF, etc.) requires implementing this interface
// and calling registerScheduler() — zero changes to simulator.ts or any UI component.
//
// In the concurrent-decode model, the scheduler manages the PREFILL QUEUE only:
// - addRequest: called when a request arrives and needs prefill
// - selectNext: called each tick to pick which request gets the single prefill slot
// - removeRequest: called when prefill completes (request moves to the auto-decode batch)
// - afterPrefill: optional hook called after each prefill chunk executes (e.g., MLFQ demotion)
// - getEvictionCandidate: the simulator calls this to evict a decode-batch request when VRAM overflows
// Decode requests execute in parallel automatically; they bypass the scheduler queue.
export interface Scheduler {
  readonly name: string;         // Display name for UI dropdown
  readonly description: string;  // Short tooltip text

  addRequest(request: Request): void;       // Called when a request arrives (or resumes prefill)
  selectNext(): Request | null;             // Called each tick — returns request to prefill, or null
  removeRequest(requestId: number): void;   // Called when prefill completes or request is evicted
  getEvictionCandidate(decoding: Request[]): Request | null; // Pick which decode request to evict
  afterPrefill?(requestId: number): void;   // Optional: called after each prefill chunk (MLFQ demotion)
  reset(): void;                            // Called when simulation restarts
}

// Scheduler registry
const registry = new Map<string, () => Scheduler>();

export function registerScheduler(id: string, factory: () => Scheduler): void {
  registry.set(id, factory);
}

export function getSchedulerIds(): string[] {
  return Array.from(registry.keys());
}

export function getSchedulerMeta(): Array<{ id: string; name: string; description: string }> {
  return Array.from(registry.entries()).map(([id, factory]) => {
    const s = factory();
    return { id, name: s.name, description: s.description };
  });
}

export function createScheduler(id: string): Scheduler {
  const factory = registry.get(id);
  if (!factory) throw new Error(`Unknown scheduler: ${id}`);
  return factory();
}

// TODO (V2): Additional schedulers to add via registerScheduler():
// - SJF (Shortest Job First): selectNext picks request with fewest remaining tokens
// - LRTF (Longest Remaining Time First): inverse of SJF, for throughput max
