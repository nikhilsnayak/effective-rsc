'use client';

import { useAtom, useAtomInitialValues } from '@effect/atom-react';
import { Cause } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';
import { useEffect, useEffectEvent, useRef } from 'react';

import { feedAtom } from './feed-atoms';
import type { FeedPage } from './model';

export function Feed({ seed }: { readonly seed: FeedPage }) {
  useAtomInitialValues([[feedAtom, AsyncResult.success(seed)]]);
  const [result, loadMore] = useAtom(feedAtom);
  const { items, total } = AsyncResult.getOrThrow(result);
  const sentinel = useRef<HTMLDivElement>(null);
  const ended = items.length >= total;
  const failed = AsyncResult.isFailure(result) && !Cause.hasInterruptsOnly(result.cause);
  const onIntersect = useEffectEvent(() => {
    if (!ended && !failed && !result.waiting) {
      loadMore();
    }
  });

  // The atom stays alive to retain cards; cancel its active request when the feed unmounts.
  useEffect(() => () => loadMore(Atom.Interrupt), [loadMore]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || ended || failed || result.waiting) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          observer.disconnect();
          onIntersect();
        }
      },
      { rootMargin: '160px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [ended, failed, result.waiting, items.length]);

  return (
    <>
      <div className='feed-label'>
        <span>the feed</span>
        <span aria-live='polite'>
          {items.length.toLocaleString('en-US')} / {total.toLocaleString('en-US')} notes
        </span>
      </div>
      <ol className='feed-list'>
        {items.map((item) => (
          <li key={item.id}>{item.content}</li>
        ))}
      </ol>
      <div className='feed-bottom' ref={sentinel}>
        {failed ? (
          <div role='alert'>
            <p>The next notes couldn’t be loaded.</p>
            <button
              className='retry'
              type='button'
              onClick={() => loadMore()}
              disabled={result.waiting}
            >
              {result.waiting ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        ) : ended ? (
          <>
            <h2>End of the feed.</h2>
            <a href='#top'>Back to the top ↑</a>
          </>
        ) : (
          <output data-loading={result.waiting}>
            <span className='status-mark' aria-hidden='true' />
            {result.waiting ? 'Loading more notes…' : 'Scroll for more'}
          </output>
        )}
      </div>
    </>
  );
}
