'use client';

export default function TransitionSection() {
  const scrollToPlayground = () => {
    document.getElementById('playground')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      style={{
        background: 'var(--bg-secondary)',
        padding: '80px 24px 96px',
        textAlign: 'center',
        position: 'relative',
      }}
    >
      {/* Top gradient border */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(253,181,21,0.3), transparent)',
        }}
      />

      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: '0 0 16px',
            lineHeight: 1.2,
          }}
        >
          Now you understand the physics.{' '}
          <span style={{ color: 'var(--accent)' }}>Time to experiment.</span>
        </h2>
        <p
          style={{
            fontSize: 16,
            color: 'var(--text-secondary)',
            lineHeight: 1.65,
            margin: '0 0 36px',
          }}
        >
          Adjust the parameters below. Watch how arrival rate, memory pressure, and scheduling policy interact in ways that are hard to reason about without seeing them.
        </p>

        <button
          onClick={scrollToPlayground}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 24px',
            fontSize: 14,
            color: 'var(--accent)',
            background: 'transparent',
            border: '1px solid var(--accent)',
            borderRadius: 8,
            cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          Open the Playground
          <DownArrow />
        </button>
      </div>

      {/* Bottom gradient leading into playground */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 48,
          background: 'linear-gradient(to bottom, transparent, var(--bg-primary))',
          pointerEvents: 'none',
        }}
      />
    </section>
  );
}

function DownArrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 2v10M2 7l5 5 5-5" />
    </svg>
  );
}
