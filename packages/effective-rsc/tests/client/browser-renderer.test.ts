import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { vi } from 'vitest';

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
    const renderer = yield* BrowserRenderer;
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
  }).pipe(Effect.provide(BrowserRenderer.layer)),
);

it.effect('rejects discard after a navigation commits', () =>
  Effect.gen(function* () {
    const renders: Array<BrowserRender> = [];
    const renderer = yield* BrowserRenderer;
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    const navigation = renderer.navigate(makeRouteTree('destination'));
    const navigationRender = nextRender(renders);
    if (navigationRender._tag !== 'Navigation') {
      return yield* Effect.die('Expected a navigation render.');
    }
    renderer.commit(navigationRender);
    yield* Effect.promise(() => navigation.committed);

    expect(() => navigation.discard()).toThrow(
      'Only a scheduled browser navigation can be discarded.',
    );
    expect(renders).toEqual([]);
  }).pipe(Effect.provide(BrowserRenderer.layer)),
);

it.effect('retires a navigation only after its successor becomes visible', () =>
  Effect.gen(function* () {
    const renders: Array<BrowserRender> = [];
    const renderer = yield* BrowserRenderer;
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
  }).pipe(Effect.provide(BrowserRenderer.layer)),
);

it.effect('retires a visible navigation when a refresh commits', () =>
  Effect.gen(function* () {
    const renders: Array<BrowserRender> = [];
    const renderer = yield* BrowserRenderer;
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
    yield* Effect.promise(() => Promise.all([navigation.retired, refresh.committed]));

    expect(retirementObserved).toBe(true);
  }).pipe(Effect.provide(BrowserRenderer.layer)),
);

it.effect('discards a scheduled navigation without replacing the visible navigation', () =>
  Effect.gen(function* () {
    const visibleRouteTree = makeRouteTree('visible');
    const renders: Array<BrowserRender> = [];
    const renderer = yield* BrowserRenderer;
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
    if (discardRender._tag !== 'Discard') {
      return yield* Effect.die('Expected a discard render.');
    }
    expect(discardRender.restore.routeTree).toBe(visibleRouteTree);

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
    expect(candidate.discard()).toBe(discarded);
    expect(renders).toEqual([]);
  }).pipe(Effect.provide(BrowserRenderer.layer)),
);

it.effect('restores the last committed tree when discarding the next navigation', () =>
  Effect.gen(function* () {
    const firstRouteTree = makeRouteTree('first');
    const renders: Array<BrowserRender> = [];
    const renderer = yield* BrowserRenderer;
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    renderer.navigate(firstRouteTree);
    const firstRender = nextRender(renders);
    if (firstRender._tag !== 'Navigation') {
      return yield* Effect.die('Expected the first navigation render.');
    }
    renderer.commit(firstRender);

    const second = renderer.navigate(makeRouteTree('second'));
    const secondRender = nextRender(renders);
    if (secondRender._tag !== 'Navigation') {
      return yield* Effect.die('Expected the second navigation render.');
    }
    const retired = second.discard();
    const discardRender = nextRender(renders);
    if (discardRender._tag !== 'Discard') {
      return yield* Effect.die('Expected a discard render.');
    }

    expect(discardRender.restore.routeTree).toBe(firstRouteTree);
    renderer.commit(discardRender);
    yield* Effect.promise(() => retired);
  }).pipe(Effect.provide(BrowserRenderer.layer)),
);

it.effect('uses a committed Server Function refresh as the next discard target', () =>
  Effect.gen(function* () {
    const refreshedRouteTree = makeRouteTree('refreshed');
    const renders: Array<BrowserRender> = [];
    const renderer = yield* BrowserRenderer;
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    const refreshed = renderer.refresh(refreshedRouteTree);
    const refreshRender = nextRender(renders);
    if (refreshRender._tag !== 'Refresh') {
      return yield* Effect.die('Expected a refresh render.');
    }
    renderer.commit(refreshRender);
    yield* Effect.promise(() => refreshed.committed);

    const navigation = renderer.navigate(makeRouteTree('destination'));
    const navigationRender = nextRender(renders);
    if (navigationRender._tag !== 'Navigation') {
      return yield* Effect.die('Expected a navigation render.');
    }
    const retired = navigation.discard();
    const discardRender = nextRender(renders);
    if (discardRender._tag !== 'Discard') {
      return yield* Effect.die('Expected a discard render.');
    }

    expect(discardRender.restore.routeTree).toBe(refreshedRouteTree);
    renderer.commit(discardRender);
    yield* Effect.promise(() => retired);
  }).pipe(Effect.provide(BrowserRenderer.layer)),
);

