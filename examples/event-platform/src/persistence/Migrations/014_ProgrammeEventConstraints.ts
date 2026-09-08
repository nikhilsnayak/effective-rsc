import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    CREATE TRIGGER events_programme_before_update
    BEFORE UPDATE OF capacity, starts_at, ends_at ON events
    WHEN EXISTS (
      SELECT 1 FROM programme_sessions
      WHERE event_id = NEW.id
        AND (
          capacity > NEW.capacity
          OR julianday(starts_at) < julianday(NEW.starts_at)
          OR julianday(ends_at) > julianday(NEW.ends_at)
        )
    )
    BEGIN
      SELECT RAISE(ABORT, 'event would invalidate programme');
    END
  `;

  // Check both edit directions so a session saved after an event edit cannot use stale bounds.
  yield* sql`
    CREATE TRIGGER programme_event_before_insert
    BEFORE INSERT ON programme_sessions
    WHEN EXISTS (
      SELECT 1 FROM events
      WHERE id = NEW.event_id
        AND (
          NEW.capacity > capacity
          OR julianday(NEW.starts_at) < julianday(starts_at)
          OR julianday(NEW.ends_at) > julianday(ends_at)
        )
    )
    BEGIN
      SELECT RAISE(ABORT, 'session exceeds event dates or capacity');
    END
  `;
  yield* sql`
    CREATE TRIGGER programme_event_before_update
    BEFORE UPDATE OF event_id, capacity, starts_at, ends_at ON programme_sessions
    WHEN EXISTS (
      SELECT 1 FROM events
      WHERE id = NEW.event_id
        AND (
          NEW.capacity > capacity
          OR julianday(NEW.starts_at) < julianday(starts_at)
          OR julianday(NEW.ends_at) > julianday(ends_at)
        )
    )
    BEGIN
      SELECT RAISE(ABORT, 'session exceeds event dates or capacity');
    END
  `;
});
