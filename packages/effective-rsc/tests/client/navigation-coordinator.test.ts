import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { BrowserNavigationCoordinator } from '../../src/client/navigation-coordinator';

it.effect('retires a superseded render when its successor arrives after abort microtasks', () =>
  Effect.gen(function* () {
    const coordinator = new BrowserNavigationCoordinator();
    const first = coordinator.begin();
    const retired: Array<string> = [];

    expect(first.render(() => 'first')).toEqual({ _tag: 'Rendered', value: 'first' });
    const firstRollback = first.rollback('Aborted', () => {
      retired.push('first');
      return Promise.resolve();
    });
    yield* Effect.promise(() => Promise.resolve());
    const second = coordinator.begin();

    yield* Effect.promise(() => Promise.resolve());
    expect(retired).toEqual([]);
    expect(first.render(() => 'stale')).toEqual({ _tag: 'Discarded' });
    expect(second.render(() => 'second')).toEqual({ _tag: 'Rendered', value: 'second' });
    yield* Effect.promise(() => firstRollback);

    expect(retired).toEqual(['first']);
  }),
);

it.effect('finishes superseded render cleanup when its successor fails', () =>
  Effect.gen(function* () {
    const coordinator = new BrowserNavigationCoordinator();
    const first = coordinator.begin();
    const retired: Array<string> = [];

    first.render(() => 'first');
    const firstRollback = first.rollback('Aborted', () => {
      retired.push('first');
      return Promise.resolve();
    });
    const second = coordinator.begin();

    second.fail();
    yield* Effect.promise(() => firstRollback);

    expect(retired).toEqual(['first']);
  }),
);

it.effect('keeps an attempt pending when its render operation throws', () =>
  Effect.sync(() => {
    const coordinator = new BrowserNavigationCoordinator();
    const attempt = coordinator.begin();

    expect(() =>
      attempt.render(() => {
        throw new Error('render failed');
      }),
    ).toThrow('render failed');
    expect(attempt.render(() => 'retry')).toEqual({ _tag: 'Rendered', value: 'retry' });
  }),
);
