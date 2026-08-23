import { Effect, Schema } from 'effect';

type NavigationInterceptHandler = () => Promise<void>;

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
  readonly signal: AbortSignal;
  readonly intercept: (options: NavigationInterceptOptions) => void;
};

type NavigationEventListener = (event: NavigationApiEvent) => void;

export type NavigationApi = {
  readonly addEventListener: (type: 'navigate', listener: NavigationEventListener) => void;
  readonly removeEventListener: (type: 'navigate', listener: NavigationEventListener) => void;
};

type NavigationWindow = Window & {
  readonly navigation?: NavigationApi;
};

const ReactTransitionNavigationInfo = 'react-transition';

export class NavigationApiUnavailableError extends Schema.TaggedError<NavigationApiUnavailableError>()(
  'NavigationApiUnavailableError',
  {},
) {}

const shouldIntercept = (event: NavigationApiEvent) =>
  event.canIntercept &&
  !event.hashChange &&
  event.downloadRequest === null &&
  event.formData === null &&
  event.info !== ReactTransitionNavigationInfo;

export const navigationApiFromWindow = Effect.fnUntraced(function* (browserWindow: Window) {
  const navigation = (browserWindow as NavigationWindow).navigation;
  if (navigation === undefined) {
    return yield* new NavigationApiUnavailableError();
  }

  return navigation;
});

export const listenForNavigation = Effect.fnUntraced(function* (
  navigation: NavigationApi,
  runNavigation: (destination: URL, signal: AbortSignal) => Promise<void>,
) {
  const onNavigate = (event: NavigationApiEvent) => {
    if (!shouldIntercept(event)) {
      return;
    }

    const destination = new URL(event.destination.url);
    const handler = () => runNavigation(destination, event.signal);

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
