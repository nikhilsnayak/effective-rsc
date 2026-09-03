import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { BrowserNavigationCoordinator } from '../../src/client/navigation-coordinator';

it.effect('discards an aborted render before the next attempt begins', () =>
  Effect.gen(function* () {
    const coordinator = new BrowserNavigationCoordinator();
    const first = coordinator.begin();
    const discarded: Array<string> = [];

    expect(first.render(() => 'first')).toEqual({ _tag: 'Rendered', value: 'first' });
    yield* Effect.promise(() =>
      first.abort(() => {
        discarded.push('first');
        return Promise.resolve();
      }),
    );
    const second = coordinator.begin();

    expect(second.render(() => 'second')).toEqual({ _tag: 'Rendered', value: 'second' });
    expect(discarded).toEqual(['first']);
  }),
);

it.effect('makes a superseded attempt stale', () =>
  Effect.gen(function* () {
    const coordinator = new BrowserNavigationCoordinator();
    const first = coordinator.begin();
    first.render(() => 'first');
    const second = coordinator.begin();

    expect(first.render(() => 'stale')).toEqual({ _tag: 'Discarded' });
    yield* Effect.promise(() => first.abort(() => Promise.resolve()));
    second.fail();
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
