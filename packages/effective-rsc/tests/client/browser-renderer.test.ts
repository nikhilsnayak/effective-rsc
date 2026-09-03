import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { type BrowserRender, BrowserRenderer } from '../../src/client/browser-renderer';
import type { RouteTreeModel } from '../../src/rsc/route-tree';

const makeRouteTree = (id: string): RouteTreeModel => ({ child: null, content: null, id });

const nextRender = (renders: Array<BrowserRender>) => {
  const render = renders.shift();
  if (render === undefined) {
    throw new Error('Expected the browser renderer to publish an update.');
  }
  return render;
};

it.effect('initializes once for a React root', () =>
  Effect.gen(function* () {
    const renderer = yield* BrowserRenderer.make;
    const initialRouteTree = makeRouteTree('initial');
    const publish = () => undefined;

    expect(() => renderer.navigate(makeRouteTree('destination'))).toThrow(
      'BrowserRenderer must be initialized by ReactDOMRenderer.',
    );

    renderer.initialize(initialRouteTree, publish);
    renderer.initialize(initialRouteTree, publish);

    expect(() => renderer.initialize(initialRouteTree, () => undefined)).toThrow(
      'BrowserRenderer cannot be initialized by more than one React root.',
    );
  }),
);

it.effect('restores the stable route tree when a visible navigation is canceled', () =>
  Effect.gen(function* () {
    const initialRouteTree = makeRouteTree('initial');
    const renders: Array<BrowserRender> = [];
    const renderer = yield* BrowserRenderer.make;
    renderer.initialize(initialRouteTree, (render) => renders.push(render));
    const navigation = renderer.navigate(makeRouteTree('destination'));
    const navigationRender = nextRender(renders);
    if (navigationRender._tag !== 'Navigation') {
      return yield* Effect.die('Expected a navigation render.');
    }
    renderer.commit(navigationRender);
    yield* Effect.promise(() => navigation.committed);

    const retired = navigation.rollback();
    const rollbackRender = nextRender(renders);
    expect(rollbackRender._tag).toBe('Rollback');
    if (rollbackRender._tag !== 'Rollback') {
      return yield* Effect.die('Expected a rollback render.');
    }
    expect(rollbackRender.routeTree).toBe(initialRouteTree);
    renderer.commit(rollbackRender);
    yield* Effect.promise(() => retired);

    expect(renders).toEqual([]);
  }),
);

it.effect('retires a navigation only after its successor becomes visible', () =>
  Effect.gen(function* () {
    const renders: Array<BrowserRender> = [];
    const renderer = yield* BrowserRenderer.make;
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    const first = renderer.navigate(makeRouteTree('first'));
    const firstRender = nextRender(renders);
    if (firstRender._tag !== 'Navigation') {
      return yield* Effect.die('Expected the first navigation render.');
    }
    renderer.commit(firstRender);

    renderer.navigate(makeRouteTree('second'));
    const secondRender = nextRender(renders);
    if (secondRender._tag !== 'Navigation') {
      return yield* Effect.die('Expected the second navigation render.');
    }
    let firstRetirementObserved = false;
    void first.retired.then(() => {
      firstRetirementObserved = true;
    });

    expect(renders).toEqual([]);
    yield* Effect.promise(() => Promise.resolve());
    expect(firstRetirementObserved).toBe(false);

    renderer.commit(secondRender);
    yield* Effect.promise(() => first.retired);

    expect(firstRetirementObserved).toBe(true);
    expect(renders).toEqual([]);
  }),
);

it.effect('retires a visible navigation when a refresh commits', () =>
  Effect.gen(function* () {
    const renders: Array<BrowserRender> = [];
    const renderer = yield* BrowserRenderer.make;
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    const navigation = renderer.navigate(makeRouteTree('destination'));
    const navigationRender = nextRender(renders);
    if (navigationRender._tag !== 'Navigation') {
      return yield* Effect.die('Expected a navigation render.');
    }
    renderer.commit(navigationRender);

    const refresh = renderer.refresh(makeRouteTree('refreshed'));
    const refreshRender = nextRender(renders);
    let retirementObserved = false;
    void navigation.retired.then(() => {
      retirementObserved = true;
    });
    yield* Effect.promise(() => Promise.resolve());
    expect(retirementObserved).toBe(false);

    renderer.commit(refreshRender);
    yield* Effect.promise(() => Promise.all([navigation.retired, refresh]));

    expect(retirementObserved).toBe(true);
  }),
);

