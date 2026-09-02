import { Context, Effect, Layer } from 'effect';

type NavigateListener = (event: NavigateEvent) => void;

export class NavigationApi extends Context.Service<NavigationApi>()('ersc/client/NavigationApi', {
  make: Effect.succeed({
    getCurrentEntry: () => window.navigation.currentEntry,
    getCurrentUrl: () => window.location.href,
    getTransition: () => window.navigation.transition,
    navigate: (url: string | URL, options?: NavigationNavigateOptions) =>
      window.navigation.navigate(url, options),
    reloadDocument: () => window.location.reload(),
    replaceDocument: (url: string) => window.location.replace(url),
    subscribe: (listener: NavigateListener) => {
      window.navigation.addEventListener('navigate', listener);
      return () => window.navigation.removeEventListener('navigate', listener);
    },
    traverseTo: (key: string, options?: NavigationOptions) =>
      window.navigation.traverseTo(key, options),
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly layerTest = Layer.mock(this);
}
