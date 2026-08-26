import { Context, Effect, Layer } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export class ConferenceRepository extends Context.Service<ConferenceRepository>()(
  '@effective-rsc/example-kitchen-sink/conference/ConferenceRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      return {
        selectedSessionIds: Effect.map(
          sql<{ readonly session_id: string }>`
            SELECT session_id
            FROM conference_agenda
            ORDER BY session_id
          `,
          (rows): ReadonlySet<string> => new Set(rows.map((row) => row.session_id)),
        ),
        toggleAgenda: Effect.fn('ConferenceRepository.toggleAgenda')(function* (sessionId: string) {
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* sql<{ readonly session_id: string }>`
                SELECT session_id
                FROM conference_agenda
                WHERE session_id = ${sessionId}
              `;
              const selected = rows.length === 0;

              if (selected) {
                yield* sql`
                  INSERT INTO conference_agenda (session_id)
                  VALUES (${sessionId})
                `;
              } else {
                yield* sql`
                  DELETE FROM conference_agenda
                  WHERE session_id = ${sessionId}
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