it.effect('discards a scheduled navigation without replacing the visible navigation', () =>
  Effect.gen(function* () {
    const visibleRouteTree = makeRouteTree('visible');
    const renders: Array<BrowserRender> = [];
    const renderer = yield* BrowserRenderer.make;
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    const visibleNavigation = renderer.navigate(visibleRouteTree);
    const visibleRender = nextRender(renders);
    if (visibleRender._tag !== 'Navigation') {
      return yield* Effect.die('Expected the visible navigation render.');
    }
    renderer.commit(visibleRender);

    const candidate = renderer.navigate(makeRouteTree('candidate'));
    nextRender(renders);
    const discarded = candidate.discard();
    const discardRender = nextRender(renders);
    expect(discardRender._tag).toBe('Discard');
    expect(discardRender.routeTree).toBe(visibleRouteTree);

    let candidateRetired = false;
    let visibleRetired = false;
    void candidate.retired.then(() => {
      candidateRetired = true;
    });
    void visibleNavigation.retired.then(() => {
      visibleRetired = true;
    });
    yield* Effect.promise(() => Promise.resolve());
    expect(candidateRetired).toBe(false);

    renderer.commit(discardRender);
    yield* Effect.promise(() => discarded);

    expect(candidateRetired).toBe(true);
    expect(visibleRetired).toBe(false);
    expect(() => candidate.discard()).toThrow(
      'Only a scheduled browser navigation can be discarded.',
    );
  }),
);

it.effect('advances the stable route tree only after Flight completes', () =>
  Effect.gen(function* () {
    const firstRouteTree = makeRouteTree('first');
    const renders: Array<BrowserRender> = [];
    const renderer = yield* BrowserRenderer.make;
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    const first = renderer.navigate(firstRouteTree);
    const firstRender = nextRender(renders);
    if (firstRender._tag !== 'Navigation') {
      return yield* Effect.die('Expected the first navigation render.');
    }
    renderer.commit(firstRender);
    first.complete();

    const second = renderer.navigate(makeRouteTree('second'));
    const secondRender = nextRender(renders);
    if (secondRender._tag !== 'Navigation') {
      return yield* Effect.die('Expected the second navigation render.');
    }
    renderer.commit(secondRender);
    const retired = second.rollback();
    const rollbackRender = nextRender(renders);
    if (rollbackRender._tag !== 'Rollback') {
      return yield* Effect.die('Expected a rollback render.');
    }

    expect(rollbackRender.routeTree).toBe(firstRouteTree);
    renderer.commit(rollbackRender);
    yield* Effect.promise(() => retired);
  }),
);

it.effect('uses a committed Server Function refresh as the next rollback target', () =>
  Effect.gen(function* () {
    const refreshedRouteTree = makeRouteTree('refreshed');
    const renders: Array<BrowserRender> = [];
    const renderer = yield* BrowserRenderer.make;
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    const refreshed = renderer.refresh(refreshedRouteTree);
    const refreshRender = nextRender(renders);
    if (refreshRender._tag !== 'Refresh') {
      return yield* Effect.die('Expected a refresh render.');
    }
    renderer.commit(refreshRender);
    yield* Effect.promise(() => refreshed);

    const navigation = renderer.navigate(makeRouteTree('destination'));
    const navigationRender = nextRender(renders);
    if (navigationRender._tag !== 'Navigation') {
      return yield* Effect.die('Expected a navigation render.');
    }
    renderer.commit(navigationRender);
    const retired = navigation.rollback();
    const rollbackRender = nextRender(renders);
    if (rollbackRender._tag !== 'Rollback') {
      return yield* Effect.die('Expected a rollback render.');
    }

    expect(rollbackRender.routeTree).toBe(refreshedRouteTree);
    renderer.commit(rollbackRender);
    yield* Effect.promise(() => retired);
  }),
);
