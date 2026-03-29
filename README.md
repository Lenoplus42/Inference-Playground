# Inference Playground

An interactive browser-based LLM inference serving simulator. Visualizes how requests compete for GPU resources — VRAM, compute, and bandwidth — in real time.

**[Live Demo →](https://inference-playground-42.vercel.app/)**

https://github.com/user-attachments/assets/5ad2f31b-7a9b-4146-8304-9c37bac55a5d

---

## What is this?

LLM inference serving is a resource-constrained optimization problem. A single GPU has fixed VRAM, fixed memory bandwidth, and fixed compute — but the requests sharing it are wildly heterogeneous. A one-line chat message and a 100K-token document summarization have completely different resource profiles, yet they compete for the same hardware.

This tool lets you **see that competition play out**. It combines a discrete-event simulation engine with interactive visualization, so you can adjust parameters and immediately observe how arrival rate, memory pressure, and scheduling policy interact.

The page is structured as a guided walkthrough:

1. **What happens when you send a prompt** — interactive demo of prefill → decode with synchronized token generation
2. **The memory problem: KV Cache** — drag sliders to watch VRAM fill up as concurrent users increase
3. **When requests compete** — watch Head-of-Line Blocking happen in a mini Gantt chart
4. **Full playground** — configure model, hardware, workload, and scheduling to explore freely

---

## How the simulator works

The simulation engine runs entirely in the browser as a TypeScript discrete-event simulator. No backend, no real model — pure math.

### Core model: Serial Prefill + Parallel Decode

Each tick (~15ms simulated time):

- **One request prefills** at a time (512 tokens/chunk). Prefill is compute-bound — it saturates GPU arithmetic units, so only one request can prefill per tick.
- **All decoding requests advance in parallel** (1 token/tick each, continuous batching). Decode is memory-bandwidth-bound — each step is a small matrix-vector op, so many requests can decode simultaneously.
- **KV cache grows** with every token (prefill and decode). When total KV cache exceeds VRAM budget, the system **evicts** the largest request's cache to CPU memory via PCIe, incurring a transfer penalty.

### Physical constants

| Parameter | Value | Derivation |
|---|---|---|
| KV cache per token (Llama 3 8B) | 128 KB | `2 × 32 layers × 8 KV heads × 128 dim × 2 bytes (FP16)` |
| Prefill chunk size | 512 tokens/tick | One chunked prefill block per simulated tick |
| Decode rate | 1 token/tick per request | Autoregressive, but batched across requests |
| PCIe penalty | ~1–15 ticks | `(kv_tokens × 128KB) / PCIe_bandwidth / tick_duration` |
| Tick duration | ~15 ms | Minimal non-preemptible compute window |

### Scheduler interface

The engine interacts with scheduling logic through a pluggable `Scheduler` interface:

```typescript
interface Scheduler {
  addRequest(request: Request): void;
  selectNext(): Request | null;
  removeRequest(requestId: number): void;
  getEvictionCandidate(decoding: Request[]): Request | null;
  reset(): void;
}
```

Currently implements FCFS (First-Come, First-Served). The interface is designed so that additional policies (MLFQ, SJF, etc.) can be added as drop-in implementations without modifying the core simulation loop.

---

## Tech stack

- **Simulation engine**: TypeScript (discrete-event simulator, runs client-side)
- **UI**: Next.js + React
- **Timeline rendering**: HTML Canvas
- **Styling**: Tailwind CSS
- **Deployment**: Vercel (static, zero backend)

---

## Run locally

```bash
git clone https://github.com/YOUR_USERNAME/inference-playground.git
cd inference-playground
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Background

This project grew out of [AIOS-MLFQ](https://github.com/YOUR_USERNAME/aios-mlfq), a research project applying OS-level Multi-Level Feedback Queue scheduling to LLM inference serving. The playground reuses the physical model (KV cache math, PCIe penalties, prefill/decode timing) from that simulator, repackaged as an interactive teaching tool.

---

## License

MIT
