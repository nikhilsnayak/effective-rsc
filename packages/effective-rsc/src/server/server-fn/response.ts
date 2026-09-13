// oxlint-disable effecttsgo/process-env-in-effect -- Rspack replaces NODE_ENV at compile time.
import { Cause, Clock, Effect, Option } from 'effect';

import type { ServerFnResponseModel } from '../../rsc/flight';
import { type ServerFnInputError, serverFnErrorDetail } from '../../rsc/server-fn-error';

let digestSequence = 0;

const nextDigest = Effect.map(Clock.currentTimeMillis, (now) => {
  digestSequence += 1;
  return `${now.toString(36)}-${digestSequence.toString(36)}`;
});

export const serverFnResponse = Effect.fnUntraced(function* <Output, Requirements>(
  operation: Effect.Effect<Output, ServerFnInputError, Requirements>,
) {
  const exit = yield* Effect.exit(operation);
  if (exit._tag === 'Success') {
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

  const digest = yield* nextDigest;
  yield* Effect.logError('Server Function failed.', exit.cause).pipe(
    Effect.annotateLogs('serverFnDigest', digest),
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
