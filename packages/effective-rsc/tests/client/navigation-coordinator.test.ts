import { afterEach, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { vi } from 'vitest';

import { BrowserNavigation } from '../../src/client/browser-navigation';
import { BrowserNavigationCoordinator } from '../../src/client/navigation-coordinator';

const makeNavigationEntry = (key: string, url: string, state?: unknown) => ({
  getState: () => state,
  key,
  url,
});

class TestNavigationHistory {
  currentEntry = makeNavigationEntry('day-one', 'https://effective-rsc.test/schedule/day-one', {
    day: 'one',
  });
  readonly navigations: Array<{
    readonly options: {
      readonly history: 'replace';
      readonly info: unknown;
      readonly state: unknown;
    };
    readonly url: string;
  }> = [];
  readonly traversals: Array<{ readonly info: unknown; readonly key: string }> = [];

  navigate(
    url: string,
    options: { readonly history: 'replace'; readonly info: unknown; readonly state: unknown },
  ) {
    this.navigations.push({ options, url });
    return { finished: Promise.resolve() };
  }

  traverseTo(key: string, options: { readonly info: unknown }) {
    this.traversals.push({ key, ...options });
    return { finished: Promise.resolve() };
  }
}

const makeCoordinator = Effect.fnUntraced(function* (navigation: TestNavigationHistory) {
  vi.stubGlobal('window', {
    NavigationPrecommitController: class {},
    location: { href: 'https://effective-rsc.test/schedule/day-one' },
    navigation,
  });
  const browserNavigation = yield* BrowserNavigation.make;
  return new BrowserNavigationCoordinator(browserNavigation);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it.effect('retires a superseded render after its successor starts rendering', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigationHistory();
    const coordinator = yield* makeCoordinator(navigation);
    const first = coordinator.begin('push');
    const retired: Array<string> = [];

    expect(first.render(() => 'first')).toEqual({ _tag: 'Rendered', value: 'first' });
    const firstRollback = first.rollback('Aborted', () => {
      retired.push('first');
      return Promise.resolve();
    });
    const second = coordinator.begin('push');

    yield* Effect.promise(() => Promise.resolve());
    expect(retired).toEqual([]);
    expect(first.render(() => 'stale')).toEqual({ _tag: 'Discarded' });
    expect(second.render(() => 'second')).toEqual({ _tag: 'Rendered', value: 'second' });
    yield* Effect.promise(() => firstRollback);

    expect(retired).toEqual(['first']);
    expect(navigation.navigations).toEqual([]);
    expect(navigation.traversals).toEqual([]);
  }),
);

it.effect('restores the original history entry when a successor chain fails', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigationHistory();
    const coordinator = yield* makeCoordinator(navigation);
    const first = coordinator.begin('push');
    const retired: Array<string> = [];

    first.render(() => 'first');
    navigation.currentEntry = makeNavigationEntry(
      'day-two',
      'https://effective-rsc.test/schedule/day-two',
    );
    const firstRollback = first.rollback('Aborted', () => {
      retired.push('first');
      return Promise.resolve();
    });
    const second = coordinator.begin('push');
    const third = coordinator.begin('push');

    expect(second.render(() => 'stale')).toEqual({ _tag: 'Discarded' });
    third.fail();
    yield* Effect.promise(() => firstRollback);

    expect(retired).toEqual(['first']);
    expect(navigation.traversals).toEqual([{ info: 'ersc-history-rollback', key: 'day-one' }]);
  }),
);

it.effect('starts a new rollback chain after a navigation completes', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigationHistory();
    const coordinator = yield* makeCoordinator(navigation);
    const first = coordinator.begin('push');

    first.render(() => 'first');
    navigation.currentEntry = makeNavigationEntry(
      'day-two',
      'https://effective-rsc.test/schedule/day-two',
    );
    first.complete();

    const second = coordinator.begin('push');
    second.render(() => 'second');
    navigation.currentEntry = makeNavigationEntry(
      'day-three',
      'https://effective-rsc.test/schedule/day-three',
    );
    yield* Effect.promise(() => second.rollback('Failed', () => Promise.resolve()));

    expect(navigation.traversals).toEqual([{ info: 'ersc-history-rollback', key: 'day-two' }]);
  }),
);

it.effect('restores replacement navigation with the original URL and state', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigationHistory();
    const coordinator = yield* makeCoordinator(navigation);
    const attempt = coordinator.begin('replace');

    attempt.render(() => 'replacement');
    navigation.currentEntry = makeNavigationEntry(
      'replacement',
      'https://effective-rsc.test/schedule/replacement',
    );
    yield* Effect.promise(() => attempt.rollback('Failed', () => Promise.resolve()));

    expect(navigation.navigations).toEqual([
      {
        options: {
          history: 'replace',
          info: 'ersc-history-rollback',
          state: { day: 'one' },
        },
        url: 'https://effective-rsc.test/schedule/day-one',
      },
    ]);
  }),
);

it.effect('keeps an attempt pending when its render operation throws', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigationHistory();
    const coordinator = yield* makeCoordinator(navigation);
    const attempt = coordinator.begin('push');

    expect(() =>
      attempt.render(() => {
        throw new Error('render failed');
      }),
    ).toThrow('render failed');
    expect(attempt.render(() => 'retry')).toEqual({ _tag: 'Rendered', value: 'retry' });
  }),
);
