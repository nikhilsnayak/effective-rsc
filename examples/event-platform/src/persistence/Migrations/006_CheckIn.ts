import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    INSERT INTO organization_memberships (organization_id, user_id, role, created_at)
    VALUES ('org-runtime-collective', 'user-nikhil', 'check_in_staff', '2026-09-02T09:00:00Z')
  `;

  yield* sql`
    CREATE TABLE check_in_events (
      id TEXT PRIMARY KEY NOT NULL,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
      staff_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      action TEXT NOT NULL CHECK (action IN ('check_in', 'undo')),
      recorded_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX check_in_events_event_recorded_idx
    ON check_in_events (event_id, recorded_at)
  `;

  yield* sql`
    CREATE INDEX check_in_events_ticket_recorded_idx
    ON check_in_events (ticket_id, recorded_at)
  `;
});
