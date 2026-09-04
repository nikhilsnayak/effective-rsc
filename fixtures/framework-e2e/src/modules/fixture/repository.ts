import { Context, Effect, Layer } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export class FixtureRepository extends Context.Service<FixtureRepository>()(
  '@effective-rsc/framework-e2e/fixture/FixtureRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      return {
        selectedItemIds: Effect.map(
          sql<{ readonly item_id: string }>`
            SELECT item_id
            FROM fixture_selection
            ORDER BY item_id
          `,
          (rows): ReadonlySet<string> => new Set(rows.map((row) => row.item_id)),
        ),
        toggleSelection: Effect.fn('FixtureRepository.toggleSelection')(function* (itemId: string) {
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* sql<{ readonly item_id: string }>`
                SELECT item_id
                FROM fixture_selection
                WHERE item_id = ${itemId}
              `;
              const selected = rows.length === 0;

              if (selected) {
                yield* sql`
                  INSERT INTO fixture_selection (item_id)
                  VALUES (${itemId})
                `;
              } else {
                yield* sql`
                  DELETE FROM fixture_selection
                  WHERE item_id = ${itemId}
                `;
              }

              return { selected };
            }),
          );
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
  static readonly layerTest = Layer.mock(this);
}
