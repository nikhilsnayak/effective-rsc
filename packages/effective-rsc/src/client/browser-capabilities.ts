import { Effect } from 'effect';

export const navigationMode = Effect.sync(() =>
  window.navigation !== undefined && window.NavigationPrecommitController !== undefined
    ? ('Client' as const)
    : ('Document' as const),
);
