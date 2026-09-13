'use server';

import { Effect, Schema } from 'effect';

import { ERSC } from '@/ersc';
import { FeedService } from '@/modules/feed/service';
import { ActorERSC, CurrentActor } from '@/modules/fixture/actor';

const FeedSearchInput = Schema.Struct({
  cursor: Schema.NullOr(Schema.Finite),
  latencyMillis: Schema.Finite,
  term: Schema.String,
});

export const searchFeed = ERSC.ServerFn.make({
  input: FeedSearchInput,
  handler: Effect.fn('searchFeed')(function* (search) {
    const service = yield* FeedService;
    return yield* service.search(search);
  }),
});

const ActorBadge = ActorERSC.Component.make({
  render: Effect.fn('ActorBadge')(function* () {
    const actor = yield* CurrentActor;
    const service = yield* FeedService;
    const counters = yield* service.counters;

    return (
      <span data-testid='feed-actor'>
        {`${actor.name ?? 'anonymous'} ran ${counters.started} queries`}
      </span>
    );
  }),
});

export const describeActor = ActorERSC.ServerFn.make({
  input: Schema.Void,
  handler: () => Effect.succeed(<ActorBadge />),
});
