'use client';

import { startTransition, useOptimistic, useTransition } from 'react';
import { incrementCount } from './actions';

export function Counter({ count }: { count: number }) {
  const [optimisticCount, setOptimisticCount] = useOptimistic(count);
  const [isPending, startAction] = useTransition();

  return (
    <div className="panel counter-grid">
      <p className="eyebrow">Server Action</p>
      <p data-count={optimisticCount}>Server count: {optimisticCount}</p>
      <button
        className="counter-button"
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(() => setOptimisticCount(optimisticCount + 1));
          startAction(async () => {
            await incrementCount();
          });
        }}
      >
        {isPending ? 'Updating...' : 'Increment server count'}
      </button>
    </div>
  );
}
