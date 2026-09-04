import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    CREATE TABLE announcements (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      audience TEXT NOT NULL CHECK (audience IN ('all_attendees', 'checked_in', 'not_checked_in')),
      status TEXT NOT NULL CHECK (status IN ('draft', 'sent')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX announcements_event_updated_idx
    ON announcements (event_id, updated_at)
  `;

  yield* sql`
    CREATE INDEX email_outbox_aggregate_idx
    ON email_outbox (aggregate_type, aggregate_id, status)
  `;
});
