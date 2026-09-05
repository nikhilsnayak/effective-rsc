'use client';

import { useState } from 'react';

export default function RuntimeProbe() {
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<'Ready' | 'Failed'>('Ready');

  if (phase === 'Failed') {
    throw new Error('Fixture React render failure');
  }

  return (
    <section aria-label='Runtime recovery probe'>
      <p>Runtime probe original</p>
      <button onClick={() => setCount((value) => value + 1)} type='button'>
        Probe count: {count}
      </button>
      <button onClick={() => setPhase('Failed')} type='button'>
        Fail React render
      </button>
    </section>
  );
}