it.effect('retires skipped refreshes only up to the render React commits', () =>
  Effect.gen(function* () {
    const renderer = yield* BrowserRenderer;
    const renders: Array<BrowserRender> = [];
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    const first = renderer.refresh(makeRouteTree('first'));
    nextRender(renders);
    const second = renderer.refresh(makeRouteTree('second'));
    const secondRender = nextRender(renders);
    const third = renderer.refresh(makeRouteTree('third'));
    const thirdRender = nextRender(renders);
    const firstRetired = vi.fn();
    const firstCommitted = vi.fn();
    const secondRetired = vi.fn();
    const thirdRetired = vi.fn();
    void first.retired.then(firstRetired);
    void first.committed.then(firstCommitted);
    void second.retired.then(secondRetired);
    void third.retired.then(thirdRetired);

    yield* Effect.promise(() => Promise.resolve());
    expect(firstRetired).not.toHaveBeenCalled();

    // React skips the first refresh, while the third is still preparing.
    renderer.commit(secondRender);
    yield* Effect.promise(() => second.committed);
    expect(firstRetired).toHaveBeenCalledOnce();
    expect(firstCommitted).not.toHaveBeenCalled();
    expect(secondRetired).not.toHaveBeenCalled();
    expect(thirdRetired).not.toHaveBeenCalled();

    // React may repeat a layout effect; the same commit must remain harmless.
    renderer.commit(secondRender);
    renderer.commit(thirdRender);
    yield* Effect.promise(() => third.committed);
    expect(secondRetired).toHaveBeenCalledOnce();
    expect(thirdRetired).not.toHaveBeenCalled();
  }).pipe(Effect.provide(BrowserRenderer.layer)),
);

it.effect('acknowledges a discard that React skips when committing a replacement', () =>
  Effect.gen(function* () {
    const renderer = yield* BrowserRenderer;
    const renders: Array<BrowserRender> = [];
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    const first = renderer.refresh(makeRouteTree('first'));
    nextRender(renders);
    const discarded = vi.fn();
    void first.discard().then(discarded);
    expect(nextRender(renders)._tag).toBe('Discard');
    const second = renderer.refresh(makeRouteTree('second'));
    const secondRender = nextRender(renders);

    yield* Effect.promise(() => Promise.resolve());
    expect(discarded).not.toHaveBeenCalled();
    renderer.commit(secondRender);
    yield* Effect.promise(() => second.committed);
    expect(discarded).toHaveBeenCalledOnce();
  }).pipe(Effect.provide(BrowserRenderer.layer)),
);

it.effect('uses discard publication order when retiring skipped renders', () =>
  Effect.gen(function* () {
    const renderer = yield* BrowserRenderer;
    const renders: Array<BrowserRender> = [];
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    const first = renderer.refresh(makeRouteTree('first'));
    nextRender(renders);
    const second = renderer.refresh(makeRouteTree('second'));
    nextRender(renders);
    const discarded = first.discard();
    const discardRender = nextRender(renders);
    const third = renderer.refresh(makeRouteTree('third'));
    nextRender(renders);
    const secondRetired = vi.fn();
    const thirdRetired = vi.fn();
    void second.retired.then(secondRetired);
    void third.retired.then(thirdRetired);

    // This discard was published after the second refresh but before the third.
    renderer.commit(discardRender);
    yield* Effect.promise(() => discarded);
    expect(secondRetired).toHaveBeenCalledOnce();
    expect(thirdRetired).not.toHaveBeenCalled();
  }).pipe(Effect.provide(BrowserRenderer.layer)),
);

it.effect(
  'does not republish a skipped navigation when cancellation arrives after retirement',
  () =>
    Effect.gen(function* () {
      const renderer = yield* BrowserRenderer;
      const renders: Array<BrowserRender> = [];
      renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
      const navigation = renderer.navigate(makeRouteTree('destination'));
      nextRender(renders);
      const refresh = renderer.refresh(makeRouteTree('refreshed'));
      renderer.commit(nextRender(renders));
      yield* Effect.promise(() => refresh.committed);

      expect(navigation.discard()).toBe(navigation.retired);
      expect(renders).toEqual([]);
    }).pipe(Effect.provide(BrowserRenderer.layer)),
);

