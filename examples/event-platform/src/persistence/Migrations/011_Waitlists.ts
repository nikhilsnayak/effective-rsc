import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    CREATE TABLE waitlist_entries (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      ticket_type_id TEXT NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
      attendee_name TEXT NOT NULL,
      attendee_email TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('waiting', 'notified', 'cancelled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      notified_at TEXT,
      UNIQUE (event_id, ticket_type_id, attendee_email)
    )
  `;

  yield* sql`
    CREATE INDEX waitlist_entries_event_status_created_idx
    ON waitlist_entries (event_id, status, created_at)
  `;

  yield* sql`
    UPDATE ticket_types
    SET quantity_total = quantity_total - 24
    WHERE id = 'ticket-summit-general'
  `;

  yield* sql`
    INSERT INTO ticket_types (
      id,
      event_id,
      name,
      description,
      price_minor,
      currency,
      quantity_total,
      quantity_reserved,
      sales_starts_at,
      sales_ends_at,
      status
    )
    VALUES (
      'ticket-summit-lab',
      'event-effect-systems-summit-2026',
      'Architecture lab',
      'A small-group architecture lab with the speakers. Join the waitlist for cancellations.',
      8900,
      'EUR',
      24,
      24,
      '2026-08-01T00:00:00Z',
      '2026-11-11T22:59:59Z',
      'active'
    )
  `;
});
