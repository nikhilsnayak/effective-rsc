import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    CREATE TABLE order_events (
      id TEXT PRIMARY KEY NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
      actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      action TEXT NOT NULL CHECK (action IN ('refunded')),
      reason TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX order_events_order_recorded_idx
    ON order_events (order_id, recorded_at)
  `;
});