it.effect('keeps a tree alive while a queued discard can restore it', () =>
  Effect.gen(function* () {
    const renderer = yield* BrowserRenderer;
    const renders: Array<BrowserRender> = [];
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    const visible = renderer.refresh(makeRouteTree('visible'));
    renderer.commit(nextRender(renders));
    const visibleRetired = vi.fn();
    void visible.retired.then(visibleRetired);

    const candidate = renderer.refresh(makeRouteTree('candidate'));
    const candidateRender = nextRender(renders);
    const discarded = candidate.discard();
    const discardRender = nextRender(renders);

    // React commits the candidate before processing its lower-priority discard.
    // The discard still needs the previous page's stream to restore that page.
    renderer.commit(candidateRender);
    yield* Effect.promise(() => candidate.committed);
    expect(visibleRetired).not.toHaveBeenCalled();

    renderer.commit(discardRender);
    yield* Effect.promise(() => discarded);
    expect(visibleRetired).not.toHaveBeenCalled();

    const replacement = renderer.refresh(makeRouteTree('replacement'));
    renderer.commit(nextRender(renders));
    yield* Effect.promise(() => replacement.committed);
    expect(visibleRetired).toHaveBeenCalledOnce();
  }).pipe(Effect.provide(BrowserRenderer.layer)),
);

it.effect('releases a retained tree when React skips the discard that would restore it', () =>
  Effect.gen(function* () {
    const renderer = yield* BrowserRenderer;
    const renders: Array<BrowserRender> = [];
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    const visible = renderer.refresh(makeRouteTree('visible'));
    renderer.commit(nextRender(renders));
    const visibleRetired = vi.fn();
    void visible.retired.then(visibleRetired);

    const candidate = renderer.refresh(makeRouteTree('candidate'));
    const candidateRender = nextRender(renders);
    const candidateRetired = vi.fn();
    void candidate.discard().then(candidateRetired);
    nextRender(renders);
    renderer.commit(candidateRender);
    yield* Effect.promise(() => candidate.committed);
    expect(visibleRetired).not.toHaveBeenCalled();

    // A newer replacement overtakes the discard, so neither older tree can return.
    const replacement = renderer.refresh(makeRouteTree('replacement'));
    renderer.commit(nextRender(renders));
    yield* Effect.promise(() => replacement.committed);
    expect(visibleRetired).toHaveBeenCalledOnce();
    expect(candidateRetired).toHaveBeenCalledOnce();
  }).pipe(Effect.provide(BrowserRenderer.layer)),
);

it.effect("rejects another root's publication before changing the visible tree", () =>
  Effect.gen(function* () {
    const renderer = yield* BrowserRenderer.make;
    const otherRenderer = yield* BrowserRenderer.make;
    const renders: Array<BrowserRender> = [];
    const otherRenders: Array<BrowserRender> = [];
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    otherRenderer.initialize(makeRouteTree('other'), (render) => otherRenders.push(render));
    const visibleTree = makeRouteTree('visible');
    const visible = renderer.refresh(visibleTree);
    renderer.commit(nextRender(renders));
    const visibleRetired = vi.fn();
    void visible.retired.then(visibleRetired);

    otherRenderer.refresh(makeRouteTree('foreign'));
    expect(() => renderer.commit(nextRender(otherRenders))).toThrow(
      'Browser render does not belong to this root.',
    );

    const candidate = renderer.navigate(makeRouteTree('candidate'));
    nextRender(renders);
    const discarded = candidate.discard();
    const discardRender = nextRender(renders);
    if (discardRender._tag !== 'Discard') {
      return yield* Effect.die('Expected a discard render.');
    }
    expect(discardRender.restore.routeTree).toBe(visibleTree);
    renderer.commit(discardRender);
    yield* Effect.promise(() => discarded);
    expect(visibleRetired).not.toHaveBeenCalled();
  }),
);

it.effect('rejects an older commit without retiring the current tree', () =>
  Effect.gen(function* () {
    const renderer = yield* BrowserRenderer;
    const renders: Array<BrowserRender> = [];
    renderer.initialize(makeRouteTree('initial'), (render) => renders.push(render));
    renderer.refresh(makeRouteTree('skipped'));
    const skippedRender = nextRender(renders);
    const current = renderer.refresh(makeRouteTree('current'));
    renderer.commit(nextRender(renders));
    const currentRetired = vi.fn();
    void current.retired.then(currentRetired);

    expect(() => renderer.commit(skippedRender)).toThrow(
      'Browser renders must commit in publication order.',
    );
    yield* Effect.promise(() => current.committed);
    expect(currentRetired).not.toHaveBeenCalled();

    const replacement = renderer.refresh(makeRouteTree('replacement'));
    renderer.commit(nextRender(renders));
    yield* Effect.promise(() => replacement.committed);
    expect(currentRetired).toHaveBeenCalledOnce();
  }).pipe(Effect.provide(BrowserRenderer.layer)),
);
