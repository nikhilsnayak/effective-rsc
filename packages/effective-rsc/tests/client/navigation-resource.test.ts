import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';
import { vi } from 'vitest';

import type { RouteTreeModel } from '../../src/rsc/route-tree';

const decodedFlights = vi.hoisted<
  Array<{
    readonly formState: null;
    readonly routeTree: RouteTreeModel;
    readonly serverFnResult: null;
  }>
>(() => []);

vi.mock('react-server-dom-rspack/client.browser', () => ({
  createFromReadableStream: vi.fn(() => Promise.resolve(decodedFlights.shift())),
}));

import { FlightClient } from '../../src/client/flight-client';
import { NavigationResources } from '../../src/client/navigation-resource';

const makeRouteTree = (id: string): RouteTreeModel => ({
  child: null,
  content: null,
  id,
});

const makeNavigationEntry = (id: string, key: string, url: string) =>
  Object.assign(new EventTarget(), { id, index: 0, key, url });

class TestNavigationHistory {
  currentEntry: ReturnType<typeof makeNavigationEntry>;

  constructor(initialEntry: ReturnType<typeof makeNavigationEntry>) {
    this.currentEntry = initialEntry;
  }
}

const makeHttpClient = (requestedUrls: Array<string>) =>
  HttpClient.make((request) =>
    Effect.sync(() => {
      requestedUrls.push(request.url);
      return HttpClientResponse.fromWeb(
        request,
        new Response(new Uint8Array(), {
          headers: {
            'content-location': request.url,
            'content-type': 'text/x-component',
          },
        }),
      );
    }),
  );

const load = (
  navigationResources: NavigationResources['Service'],
  entry: ReturnType<typeof makeNavigationEntry>,
  navigationType: NavigationType,
) => navigationResources.load({ destination: entry, navigationType });

it.effect('does not let initial Flight completion overwrite a refreshed cache generation', () => {
  decodedFlights.length = 0;
  const initialFlight = Promise.withResolvers<void>();
  const requestedUrls: Array<string> = [];
  return Effect.scoped(
    Effect.gen(function* () {
      const initialEntry = makeNavigationEntry(
        'entry-one',
        'slot-one',
        'https://effective-rsc.test/schedule/day-one',
      );
      const navigationHistory = new TestNavigationHistory(initialEntry);
      const navigationResources = yield* NavigationResources.make(
        navigationHistory,
        makeRouteTree('initial'),
        initialFlight.promise,
      );

      navigationResources.prepareRefresh(makeRouteTree('refreshed'))();
      initialFlight.resolve();
      yield* Effect.promise(() => Promise.resolve());
      yield* Effect.yieldNow;

      const resource = yield* load(navigationResources, initialEntry, 'traverse');

      expect(resource._tag).toBe('Route');
      if (resource._tag === 'Route') {
        expect(resource.routeTree.id).toBe('refreshed');
      }
      expect(requestedUrls).toEqual([]);
    }).pipe(
      Effect.provide(FlightClient.layer),
      Effect.provideService(HttpClient.HttpClient, makeHttpClient(requestedUrls)),
    ),
  );
});

it.effect('invalidates cached history entries before a development refresh', () => {
  decodedFlights.length = 0;
  const requestedUrls: Array<string> = [];
  return Effect.scoped(
    Effect.gen(function* () {
      const initialEntry = makeNavigationEntry(
        'entry-one',
        'slot-one',
        'https://effective-rsc.test/schedule/day-one',
      );
      const navigationHistory = new TestNavigationHistory(initialEntry);
      const navigationResources = yield* NavigationResources.make(
        navigationHistory,
        makeRouteTree('initial'),
        Promise.resolve(),
      );
      yield* Effect.yieldNow;
      navigationResources.invalidate();
      decodedFlights.push({
        formState: null,
        routeTree: makeRouteTree('reloaded'),
        serverFnResult: null,
      });

      const resource = yield* load(navigationResources, initialEntry, 'traverse');

      expect(resource._tag === 'Route' && resource.routeTree.id).toBe('reloaded');
      expect(requestedUrls).toEqual([initialEntry.url]);
    }).pipe(
      Effect.provide(FlightClient.layer),
      Effect.provideService(HttpClient.HttpClient, makeHttpClient(requestedUrls)),
    ),
  );
});

