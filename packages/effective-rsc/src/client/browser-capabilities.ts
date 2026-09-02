import { Effect, Schema } from 'effect';

export class NavigationApiUnavailableError extends Schema.TaggedError<NavigationApiUnavailableError>()(
  'NavigationApiUnavailableError',
  {},
) {}

export class NavigationPrecommitUnavailableError extends Schema.TaggedError<NavigationPrecommitUnavailableError>()(
  'NavigationPrecommitUnavailableError',
  {},
) {}

export const checkBrowserCapabilities = Effect.gen(function* () {
  if (window.navigation === undefined) {
    return yield* new NavigationApiUnavailableError();
  }
  if (window.NavigationPrecommitController === undefined) {
    return yield* new NavigationPrecommitUnavailableError();
  }
});
