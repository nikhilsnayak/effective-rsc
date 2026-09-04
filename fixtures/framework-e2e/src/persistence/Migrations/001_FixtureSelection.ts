import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    CREATE TABLE fixture_selection (
      item_id TEXT PRIMARY KEY NOT NULL
    )
  `;

  yield* sql`
    INSERT INTO fixture_selection (item_id)
    VALUES
      ('document-stream'),
      ('server-function-mutation')
  `;
});
