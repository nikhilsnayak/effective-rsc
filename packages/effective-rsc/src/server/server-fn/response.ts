// oxlint-disable effecttsgo/process-env-in-effect -- Rspack replaces NODE_ENV at compile time.
import { Cause, Effect, FiberHandle, Option, Stream } from 'effect';

import { isServerFnStream } from '../../application/server-fn';
import type { ServerFnResponseModel } from '../../rsc/flight';
import { type ServerFnInputError, serverFnErrorDetail } from '../../rsc/server-fn-error';
import { nextErrorDigest } from '../error-digest';

export const serverFnResponse = Effect.fnUntraced(function* <Output, Requirements>(
  operation: Effect.Effect<Output, ServerFnInputError, Requirements>,
) {
  const exit = yield* Effect.exit(operation);
  if (exit._tag === 'Success') {
    if (isServerFnStream<Requirements>(exit.value)) {
      const producer = yield* FiberHandle.make();
      const readable = yield* Stream.toReadableStreamEffect(
        // Register the native adapter's fiber before application work starts. The request
        // interrupts and joins it even while React holds the Web Stream's reader lock.
        Stream.onStart(
          exit.value,
          Effect.withFiber((fiber) => FiberHandle.set(producer, fiber)),
        ),
      );

      return { _tag: 'Success', value: readable } satisfies ServerFnResponseModel;
    }

    return { _tag: 'Success', value: exit.value } satisfies ServerFnResponseModel;
  }

  if (Cause.hasInterrupts(exit.cause)) {
    return yield* Effect.interrupt;
  }

  const inputError = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
  if (inputError !== undefined) {
    yield* Effect.logWarning('Server Function rejected its arguments.', inputError.detail.message);

    return {
      _tag: 'Failure',
      error: {
        _tag: 'ServerFnInputError',
        detail: { message: inputError.detail.message, name: inputError.detail.name },
      },
    } satisfies ServerFnResponseModel;
  }

  const digest = yield* nextErrorDigest;
  yield* Effect.logError('Server Function failed.', exit.cause).pipe(
    Effect.annotateLogs('errorDigest', digest),
  );

  return {
    _tag: 'Failure',
    error: {
      _tag: 'ServerFnDefect',
      detail:
        process.env['NODE_ENV'] === 'development'
          ? serverFnErrorDetail(Cause.squash(exit.cause))
          : null,
      digest,
    },
  } satisfies ServerFnResponseModel;
});
