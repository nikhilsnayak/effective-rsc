'use client';

import { useId, useState } from 'react';

export default function RuntimeProbe() {
  const descriptionId = useId();
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<'Ready' | 'Failed'>('Ready');

  if (phase === 'Failed') {
    throw new Error('Fixture React render failure');
  }

  return (
    <section aria-label='Runtime recovery probe'>
      <p id={descriptionId}>Runtime probe original</p>
      <button
        aria-describedby={descriptionId}
        onClick={() => setCount((value) => value + 1)}
        type='button'
      >
        Probe count: {count}
      </button>
      <button onClick={() => setPhase('Failed')} type='button'>
        Fail React render
      </button>
    </section>
  );
}
