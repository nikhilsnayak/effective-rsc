'use client';

import { useState } from 'react';
import './DynamicClientCard.css';

export function DynamicClientCard() {
  const [count, setCount] = useState(0);

  return (
    <section className="dynamic-client-card" data-testid="dynamic-client-card">
      <h2>Dynamic client stylesheet</h2>
      <p>This card is rendered from a dynamically imported client component.</p>
      <button
        className="dynamic-client-button"
        data-testid="dynamic-client-button"
        type="button"
        onClick={() => setCount((value) => value + 1)}
      >
        Dynamic clicks: {count}
      </button>
    </section>
  );
}
