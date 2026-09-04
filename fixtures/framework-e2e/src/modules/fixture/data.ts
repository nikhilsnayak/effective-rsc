import type { Duration } from 'effect';

import type {
  CatalogDefinition,
  Detail,
  FixtureGroup,
  FixtureMetadata,
  ItemDefinition,
} from '@/modules/fixture/model';

export const fixture = {
  description: 'A neutral application dedicated to effective-rsc integration contracts.',
  name: 'ERSC Framework Fixture',
  revision: 'fixture-v1',
  runtime: 'Bun + React Server Components',
  storage: 'In-memory SQLite',
} satisfies FixtureMetadata;

export const catalogs = {
  primary: {
    description: 'Initial document, nested layout, loading, and streamed component coverage.',
    group: 'primary',
    label: 'Primary',
    items: [
      {
        category: 'Rendering',
        description: 'Provides stable content for full-document and Flight protocol assertions.',
        detailId: 'primary-document',
        id: 'document-stream',
        slot: 'P1',
        title: 'Document stream',
      },
      {
        category: 'Data',
        description: 'Exercises application services backed by an Effect SQL repository.',
        detailId: 'primary-service',
        id: 'service-layer',
        slot: 'P2',
        title: 'Service layer',
      },
      {
        category: 'Navigation',
        description: 'Provides a mutation target while preserving the current route tree.',
        detailId: 'primary-navigation',
        id: 'navigation-refresh',
        slot: 'P3',
        title: 'Navigation refresh',
      },
      {
        category: 'Rendering',
        description: 'Keeps one nested Suspense leaf pending after its surrounding page reveals.',
        detailId: 'primary-suspense',
        id: 'nested-suspense',
        slot: 'P4',
        title: 'Nested Suspense leaf',
      },
    ],
  },
  secondary: {
    description: 'Traversal cache, Server Function, supersession, and slow-stream coverage.',
    group: 'secondary',
    label: 'Secondary',
    items: [
      {
        category: 'Navigation',
        description: 'Provides stable content for Back and Forward cache assertions.',
        detailId: 'secondary-history',
        id: 'history-cache',
        slot: 'S1',
        title: 'History cache',
      },
      {
        category: 'Data',
        description: 'Exercises a typed mutation over React’s native Server Function protocol.',
        detailId: 'secondary-mutation',
        id: 'server-function-mutation',
        slot: 'S2',
        title: 'Server Function mutation',
      },
      {
        category: 'Rendering',
        description: 'Stays pending long enough to verify committed Flight stream ownership.',
        detailId: 'secondary-slow-stream',
        id: 'slow-stream-leaf',
        slot: 'S3',
        title: 'Slow stream leaf',
      },
    ],
  },
} satisfies Record<FixtureGroup, CatalogDefinition>;

export const details: ReadonlyMap<
  string,
  { readonly latency: Duration.Input; readonly detail: Detail }
> = new Map([
  [
    'primary-document',
    {
      latency: '180 millis',
      detail: {
        id: 'primary-document',
        label: 'Primary detail A',
        description: 'Document render detail',
      },
    },
  ],
  [
    'primary-service',
    {
      latency: '420 millis',
      detail: {
        id: 'primary-service',
        label: 'Primary detail B',
        description: 'Service resolution detail',
      },
    },
  ],
  [
    'primary-navigation',
    {
      latency: '700 millis',
      detail: {
        id: 'primary-navigation',
        label: 'Primary detail C',
        description: 'Navigation detail',
      },
    },
  ],
  [
    'primary-suspense',
    {
      latency: '960 millis',
      detail: {
        id: 'primary-suspense',
        label: 'Primary detail D',
        description: 'Suspense resolution detail',
      },
    },
  ],
  [
    'secondary-history',
    {
      latency: '240 millis',
      detail: {
        id: 'secondary-history',
        label: 'Secondary detail A',
        description: 'History traversal detail',
      },
    },
  ],
  [
    'secondary-mutation',
    {
      latency: '540 millis',
      detail: {
        id: 'secondary-mutation',
        label: 'Secondary detail B',
        description: 'Server Function detail',
      },
    },
  ],
  [
    'secondary-slow-stream',
    {
      latency: '3 seconds',
      detail: {
        id: 'secondary-slow-stream',
        label: 'Secondary detail C',
        description: 'Slow stream detail',
      },
    },
  ],
]);

type IndexedItem = { readonly groupLabel: string; readonly item: ItemDefinition };

export const itemById: ReadonlyMap<string, IndexedItem> = new Map(
  Object.values(catalogs).flatMap((catalog) =>
    catalog.items.map(
      (item) =>
        [item.id, { groupLabel: catalog.label, item }] satisfies readonly [string, IndexedItem],
    ),
  ),
);
