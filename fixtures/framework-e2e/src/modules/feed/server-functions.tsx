'use server';

import { Effect, Schema, Stream } from 'effect';

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

const TickStreamInput = Schema.Struct({
  count: Schema.Finite,
  failAt: Schema.NullOr(Schema.Finite),
  intervalMillis: Schema.Finite,
});

const StreamERSC = ERSC.withMiddleware(
  ERSC.Middleware.make((httpEffect) =>
    Effect.flatMap(FeedService, (service) =>
      Effect.addFinalizer(() => service.recordStreamEvent('request released')).pipe(
        Effect.andThen(httpEffect),
      ),
    ),
  ),
);

export const streamTicks = StreamERSC.ServerFn.make({
  input: TickStreamInput,
  handler: ({ count, failAt, intervalMillis }) =>
    Effect.succeed(
      Stream.range(1, count).pipe(
        Stream.mapEffect(
          Effect.fnUntraced(function* (index) {
            yield* Effect.sleep(intervalMillis);
            if (failAt !== null && index === failAt) {
              return yield* Effect.die(new Error('fixture stream failed at tick ' + index));
            }

            return { index, label: `tick-${index}` };
          }),
        ),
        Stream.ensuring(
          Effect.gen(function* () {
            const service = yield* FeedService;
            yield* Effect.sleep('50 millis');
            yield* service.recordStreamEvent('producer finalized');
          }),
        ),
      ),
    ),
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
