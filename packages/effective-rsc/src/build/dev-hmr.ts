import { Effect, Stream, SubscriptionRef } from 'effect';

import type { DevHmrMessage } from '../dev/hmr';

type DevHmrState = { readonly _tag: 'Initial' } | DevHmrMessage;

export const makeDevHmr = Effect.fnUntraced(function* () {
  const state = yield* SubscriptionRef.make<DevHmrState>({ _tag: 'Initial' });
  const updates = SubscriptionRef.changes(state).pipe(
    Stream.filter((update): update is DevHmrMessage => update._tag !== 'Initial'),
  );
  const publish = (message: DevHmrMessage) => SubscriptionRef.set(state, message);

  return { publish, updates };
});
