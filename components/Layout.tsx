'use client';

import React from 'react';

interface Props {
  sidebar: React.ReactNode;
  center: React.ReactNode;
  rightPanel: React.ReactNode;
  header: React.ReactNode;
}

export default function Layout({ sidebar, center, rightPanel, header }: Props) {
  return (
    <div className="flex flex-col h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-[var(--border)] px-4 py-3 flex items-center gap-4">
        {header}
      </header>

      {/* Main three-panel body */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Sidebar */}
        {sidebar}

        {/* Center */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {center}
        </main>

        {/* Right panel */}
        <aside className="w-[200px] flex-shrink-0 border-l border-[var(--border)] px-4 py-4 overflow-y-auto flex flex-col gap-6">
          {rightPanel}
        </aside>
      </div>
    </div>
  );
}
