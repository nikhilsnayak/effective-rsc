import { expect, it } from '@effect/vitest';
import { Deferred, Effect, Stream } from 'effect';
import { HttpEffect, HttpRouter, HttpServerResponse } from 'effect/unstable/http';

import { Application } from '../../src/application/ersc';
import { getScopedMiddlewareHandler } from '../../src/application/middleware';

const makeHandler = Effect.fnUntraced(function* (
  events: Array<string>,
  stream: Stream.Stream<Uint8Array>,
) {
  const ERSC = Application.ersc();
  const Middleware = ERSC.Middleware.make((httpEffect) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        events.push('acquired');
      }),
      () =>
        Effect.sync(() => {
          events.push('released');
        }),
    ).pipe(Effect.andThen(httpEffect)),
  );
  const httpEffect = yield* HttpRouter.toHttpEffect(
    HttpRouter.add(
      'GET',
      '/',
      getScopedMiddlewareHandler(Middleware)(Effect.succeed(HttpServerResponse.stream(stream))),
    ),
  );

  return HttpEffect.toWebHandler(httpEffect);
});

it.effect('retains middleware resources through streaming response EOF', () =>
  Effect.gen(function* () {
    const events: Array<string> = [];
    const finish = yield* Deferred.make<void>();
    const stream = Stream.concat(
      Stream.make('response').pipe(Stream.encodeText),
      Stream.fromEffect(Deferred.await(finish)).pipe(Stream.map(() => new Uint8Array())),
    );
    const handler = yield* makeHandler(events, stream);
    const response = yield* Effect.promise(() => handler(new Request('http://localhost/')));

    expect(events).toEqual(['acquired']);
    const body = response.text();
    yield* Deferred.succeed(finish, void 0);
    const responseBody = yield* Effect.promise(() => body);
    expect(responseBody).toBe('response');
    expect(events).toEqual(['acquired', 'released']);
  }),
);

it.effect('releases middleware resources when the response stream is canceled', () =>
  Effect.gen(function* () {
    const events: Array<string> = [];
    const stream = Stream.concat(Stream.make('response').pipe(Stream.encodeText), Stream.never);
    const handler = yield* makeHandler(events, stream);
    const response = yield* Effect.promise(() => handler(new Request('http://localhost/')));
    const reader = response.body?.getReader();
    if (reader === undefined) {
      return yield* Effect.die('Expected a streaming response body.');
    }

    yield* Effect.promise(() => reader.read());
    expect(events).toEqual(['acquired']);
    yield* Effect.promise(() => reader.cancel());
    expect(events).toEqual(['acquired', 'released']);
  }),
);
