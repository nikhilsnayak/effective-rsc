import { Effect } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';

import { FeedService } from '@/modules/feed/service';

export const FeedHttpLayer = HttpRouter.use(
  Effect.fnUntraced(function* (router) {
    const service = yield* FeedService;
    yield* router.add(
      'GET',
      '/test/feed',
      service.counters.pipe(Effect.map((counters) => HttpServerResponse.jsonUnsafe(counters))),
    );
  }),
);
