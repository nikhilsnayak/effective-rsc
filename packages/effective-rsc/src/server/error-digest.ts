import { Clock, Effect } from 'effect';

let digestSequence = 0;

export const nextErrorDigest = Effect.map(Clock.currentTimeMillis, (now) => {
  digestSequence += 1;
  return `${now.toString(36)}-${digestSequence.toString(36)}`;
});
