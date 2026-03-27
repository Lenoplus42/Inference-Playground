'use client';

export default function HeroSection() {
  return (
    <section
      style={{
        textAlign: 'center',
        padding: '96px 24px 80px',
        background: 'var(--bg-primary)',
      }}
    >
      <h1
        style={{
          fontSize: 48,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--accent)',
          margin: '0 0 20px',
          lineHeight: 1.1,
        }}
      >
        Inference Playground
      </h1>
      <p
        style={{
          fontSize: 18,
          color: 'var(--text-secondary)',
          maxWidth: 560,
          margin: '0 auto',
          lineHeight: 1.65,
        }}
      >
        An interactive guide to how LLMs serve your requests on a GPU.
      </p>
    </section>
  );
}
