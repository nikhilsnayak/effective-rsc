'use client';

import { useState } from 'react';

export default function RuntimeProbe() {
  const [count, setCount] = useState(0);

  return (
    <section aria-label='Runtime recovery probe'>
      <p>Runtime probe original</p>
      <button onClick={() => setCount((value) => value + 1)} type='button'>
        Probe count: {count}
      </button>
    </section>
  );
}
