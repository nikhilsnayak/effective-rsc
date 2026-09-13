'use client';

import { useAtom, useAtomInitialValues } from '@effect/atom-react';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';
import { ServerFn } from 'effective-rsc/client';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { FeedPage } from '@/modules/feed/model';
import { describeActor, searchFeed } from '@/modules/feed/server-functions';

const feedQuery = ServerFn.queryAtom(searchFeed);
const actorQuery = ServerFn.queryAtom(describeActor);

const SearchLatencyMillis = 400;
const PageLatencyMillis = 80;
const EmptyPage: FeedPage = { entries: [], nextCursor: null, total: 0 };

type FeedPanelProps = {
  readonly seed: FeedPage;
};

const statusOf = (result: AsyncResult.AsyncResult<FeedPage, unknown>) => {
  if (result.waiting) {
    return 'waiting';
  }
  if (AsyncResult.isInterrupted(result)) {
    return 'interrupted';
  }
  if (AsyncResult.isFailure(result)) {
    return 'failed';
  }
  return AsyncResult.isInitial(result) ? 'empty' : 'ready';
};

function FeedView() {
  const [actor, describe] = useAtom(actorQuery);
  const [result, run] = useAtom(feedQuery);
  const [term, setTerm] = useState('');
  const visible = AsyncResult.getOrElse(result, () => EmptyPage);

  return (
    <section aria-labelledby='feed-heading' className='mt-10 border-t pt-8'>
      <h2 className='text-2xl font-semibold tracking-[-0.02em]' id='feed-heading'>
        Feed
      </h2>
      <div className='mt-4 flex flex-wrap items-center gap-3'>
        <input
          aria-label='Search the feed'
          className='border-input h-9 rounded-md border px-3 text-sm'
          data-testid='feed-term'
          onChange={(event) => {
            setTerm(event.target.value);
            run([{ cursor: null, latencyMillis: SearchLatencyMillis, term: event.target.value }]);
          }}
          placeholder='Filter entries'
          value={term}
        />
        <Button
          data-testid='feed-cancel'
          onClick={() => run(Atom.Interrupt)}
          size='sm'
          type='button'
          variant='outline'
        >
          Cancel
        </Button>
        <Button
          data-testid='feed-next'
          disabled={visible.nextCursor === null}
          onClick={() => {
            run([{ cursor: visible.nextCursor, latencyMillis: PageLatencyMillis, term }]);
          }}
          size='sm'
          type='button'
        >
          Next page
        </Button>
        <span className='text-muted-foreground text-xs' data-testid='feed-status'>
          {statusOf(result)}
        </span>
        <span className='text-muted-foreground text-xs' data-testid='feed-total'>
          {visible.total}
        </span>
        <Button
          data-testid='feed-describe'
          onClick={() => describe([undefined])}
          size='sm'
          type='button'
          variant='outline'
        >
          Describe actor
        </Button>
        <span className='text-muted-foreground text-xs'>
          {AsyncResult.getOrElse(actor, () => null)}
        </span>
      </div>
      <ul className='mt-5 grid gap-2' data-testid='feed-entries'>
        {visible.entries.map((entry) => (
          <li className='text-sm' key={entry.id} data-testid='feed-entry'>
            {entry.title}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FeedPanel({ seed }: FeedPanelProps) {
  useAtomInitialValues([[feedQuery, AsyncResult.success(seed)]]);

  return <FeedView />;
}
