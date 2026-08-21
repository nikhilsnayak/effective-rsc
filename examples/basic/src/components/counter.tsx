'use client';

import { useState } from 'react';

export function Counter({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  return (
    <button
      className='cursor-pointer rounded bg-black px-4 py-2 text-white hover:bg-neutral-800'
      onClick={() => setCount((value) => value + 1)}
    >
      Count: {count}
    </button>
  );
}
