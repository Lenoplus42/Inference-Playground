import { ModelConfig, HardwareConfig, WorkloadConfig, SimConfig } from './types';

// ── Model Presets ────────────────────────────────────────────────────────────
// KV bytes per token = 2 × layers × kv_heads × head_dim × bytes_per_param

export const MODEL_PRESETS: Record<string, ModelConfig> = {
  llama3_8b: {
    name: 'Llama 3 8B',
    numLayers: 32,
    numKVHeads: 8,    // GQA
    headDim: 128,
    bytesPerParam: 2, // FP16
    // Rough model weight size: ~8B params × 2 bytes = 16 GB
    modelWeightBytes: 16 * 1024 * 1024 * 1024,
  },
  llama3_70b: {
    name: 'Llama 3 70B',
    numLayers: 80,
    numKVHeads: 8,    // GQA
    headDim: 128,
    bytesPerParam: 2, // FP16
    // ~70B params × 2 bytes = 140 GB (requires multi-GPU in reality; here for demo)
    // We use a reduced weight size so the simulation budget is interesting
    modelWeightBytes: 40 * 1024 * 1024 * 1024,
  },
};

// ── Hardware Presets ─────────────────────────────────────────────────────────

const GB = 1024 * 1024 * 1024;

export const HARDWARE_PRESETS: Record<string, HardwareConfig> = {
  h100: {
    name: 'H100 SXM (80 GB)',
    vramBytes: 80 * GB,
    hbmBandwidthBytesPerSec: 3.35e12,
    pcieBandwidthBytesPerSec: 128 * GB,  // PCIe Gen5
  },
  a100: {
    name: 'A100 (80 GB)',
    vramBytes: 80 * GB,
    hbmBandwidthBytesPerSec: 2.0e12,
    pcieBandwidthBytesPerSec: 64 * GB,   // PCIe Gen4
  },
  constrained: {
    name: 'Constrained (25.6 GB)',
    vramBytes: 25.6 * GB,
    hbmBandwidthBytesPerSec: 3.35e12,
    pcieBandwidthBytesPerSec: 128 * GB,
  },
};

// ── Scenario Presets ─────────────────────────────────────────────────────────

export interface ScenarioPreset {
  id: string;
  label: string;
  description: string;
  modelId: keyof typeof MODEL_PRESETS;
  hardwareId: keyof typeof HARDWARE_PRESETS;
  workload: WorkloadConfig;
  schedulerId: string;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'chatbot',
    label: 'Chatbot Service',
    description: 'Short inputs, high arrival rate. Continuous batching keeps GPU busy. KV cache stays manageable. The happy path.',
    modelId: 'llama3_8b',
    hardwareId: 'h100',
    workload: {
      numRequests: 50,
      interactiveRatio: 0.9,
      arrivalLambda: 0.04,
      arrivalPattern: 'poisson',
      interactivePrefillRange: [100, 500],
      interactiveDecodeRange: [50, 200],
      batchPrefillRange: [1000, 3000],
      batchDecodeRange: [200, 500],
    },
    schedulerId: 'fcfs',
  },
  {
    id: 'mixed',
    label: 'Mixed Traffic',
    // KV budget: 25.6 GB − 16 GB weights = 9.6 GB = ~75K tokens @ 128 KB/tok
    // With 60 requests (60% interactive), batch requests avg ~12.5K tokens at midpoint.
    // Budget supports ~6 concurrent batch decoders; ~20-30% of requests see eviction.
    description: 'Blend of interactive chat and heavy batch. Head-of-Line Blocking under FCFS + KV cache pressure cause evictions on the constrained GPU.',
    modelId: 'llama3_8b',
    hardwareId: 'constrained',
    workload: {
      numRequests: 60,
      interactiveRatio: 0.6,
      arrivalLambda: 0.04,
      arrivalPattern: 'poisson',
      interactivePrefillRange: [100, 500],
      interactiveDecodeRange: [50, 300],
      batchPrefillRange: [5000, 20000],
      batchDecodeRange: [300, 1500],
    },
    schedulerId: 'fcfs',
  },
  {
    id: 'docprocessing',
    label: 'Doc Processing',
    description: 'Long-context requests (10K+ tokens). KV cache fills VRAM rapidly, forcing eviction cascades.',
    modelId: 'llama3_70b',
    hardwareId: 'h100',
    workload: {
      numRequests: 30,
      interactiveRatio: 0.1,
      arrivalLambda: 0.01,
      arrivalPattern: 'poisson',
      interactivePrefillRange: [200, 800],
      interactiveDecodeRange: [100, 300],
      batchPrefillRange: [8000, 30000],
      batchDecodeRange: [1000, 5000],
    },
    schedulerId: 'fcfs',
  },
];

// ── Default config builder ───────────────────────────────────────────────────

export function buildSimConfig(
  modelId: string,
  hardwareId: string,
  workload: WorkloadConfig,
  schedulerId: string,
): SimConfig {
  const model = MODEL_PRESETS[modelId] ?? MODEL_PRESETS.llama3_8b;
  const hardware = HARDWARE_PRESETS[hardwareId] ?? HARDWARE_PRESETS.h100;
  return {
    model,
    hardware,
    workload,
    schedulerId,
    tickDurationMs: 15,
  };
}

export function scenarioToSimConfig(preset: ScenarioPreset): SimConfig {
  return buildSimConfig(preset.modelId, preset.hardwareId, preset.workload, preset.schedulerId);
}
