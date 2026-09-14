import { Option, Stream } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';
import { ServerFn } from 'effective-rsc/client';

import type { FeedPage } from './model';
import { streamFeed } from './server-functions';

const readPage = ServerFn.stream(streamFeed);

export const feedAtom = Atom.fn((_: void, atomCtx: Atom.FnContext) => {
  const current = atomCtx.self<AsyncResult.AsyncResult<FeedPage, unknown>>().pipe(
    Option.flatMap(AsyncResult.value),
    Option.getOrElse((): FeedPage => ({ items: [], total: 0 })),
  );
  if (current.items.length >= current.total) {
    return Stream.succeed(current);
  }
  return readPage({ after: current.items.at(-1)?.id ?? 0 }).pipe(
    Stream.scan(current, (page, item) => ({ ...page, items: [...page.items, item] })),
  );
}).pipe(Atom.keepAlive);