it.effect('fences an in-flight navigation cache write when a refresh invalidates it', () => {
  decodedFlights.length = 0;
  const requestedUrls: Array<string> = [];
  return Effect.scoped(
    Effect.gen(function* () {
      const initialEntry = makeNavigationEntry(
        'entry-one',
        'slot-one',
        'https://effective-rsc.test/schedule/day-one',
      );
      const navigationHistory = new TestNavigationHistory(initialEntry);
      const navigationResources = yield* NavigationResources.make(
        navigationHistory,
        makeRouteTree('initial'),
        Promise.resolve(),
      );
      decodedFlights.push({
        formState: null,
        routeTree: makeRouteTree('navigation'),
        serverFnResult: null,
      });

      const navigationResource = yield* load(navigationResources, initialEntry, 'push');
      navigationResources.prepareRefresh(makeRouteTree('refreshed'))();
      if (navigationResource._tag === 'Route') {
        navigationResource.cacheCurrent();
      }

      const cached = yield* load(navigationResources, initialEntry, 'traverse');

      expect(cached._tag).toBe('Route');
      if (cached._tag === 'Route') {
        expect(cached.routeTree.id).toBe('refreshed');
      }
      expect(requestedUrls).toEqual([initialEntry.url]);
    }).pipe(
      Effect.provide(FlightClient.layer),
      Effect.provideService(HttpClient.HttpClient, makeHttpClient(requestedUrls)),
    ),
  );
});

it.effect('attributes a refresh to the history entry where it started', () => {
  decodedFlights.length = 0;
  const requestedUrls: Array<string> = [];
  return Effect.scoped(
    Effect.gen(function* () {
      const firstEntry = makeNavigationEntry(
        'entry-one',
        'slot-one',
        'https://effective-rsc.test/schedule/day-one',
      );
      const secondEntry = makeNavigationEntry(
        'entry-two',
        'slot-two',
        'https://effective-rsc.test/schedule/day-two',
      );
      const navigationHistory = new TestNavigationHistory(firstEntry);
      const navigationResources = yield* NavigationResources.make(
        navigationHistory,
        makeRouteTree('initial'),
        Promise.resolve(),
      );

      const commitRefresh = navigationResources.prepareRefresh(makeRouteTree('refreshed'));
      navigationHistory.currentEntry = secondEntry;
      commitRefresh();
      const firstCached = yield* load(navigationResources, firstEntry, 'traverse');

      expect(firstCached._tag === 'Route' && firstCached.routeTree.id).toBe('refreshed');
      expect(requestedUrls).toEqual([]);
    }).pipe(
      Effect.provide(FlightClient.layer),
      Effect.provideService(HttpClient.HttpClient, makeHttpClient(requestedUrls)),
    ),
  );
});

it.effect('keys history cache entries by id and evicts them when the browser disposes them', () => {
  decodedFlights.length = 0;
  const requestedUrls: Array<string> = [];
  return Effect.scoped(
    Effect.gen(function* () {
      const firstEntry = makeNavigationEntry(
        'entry-one',
        'shared-slot',
        'https://effective-rsc.test/schedule/day-one',
      );
      const secondEntry = makeNavigationEntry(
        'entry-two',
        'shared-slot',
        'https://effective-rsc.test/schedule/day-two',
      );
      const navigationHistory = new TestNavigationHistory(firstEntry);
      const navigationResources = yield* NavigationResources.make(
        navigationHistory,
        makeRouteTree('first'),
        Promise.resolve(),
      );
      yield* Effect.yieldNow;
      decodedFlights.push({
        formState: null,
        routeTree: makeRouteTree('second'),
        serverFnResult: null,
      });

      const secondResource = yield* load(navigationResources, secondEntry, 'push');
      navigationHistory.currentEntry = secondEntry;
      if (secondResource._tag === 'Route') {
        secondResource.cacheCurrent();
      }

      const firstCached = yield* load(navigationResources, firstEntry, 'traverse');
      const secondCached = yield* load(navigationResources, secondEntry, 'traverse');
      expect(firstCached._tag === 'Route' && firstCached.routeTree.id).toBe('first');
      expect(secondCached._tag === 'Route' && secondCached.routeTree.id).toBe('second');

      secondEntry.dispatchEvent(new Event('dispose'));
      decodedFlights.push({
        formState: null,
        routeTree: makeRouteTree('second-reloaded'),
        serverFnResult: null,
      });
      const reloaded = yield* load(navigationResources, secondEntry, 'traverse');

      expect(reloaded._tag === 'Route' && reloaded.routeTree.id).toBe('second-reloaded');
      expect(requestedUrls).toEqual([secondEntry.url, secondEntry.url]);
    }).pipe(
      Effect.provide(FlightClient.layer),
      Effect.provideService(HttpClient.HttpClient, makeHttpClient(requestedUrls)),
    ),
  );
});
