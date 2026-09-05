import { Context, Effect, Layer } from 'effect';

type NavigateListener = (event: NavigateEvent) => void;

export class NavigationApi extends Context.Service<NavigationApi>()('ersc/client/NavigationApi', {
  make: Effect.succeed({
    getCurrentEntry: () => window.navigation?.currentEntry ?? null,
    getCurrentUrl: () => window.location.href,
    getTransition: () => window.navigation?.transition ?? null,
    navigate: (url: string | URL, options?: NavigationNavigateOptions) =>
      window.navigation.navigate(url, options),
    reloadDocument: () => window.location.reload(),
    replaceDocument: (url: string) => window.location.replace(url),
    subscribe: (listener: NavigateListener) => {
      const navigation = window.navigation;
      navigation?.addEventListener('navigate', listener);
      return () => navigation?.removeEventListener('navigate', listener);
    },
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly layerTest = Layer.mock(this);
}
