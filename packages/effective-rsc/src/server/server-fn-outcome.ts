import { Cause, Effect } from 'effect';

import type { ServerFnResult } from '../rsc/flight';

export const serverFnOutcome = Effect.fnUntraced(function* <Output, Error, Requirements>(
  operation: Effect.Effect<Output, Error, Requirements>,
) {
  const exit = yield* Effect.exit(operation);
  if (exit._tag === 'Failure' && Cause.hasInterrupts(exit.cause)) {
    return yield* Effect.interrupt;
  }

  return {
    serverFnResult:
      exit._tag === 'Success'
        ? ({ _tag: 'Success', value: exit.value } satisfies ServerFnResult)
        : ({ _tag: 'Failure', error: Cause.squash(exit.cause) } satisfies ServerFnResult),
    status: exit._tag === 'Success' ? 200 : 500,
  };
});
