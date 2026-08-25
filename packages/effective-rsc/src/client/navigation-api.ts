import { Effect, FiberSet, Schema, Scope } from 'effect';
import { HttpClient } from 'effect/unstable/http';
import { startTransition } from 'react';

import type { BrowserRootController } from './browser-root';
import { loadFlight } from './flight-loader';

type NavigationInterceptHandler = () => Promise<void>;

export type NavigationType = 'push' | 'reload' | 'replace' | 'traverse';

export type NavigationInterceptOptions = {
  readonly handler?: NavigationInterceptHandler;
  readonly precommitHandler?: NavigationInterceptHandler;
};

export type NavigationApiEvent = {
  readonly cancelable: boolean;
  readonly canIntercept: boolean;
  readonly destination: { readonly url: string };
  readonly downloadRequest: string | null;
  readonly formData: FormData | null;
  readonly hashChange: boolean;
  readonly info: unknown;
  readonly navigationType: NavigationType;
  readonly signal: AbortSignal;
  readonly intercept: (options: NavigationInterceptOptions) => void;
};

type NavigationEventListener = (event: NavigationApiEvent) => void;

export type NavigationApi = {
  readonly addEventListener: (type: 'navigate', listener: NavigationEventListener) => void;
  readonly removeEventListener: (type: 'navigate', listener: NavigationEventListener) => void;
};

type NavigationWindow = Window & {
  readonly NavigationPrecommitController?: unknown;
  readonly navigation?: NavigationApi;
};

const ReactTransitionNavigationInfo = 'react-transition';

export class NavigationApiUnavailableError extends Schema.TaggedError<NavigationApiUnavailableError>()(
  'NavigationApiUnavailableError',
  {},
) {}

export class NavigationPrecommitUnavailableError extends Schema.TaggedError<NavigationPrecommitUnavailableError>()(
  'NavigationPrecommitUnavailableError',
  {},
) {}

const shouldIntercept = (event: NavigationApiEvent) =>
  event.canIntercept &&
  !event.hashChange &&
  event.downloadRequest === null &&
  event.formData === null &&
  event.info !== ReactTransitionNavigationInfo &&
  event.navigationType !== 'reload';

export const listenForNavigation = Effect.fnUntraced(function* (
  browserRoot: BrowserRootController,
) {
  const navigationWindow = window as NavigationWindow;
  const navigation = navigationWindow.navigation;
  if (navigation === undefined) {
    return yield* new NavigationApiUnavailableError();
  }
  if (navigationWindow.NavigationPrecommitController === undefined) {
    return yield* new NavigationPrecommitUnavailableError();
  }
  const run = yield* FiberSet.makeRuntimePromise<HttpClient.HttpClient | Scope.Scope>();

  const onNavigate = (event: NavigationApiEvent) => {
    if (!shouldIntercept(event)) {
      return;
    }

    const destination = new URL(event.destination.url);
    const handler = () => {
      const navigation = Promise.withResolvers<void>();

      // oxlint-disable-next-line effecttsgo/async-function -- React Transition Actions are a native Promise boundary.
      startTransition(async () => {
        try {
          const { payload, release } = await run(loadFlight({ _tag: 'Navigation', destination }), {
            signal: event.signal,
          });
          const reactCommitted = browserRoot.render({
            _tag: 'Navigation',
            routeTree: payload.routeTree,
          });
          await run(Effect.promise(() => reactCommitted).pipe(Effect.onInterrupt(() => release)), {
            signal: event.signal,
          });
          navigation.resolve();
        } catch (cause) {
          navigation.reject(cause);
        }
      });

      return navigation.promise;
    };

    event.intercept(
      event.cancelable
        ? { precommitHandler: handler }
        : {
            // Browsers make some traversals non-cancelable so an application cannot trap users.
            handler,
          },
    );
  };

  yield* Effect.acquireRelease(
    Effect.sync(() => navigation.addEventListener('navigate', onNavigate)),
    () => Effect.sync(() => navigation.removeEventListener('navigate', onNavigate)),
  );
});
