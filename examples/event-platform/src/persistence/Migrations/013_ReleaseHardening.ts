import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`ALTER TABLE orders ADD COLUMN checkout_fingerprint TEXT`;
  yield* sql`ALTER TABLE orders ADD COLUMN attendee_session_token TEXT`;
  yield* sql`
    CREATE UNIQUE INDEX orders_attendee_session_token_idx
    ON orders (attendee_session_token)
    WHERE attendee_session_token IS NOT NULL
  `;
  yield* sql`
    UPDATE orders
    SET attendee_session_token = 'demo-attendee-ada'
    WHERE id = 'order-demo-ada'
  `;
  yield* sql`
    UPDATE ticket_types
    SET sales_ends_at = '9999-12-31T23:59:59Z'
    WHERE id IN (
      'ticket-summit-general',
      'ticket-summit-community',
      'ticket-summit-lab'
    )
  `;
  yield* sql`
    UPDATE discount_codes
    SET ends_at = '9999-12-31T23:59:59Z'
    WHERE id = 'discount-summit-community-20'
  `;
  yield* sql`
    UPDATE attendee_sessions
    SET expires_at = '9999-12-31T23:59:59Z'
    WHERE token = 'demo-attendee-ada'
  `;

  yield* sql`
    CREATE TRIGGER ticket_types_capacity_before_insert
    BEFORE INSERT ON ticket_types
    WHEN (
      SELECT COALESCE(SUM(quantity_total), 0)
      FROM ticket_types
      WHERE event_id = NEW.event_id
    ) + NEW.quantity_total > (
      SELECT capacity FROM events WHERE id = NEW.event_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'ticket allocation exceeds event capacity');
    END
  `;
  yield* sql`
    CREATE TRIGGER ticket_types_capacity_before_update
    BEFORE UPDATE OF event_id, quantity_total ON ticket_types
    WHEN (
      SELECT COALESCE(SUM(quantity_total), 0)
      FROM ticket_types
      WHERE event_id = NEW.event_id AND id <> OLD.id
    ) + NEW.quantity_total > (
      SELECT capacity FROM events WHERE id = NEW.event_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'ticket allocation exceeds event capacity');
    END
  `;
  yield* sql`
    CREATE TRIGGER events_capacity_before_update
    BEFORE UPDATE OF capacity ON events
    WHEN NEW.capacity < (
      SELECT COALESCE(SUM(quantity_total), 0)
      FROM ticket_types
      WHERE event_id = NEW.id
    )
    BEGIN
      SELECT RAISE(ABORT, 'event capacity is below its ticket allocation');
    END
  `;

  yield* sql`
    CREATE TRIGGER programme_room_conflict_before_insert
    BEFORE INSERT ON programme_sessions
    WHEN NEW.status <> 'cancelled' AND EXISTS (
      SELECT 1
      FROM programme_sessions
      WHERE event_id = NEW.event_id
        AND room_id = NEW.room_id
        AND status <> 'cancelled'
        AND starts_at < NEW.ends_at
        AND ends_at > NEW.starts_at
    )
    BEGIN
      SELECT RAISE(ABORT, 'programme room conflict');
    END
  `;
  yield* sql`
    CREATE TRIGGER programme_room_conflict_before_update
    BEFORE UPDATE OF event_id, room_id, starts_at, ends_at, status ON programme_sessions
    WHEN NEW.status <> 'cancelled' AND EXISTS (
      SELECT 1
      FROM programme_sessions
      WHERE event_id = NEW.event_id
        AND room_id = NEW.room_id
        AND id <> OLD.id
        AND status <> 'cancelled'
        AND starts_at < NEW.ends_at
        AND ends_at > NEW.starts_at
    )
    BEGIN
      SELECT RAISE(ABORT, 'programme room conflict');
    END
  `;
  yield* sql`
    CREATE TRIGGER programme_speaker_conflict_before_insert
    BEFORE INSERT ON programme_session_speakers
    WHEN EXISTS (
      SELECT 1
      FROM programme_sessions AS candidate
      INNER JOIN programme_sessions AS scheduled
        ON scheduled.event_id = candidate.event_id
       AND scheduled.status <> 'cancelled'
       AND scheduled.starts_at < candidate.ends_at
       AND scheduled.ends_at > candidate.starts_at
      INNER JOIN programme_session_speakers AS assigned
        ON assigned.session_id = scheduled.id
      WHERE candidate.id = NEW.session_id
        AND candidate.status <> 'cancelled'
        AND scheduled.id <> candidate.id
        AND assigned.speaker_id = NEW.speaker_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'programme speaker conflict');
    END
  `;
  yield* sql`
    CREATE TRIGGER programme_speaker_conflict_before_session_update
    BEFORE UPDATE OF event_id, starts_at, ends_at, status ON programme_sessions
    WHEN NEW.status <> 'cancelled' AND EXISTS (
      SELECT 1
      FROM programme_session_speakers AS candidate_assignment
      INNER JOIN programme_session_speakers AS scheduled_assignment
        ON scheduled_assignment.speaker_id = candidate_assignment.speaker_id
       AND scheduled_assignment.session_id <> NEW.id
      INNER JOIN programme_sessions AS scheduled
        ON scheduled.id = scheduled_assignment.session_id
      WHERE candidate_assignment.session_id = NEW.id
        AND scheduled.event_id = NEW.event_id
        AND scheduled.status <> 'cancelled'
        AND scheduled.starts_at < NEW.ends_at
        AND scheduled.ends_at > NEW.starts_at
    )
    BEGIN
      SELECT RAISE(ABORT, 'programme speaker conflict');
    END
  `;

  yield* sql`
    CREATE TABLE ticket_inventory_holds (
      id TEXT PRIMARY KEY NOT NULL,
      ticket_type_id TEXT NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      reason TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'released')),
      created_at TEXT NOT NULL,
      released_at TEXT
    )
  `;
  yield* sql`
    INSERT INTO ticket_inventory_holds (
      id,
      ticket_type_id,
      quantity,
      reason,
      status,
      created_at
    )
    VALUES (
      'hold-summit-architecture-lab',
      'ticket-summit-lab',
      24,
      'Speaker and partner allocation; cancellations are offered to the public waitlist.',
      'active',
      '2026-09-01T11:00:00Z'
    )
  `;
});
