import { Context, Effect, Layer, Schema } from 'effect';

export class NavigationApiUnavailableError extends Schema.TaggedError<NavigationApiUnavailableError>()(
  'NavigationApiUnavailableError',
  {},
) {}

export class NavigationPrecommitUnavailableError extends Schema.TaggedError<NavigationPrecommitUnavailableError>()(
  'NavigationPrecommitUnavailableError',
  {},
) {}

export class BrowserNavigation extends Context.Service<BrowserNavigation>()(
  'ersc/client/browser-navigation/BrowserNavigation',
  {
    make: Effect.gen(function* () {
      const navigation = window.navigation;
      if (navigation === undefined) {
        return yield* new NavigationApiUnavailableError();
      }
      if (window.NavigationPrecommitController === undefined) {
        return yield* new NavigationPrecommitUnavailableError();
      }
      return { location: window.location, navigation };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
