import { Clock, Context, type Duration, Effect, Layer } from 'effect';

import { catalogs, details, fixture, itemById } from '@/modules/fixture/data';
import {
  type Catalog,
  FixtureUnavailable,
  type FixtureGroup,
  type ObservedQuery,
  type SelectionItem,
} from '@/modules/fixture/model';
import { FixtureRepository } from '@/modules/fixture/repository';

type QueryOptions<Value> = {
  readonly latency: Duration.Input;
  readonly value: Value;
};

const query = Effect.fnUntraced(function* <Value>({ latency, value }: QueryOptions<Value>) {
  const startedAt = yield* Clock.currentTimeMillis;
  yield* Effect.sleep(latency);
  const completedAt = yield* Clock.currentTimeMillis;

  return { completedAt, data: value, startedAt } satisfies ObservedQuery<Value>;
});

const unavailable = (operation: string) =>
  Effect.mapError(() => new FixtureUnavailable({ operation }));

export class FixtureService extends Context.Service<FixtureService>()(
  '@effective-rsc/framework-e2e/fixture/FixtureService',
  {
    make: Effect.gen(function* () {
      const repository = yield* FixtureRepository;

      return {
        selection: repository.selectedItemIds.pipe(
          unavailable('load selection'),
          Effect.flatMap((selectedIds) => {
            const items: Array<SelectionItem> = [];
            for (const [itemId, { groupLabel, item }] of itemById) {
              if (selectedIds.has(itemId)) {
                items.push({
                  groupLabel,
                  id: item.id,
                  slot: item.slot,
                  title: item.title,
                });
              }
            }
            return query({ latency: '130 millis', value: items });
          }),
        ),
        fixture: query({ latency: '80 millis', value: fixture }),
        catalog: Effect.fn('FixtureService.catalog')(function* (group: FixtureGroup) {
          const selectedIds = yield* repository.selectedItemIds.pipe(unavailable('load catalog'));
          const definition = catalogs[group];
          const value: Catalog = {
            ...definition,
            items: definition.items.map((item) => ({
              ...item,
              isSelected: selectedIds.has(item.id),
            })),
          };

          return yield* query({ latency: '2 seconds', value });
        }),
        detail: Effect.fn('FixtureService.detail')(function* (detailId: string) {
          const definition = details.get(detailId);
          if (definition === undefined) {
            return yield* Effect.die(new Error(`Unknown fixture detail "${detailId}".`));
          }

          return yield* query({
            latency: definition.latency,
            value: definition.detail,
          });
        }),
        toggleSelection: Effect.fn('FixtureService.toggleSelection')(function* (itemId: string) {
          if (!itemById.has(itemId)) {
            return null;
          }

          return yield* repository.toggleSelection(itemId).pipe(unavailable('update selection'));
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
