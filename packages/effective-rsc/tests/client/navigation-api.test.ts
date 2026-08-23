import { expect, it } from '@effect/vitest';
import { Effect, Exit, Scope } from 'effect';

import {
  listenForNavigation,
  navigationApiFromWindow,
  NavigationApiUnavailableError,
  type NavigationApi,
  type NavigationApiEvent,
  type NavigationInterceptOptions,
} from '../../src/client/navigation-api';

class TestNavigationApi implements NavigationApi {
  private listener: ((event: NavigationApiEvent) => void) | null = null;

  addEventListener(_type: 'navigate', listener: (event: NavigationApiEvent) => void) {
    this.listener = listener;
  }

  removeEventListener(_type: 'navigate', listener: (event: NavigationApiEvent) => void) {
    if (this.listener === listener) {
      this.listener = null;
    }
  }

  dispatch(event: NavigationApiEvent) {
    this.listener?.(event);
  }

  get isListening() {
    return this.listener !== null;
  }
}

const makeNavigationEvent = (overrides: Partial<NavigationApiEvent> = {}) => {
  let interception: NavigationInterceptOptions | null = null;
  const event: NavigationApiEvent = {
    cancelable: true,
    canIntercept: true,
    destination: { url: 'https://effective-rsc.test/schedule/day-two' },
    downloadRequest: null,
    formData: null,
    hashChange: false,
    info: undefined,
    intercept: (options) => {
      interception = options;
    },
    signal: new AbortController().signal,
    ...overrides,
  };

  return {
    event,
    interception: () => interception,
  };
};

it.effect('holds a cancelable navigation in precommit until rendering completes', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigationApi();
    const observed: Array<{ readonly destination: URL; readonly signal: AbortSignal }> = [];
    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* listenForNavigation(navigation, (destination, signal) => {
          observed.push({ destination, signal });
          return Promise.resolve();
        });
        const pendingNavigation = makeNavigationEvent();

        navigation.dispatch(pendingNavigation.event);

        const interception = pendingNavigation.interception();
        expect(interception?.handler).toBeUndefined();
        expect(interception?.precommitHandler).toBeTypeOf('function');
        if (interception?.precommitHandler === undefined) {
          return yield* Effect.die('Expected a precommit handler.');
        }

        yield* Effect.promise(interception.precommitHandler);

        expect(observed).toEqual([
          {
            destination: new URL('https://effective-rsc.test/schedule/day-two'),
            signal: pendingNavigation.event.signal,
          },
        ]);
      }),
    );
  }),
);

it.effect('uses a post-commit handler for a non-cancelable traversal', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      let destination: URL | null = null;
      yield* listenForNavigation(navigation, (nextDestination) => {
        destination = nextDestination;
        return Promise.resolve();
      });
      const pendingNavigation = makeNavigationEvent({ cancelable: false });

      navigation.dispatch(pendingNavigation.event);

      const interception = pendingNavigation.interception();
      expect(interception?.precommitHandler).toBeUndefined();
      expect(interception?.handler).toBeTypeOf('function');
      if (interception?.handler === undefined) {
        return yield* Effect.die('Expected a post-commit handler.');
      }

      yield* Effect.promise(interception.handler);

      expect(destination).toEqual(new URL('https://effective-rsc.test/schedule/day-two'));
    }),
  ),
);

it.effect('leaves navigations outside the router boundary to the browser', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      let handled = false;
      yield* listenForNavigation(navigation, () => {
        handled = true;
        return Promise.resolve();
      });
      const nativeNavigations = [
        makeNavigationEvent({ canIntercept: false }),
        makeNavigationEvent({ hashChange: true }),
        makeNavigationEvent({ downloadRequest: '' }),
        makeNavigationEvent({ formData: new FormData() }),
        makeNavigationEvent({ info: 'react-transition' }),
      ];

      for (const navigationEvent of nativeNavigations) {
        navigation.dispatch(navigationEvent.event);
        expect(navigationEvent.interception()).toBeNull();
      }
      expect(handled).toBe(false);
    }),
  ),
);

it.effect('removes the listener when its Effect scope closes', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigationApi();
    const scope = yield* Scope.make();
    yield* listenForNavigation(navigation, () => Promise.resolve()).pipe(Scope.provide(scope));

    expect(navigation.isListening).toBe(true);

    yield* Scope.close(scope, Exit.void);

    expect(navigation.isListening).toBe(false);
  }),
);

it.effect('fails explicitly when the browser does not provide the Navigation API', () =>
  navigationApiFromWindow({} as Window).pipe(
    Effect.flip,
    Effect.map((error) => {
      expect(error).toBeInstanceOf(NavigationApiUnavailableError);
    }),
  ),
);
