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

it.effect('retires a superseded render only after its successor becomes visible', () =>
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
    const firstRetired = first.rollback();
    let firstRetirementObserved = false;
    void firstRetired.then(() => {
      firstRetirementObserved = true;
    });

    expect(renders).toEqual([]);
    yield* Effect.promise(() => Promise.resolve());
    expect(firstRetirementObserved).toBe(false);

    renderer.commit(secondRender);
    yield* Effect.promise(() => firstRetired);

    expect(firstRetirementObserved).toBe(true);
    expect(renders).toEqual([]);
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
