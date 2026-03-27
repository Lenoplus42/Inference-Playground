import { WorkloadConfig, Request, ArrivalPattern } from './types';

// Seeded LCG pseudo-random number generator for reproducible simulations
class PRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  // Returns uniform [0, 1)
  next(): number {
    // LCG parameters from Numerical Recipes
    this.state = Math.imul(1664525, this.state) + 1013904223;
    this.state = this.state >>> 0;
    return this.state / 4294967296;
  }

  // Exponential variate with rate λ (mean = 1/λ)
  exponential(lambda: number): number {
    return -Math.log(1 - this.next()) / lambda;
  }

  // Uniform integer in [min, max] inclusive
  uniformInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  // Fisher-Yates shuffle
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}

// Generate all requests for a simulation run.
// Returns an array sorted by arrivalTick ascending.
export function generateRequests(cfg: WorkloadConfig, seed = 42): Request[] {
  const rng = new PRNG(seed);
  const n = cfg.numRequests;
  const interactiveCount = Math.round(n * cfg.interactiveRatio);

  const requests: Request[] = [];

  for (let i = 0; i < n; i++) {
    const isInteractive = i < interactiveCount;
    const prefillRange = isInteractive ? cfg.interactivePrefillRange : cfg.batchPrefillRange;
    const decodeRange = isInteractive ? cfg.interactiveDecodeRange : cfg.batchDecodeRange;

    requests.push({
      id: i,
      type: isInteractive ? 'interactive' : 'batch',
      arrivalTick: 0, // assigned below
      inputTokens: rng.uniformInt(prefillRange[0], prefillRange[1]),
      outputTokens: rng.uniformInt(decodeRange[0], decodeRange[1]),
      prefillProgress: 0,
      decodeProgress: 0,
      state: 'queued',
      schedulerMetadata: {},
      kvCacheTokens: 0,
      penaltyRemaining: 0,
      timestamps: {
        queued: 0,
        prefillStart: 0,
        firstToken: 0,
        evictedAt: 0,
        resumedAt: 0,
        lastToken: 0,
        complete: 0,
      },
    });
  }

  // Scatter heavy requests so they aren't clustered at the tail (which would
  // artificially favor MLFQ by front-loading interactive work)
  rng.shuffle(requests);

  // Assign arrival ticks based on arrival pattern
  assignArrivalTicks(requests, cfg, rng);

  // Sort ascending by arrival tick
  requests.sort((a, b) => a.arrivalTick - b.arrivalTick);

  // Re-assign sequential IDs after shuffle + sort to keep them meaningful
  requests.forEach((r, idx) => (r.id = idx));

  return requests;
}

function assignArrivalTicks(requests: Request[], cfg: WorkloadConfig, rng: PRNG): void {
  switch (cfg.arrivalPattern) {
    case 'poisson': {
      let tick = 0;
      for (const r of requests) {
        tick += rng.exponential(cfg.arrivalLambda);
        r.arrivalTick = Math.floor(tick);
      }
      break;
    }

    case 'fixed': {
      const gap = Math.round(1 / cfg.arrivalLambda);
      requests.forEach((r, i) => {
        r.arrivalTick = i * gap;
      });
      break;
    }

    case 'burst': {
      // Requests arrive in bursts of 5–10 with a longer gap between bursts
      const burstSize = 5;
      let tick = 0;
      for (let i = 0; i < requests.length; i++) {
        if (i % burstSize === 0 && i > 0) tick += Math.round(burstSize / cfg.arrivalLambda);
        requests[i].arrivalTick = tick + (i % burstSize);
      }
      break;
    }
  }
}
