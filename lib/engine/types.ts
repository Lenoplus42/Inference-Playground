// Core simulation types for Inference Playground

export type RequestState = 'queued' | 'prefill' | 'decode' | 'evicted' | 'complete';

export interface Request {
  id: number;
  type: 'interactive' | 'batch';
  arrivalTick: number;
  inputTokens: number;        // total tokens to prefill
  outputTokens: number;       // total tokens to decode
  prefillProgress: number;    // tokens prefilled so far
  decodeProgress: number;     // tokens decoded so far
  state: RequestState;
  schedulerMetadata: Record<string, unknown>; // opaque to core engine
  kvCacheTokens: number;      // current KV cache footprint in tokens
  penaltyRemaining: number;   // PCIe swap ticks remaining
  timestamps: {
    queued: number;
    prefillStart: number;
    firstToken: number;       // TTFT = firstToken - arrivalTick
    evictedAt: number;        // tick when first eviction began (0 if never evicted)
    resumedAt: number;        // tick when request resumed decode after first eviction (0 if not yet)
    lastToken: number;
    complete: number;
  };
}

export interface VRAMState {
  modelWeightsBytes: number;  // constant
  kvCacheUsedBytes: number;   // sum of active request KV bytes
  capacityBytes: number;      // total VRAM
}

export interface LiveMetrics {
  completedCount: number;
  evictionCount: number;
  tokensGenerated: number;
  ttftValues: number[];       // TTFT per completed request (for P99 calc)
  tbtValues: number[];        // TBT per completed request
}

export interface SimulationState {
  tick: number;
  requests: Request[];
  vram: VRAMState;
  metrics: LiveMetrics;
}

// Model configuration
export interface ModelConfig {
  name: string;
  numLayers: number;
  numKVHeads: number;
  headDim: number;
  bytesPerParam: number;      // 2 for FP16, 4 for FP32
  modelWeightBytes: number;   // pre-computed total model weight size
}

// Hardware configuration
export interface HardwareConfig {
  name: string;
  vramBytes: number;
  hbmBandwidthBytesPerSec: number;
  pcieBandwidthBytesPerSec: number;
}

// Workload configuration
export type ArrivalPattern = 'poisson' | 'fixed' | 'burst';

export interface WorkloadConfig {
  numRequests: number;
  interactiveRatio: number;        // 0–1
  arrivalLambda: number;           // Poisson λ: avg arrivals per tick
  arrivalPattern: ArrivalPattern;
  interactivePrefillRange: [number, number]; // [min, max] tokens
  interactiveDecodeRange: [number, number];
  batchPrefillRange: [number, number];
  batchDecodeRange: [number, number];
}

// Full simulation configuration
export interface SimConfig {
  model: ModelConfig;
  hardware: HardwareConfig;
  workload: WorkloadConfig;
  schedulerId: string;
  tickDurationMs: number;   // for deriving PCIe penalty
}

// Derived physical constants
export interface PhysicalConstants {
  prefillChunkSize: number;    // tokens per tick during prefill
  decodeTokensPerTick: number; // tokens per tick during decode
  kvBytesPerToken: number;     // KV cache bytes per token for this model
  maxKVCacheTokens: number;    // budget in tokens = (vram - modelWeights) / kvBytesPerToken
}

export function derivePhysicalConstants(cfg: SimConfig): PhysicalConstants {
  // KV cache per token: 2 * num_layers * num_kv_heads * head_dim * bytes_per_param
  const kvBytesPerToken =
    2 * cfg.model.numLayers * cfg.model.numKVHeads * cfg.model.headDim * cfg.model.bytesPerParam;

  const freeVRAM = cfg.hardware.vramBytes - cfg.model.modelWeightBytes;
  const maxKVCacheTokens = Math.max(0, Math.floor(freeVRAM / kvBytesPerToken));

  return {
    prefillChunkSize: 512,
    decodeTokensPerTick: 1,
    kvBytesPerToken,
    maxKVCacheTokens,
  };
}

// Compute PCIe penalty in ticks for evicting a request
export function computeEvictionPenalty(
  kvTokens: number,
  kvBytesPerToken: number,
  pcieBandwidthBytesPerSec: number,
  tickDurationMs: number
): number {
  const bytes = kvTokens * kvBytesPerToken;
  const seconds = bytes / pcieBandwidthBytesPerSec;
  const ticks = Math.ceil(seconds / (tickDurationMs / 1000));
  return Math.max(1, ticks);
}
