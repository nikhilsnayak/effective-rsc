'use client';

import { useState } from 'react';
import './StaticClientCard.css';

export function StaticClientCard() {
  const [count, setCount] = useState(0);

  return (
    <section className="static-client-card" data-testid="static-client-card">
      <h2>Static client stylesheet</h2>
      <p>This card is rendered from a statically imported client component.</p>
      <button
        className="static-client-button"
        data-testid="static-client-button"
        type="button"
        onClick={() => setCount((value) => value + 1)}
      >
        Static clicks: {count}
      </button>
    </section>
  );
}
