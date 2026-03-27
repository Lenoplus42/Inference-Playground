'use client';

import React from 'react';
import { PlaybackStatus } from '@/hooks/useSimulation';
// PlaybackControls is ONLY for controlling playback of already-computed results.
// It never triggers a re-computation. The "Update Simulation" button in the Sidebar does that.
import { fmtNumber } from '@/lib/utils';

interface Props {
  status: PlaybackStatus;
  currentTick: number;
  totalTicks: number;
  snapshotCount: number;
  currentSnapshotIndex: number;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (index: number) => void;
  onSpeedChange: (s: number) => void;
}

const SPEEDS = [1, 2, 4, 8];

export default function PlaybackControls({
  status,
  currentTick,
  totalTicks,
  snapshotCount,
  currentSnapshotIndex,
  speed,
  onPlay,
  onPause,
  onSeek,
  onSpeedChange,
}: Props) {
  const isPlaying = status === 'running';
  const hasData = snapshotCount > 0 && status !== 'computing' && status !== 'idle';

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-t border-[var(--border)] bg-[var(--surface)]">
      {/* Play / Pause */}
      <button
        onClick={isPlaying ? onPause : onPlay}
        disabled={!hasData}
        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          // Pause icon
          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
            <rect x="0" y="0" width="3" height="12" rx="0.5" />
            <rect x="7" y="0" width="3" height="12" rx="0.5" />
          </svg>
        ) : (
          // Play icon
          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
            <polygon points="0,0 10,6 0,12" />
          </svg>
        )}
      </button>

      {/* Progress scrubber */}
      <div className="flex-1 flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={Math.max(0, snapshotCount - 1)}
          value={currentSnapshotIndex}
          onChange={e => onSeek(parseInt(e.target.value))}
          disabled={!hasData}
          className="flex-1 h-1 appearance-none bg-[var(--border)] rounded cursor-pointer accent-[var(--accent)] disabled:opacity-30 disabled:cursor-not-allowed"
        />
      </div>

      {/* Tick counter */}
      <div className="flex-shrink-0 text-[10px] font-mono text-[var(--text-muted)] min-w-[110px] text-right">
        {hasData ? (
          <>
            <span className="text-[var(--text-primary)]">Tick {fmtNumber(currentTick)}</span>
            <span> / {fmtNumber(totalTicks)}</span>
          </>
        ) : (
          <span>No data</span>
        )}
      </div>

      {/* Speed toggle */}
      <div className="flex-shrink-0 flex items-center gap-0.5">
        {SPEEDS.map(s => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            disabled={!hasData}
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              speed === s
                ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      {/* Status badge */}
      <div className={`flex-shrink-0 text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border ${
        status === 'running' ? 'border-emerald-500/50 text-emerald-400'
        : status === 'complete' ? 'border-[var(--accent)]/50 text-[var(--accent)]'
        : status === 'paused' ? 'border-[var(--border)] text-[var(--text-muted)]'
        : 'border-[var(--border)] text-[var(--text-muted)]'
      }`}>
        {status}
      </div>
    </div>
  );
}
