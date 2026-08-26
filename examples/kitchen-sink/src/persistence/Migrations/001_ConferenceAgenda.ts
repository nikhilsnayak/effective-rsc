import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    CREATE TABLE conference_agenda (
      session_id TEXT PRIMARY KEY NOT NULL
    )
  `;

  yield* sql`
    INSERT INTO conference_agenda (session_id)
    VALUES
      ('server-components-from-first-principles'),
      ('mutation-protocols-that-compose')
  `;
});
