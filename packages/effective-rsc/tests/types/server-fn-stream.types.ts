import { Context, Effect, Schema, Stream } from 'effect';
import { expectTypeOf } from 'vitest';

import { Application } from '../../src/application/ersc';
import * as ClientServerFn from '../../src/client/server-fn/query';
import type { ServerFnError } from '../../src/rsc/server-fn-error';

const ERSC = Application.ersc();

const omittedInput = ERSC.ServerFn.make({ handler: () => Effect.succeed(Stream.make(1)) });
expectTypeOf<Parameters<typeof omittedInput>>().toEqualTypeOf<[]>();
expectTypeOf<ReturnType<typeof omittedInput>>().toEqualTypeOf<Promise<ReadableStream<1>>>();
void ClientServerFn.stream(omittedInput)();
// @ts-expect-error Omitting input does not allow typed Stream failures.
ERSC.ServerFn.make({ handler: () => Effect.succeed(Stream.fail('failure')) });

const read = ERSC.ServerFn.make({
  input: Schema.Boolean,
  handler: (text) => Effect.succeed(text ? Stream.make('one') : Stream.make(1)),
});
expectTypeOf<ReturnType<typeof read>>().toEqualTypeOf<Promise<ReadableStream<'one' | 1>>>();
const readStream = ClientServerFn.stream(read);
expectTypeOf<ReturnType<typeof readStream>>().toEqualTypeOf<
  Stream.Stream<'one' | 1, ServerFnError>
>();
void ClientServerFn.streamAtom(read);
// @ts-expect-error A streaming reference cannot be consumed as a value query.
void ClientServerFn.query(read);
// @ts-expect-error Atom value queries also reject streams.
void ClientServerFn.queryAtom(read);

const possiblyEmpty = ERSC.ServerFn.make({
  input: Schema.Boolean,
  handler: (enabled) => Effect.succeed(enabled ? Stream.make(1) : Stream.empty),
});
expectTypeOf<ReturnType<typeof possiblyEmpty>>().toEqualTypeOf<Promise<ReadableStream<1>>>();
void ClientServerFn.stream(possiblyEmpty);

const lookup = ERSC.ServerFn.make({
  input: Schema.Boolean,
  handler: (found) => Effect.succeed(found ? 'one' : null),
});
expectTypeOf<ReturnType<typeof lookup>>().toEqualTypeOf<Promise<string | null>>();
void ClientServerFn.query(lookup);
void ClientServerFn.queryAtom(lookup);
// @ts-expect-error Ordinary values cannot be consumed as a stream.
void ClientServerFn.stream(lookup);
// @ts-expect-error Atom streams also reject ordinary values.
void ClientServerFn.streamAtom(lookup);

const noResult = ERSC.ServerFn.make({ input: [], handler: () => Effect.die('unavailable') });
expectTypeOf<ReturnType<typeof noResult>>().toEqualTypeOf<Promise<never>>();
void ClientServerFn.query(noResult);

// @ts-expect-error A handler must consistently return a Stream or a non-stream value.
ERSC.ServerFn.make({
  input: Schema.Boolean,
  handler: (enabled) => Effect.succeed(enabled ? Stream.make(1) : null),
});
// @ts-expect-error Undefined cannot be an alternative to a returned Stream.
ERSC.ServerFn.make({
  input: Schema.Boolean,
  handler: (enabled) => Effect.succeed(enabled ? Stream.make(1) : undefined),
});
// @ts-expect-error A data outcome cannot be an alternative to a returned Stream.
ERSC.ServerFn.make({
  input: Schema.Boolean,
  handler: (enabled) => Effect.succeed(enabled ? Stream.make(1) : { enabled: false }),
});
// @ts-expect-error A nullable Stream cannot hide its typed failure channel.
ERSC.ServerFn.make({
  input: Schema.Boolean,
  handler: (enabled) => Effect.succeed(enabled ? Stream.fail('failure') : null),
});
// @ts-expect-error Every Stream alternative must have a never error channel.
ERSC.ServerFn.make({
  input: Schema.Boolean,
  handler: (enabled) => Effect.succeed(enabled ? Stream.make(1) : Stream.fail('failure')),
});

class StreamService extends Context.Service<StreamService, { readonly value: number }>()(
  'ersc/tests/types/server-fn-stream/StreamService',
) {}
const serviceStream = Stream.fromEffect(Effect.map(StreamService, ({ value }) => value));
// @ts-expect-error Omitting input does not allow unavailable Stream services.
ERSC.ServerFn.make({ handler: () => Effect.succeed(serviceStream) });
// @ts-expect-error A returned Stream must fit the application's service universe.
ERSC.ServerFn.make({ input: [], handler: () => Effect.succeed(serviceStream) });
// @ts-expect-error A nullable Stream cannot hide an unavailable service requirement.
ERSC.ServerFn.make({
  input: Schema.Boolean,
  handler: (enabled) => Effect.succeed(enabled ? serviceStream : null),
});
// @ts-expect-error Every Stream alternative must fit the application's service universe.
ERSC.ServerFn.make({
  input: Schema.Boolean,
  handler: (enabled) => Effect.succeed(enabled ? Stream.make(1) : serviceStream),
});
const ServiceERSC = Application.ersc<StreamService>();
const serviceRead = ServiceERSC.ServerFn.make({
  input: [],
  handler: () => Effect.succeed(serviceStream),
});
expectTypeOf<ReturnType<typeof serviceRead>>().toEqualTypeOf<Promise<ReadableStream<number>>>();
const ProvideStreamService = ERSC.Middleware.make<{ provides: StreamService }>((operation) =>
  operation.pipe(Effect.provideService(StreamService, { value: 1 })),
);
void ERSC.withMiddleware(ProvideStreamService).ServerFn.make({
  input: [],
  handler: () => Effect.succeed(serviceStream),
});

declare const nullableReadable: () => Promise<ReadableStream<number> | null>;
declare const optionalReadable: () => Promise<ReadableStream<number> | undefined>;
declare const mixedReadable: () => Promise<ReadableStream<number> | { readonly enabled: false }>;
// @ts-expect-error A nullable Web Stream cannot be consumed as a value query.
void ClientServerFn.query(nullableReadable);
// @ts-expect-error An optional Web Stream cannot be consumed as a value query.
void ClientServerFn.query(optionalReadable);
// @ts-expect-error A mixed Web Stream/data result cannot be consumed as a value query.
void ClientServerFn.query(mixedReadable);
// @ts-expect-error Atom value queries also reject mixed results.
void ClientServerFn.queryAtom(nullableReadable);
// @ts-expect-error Stream consumption requires every alternative to be a Web Stream.
void ClientServerFn.stream(nullableReadable);
// @ts-expect-error Atom streams also require every alternative to be a Web Stream.
void ClientServerFn.streamAtom(nullableReadable);
