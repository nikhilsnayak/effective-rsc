import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    ALTER TABLE tickets
    ADD COLUMN updated_at TEXT
  `;

  yield* sql`
    UPDATE tickets
    SET updated_at = created_at
    WHERE updated_at IS NULL
  `;

  yield* sql`
    CREATE TABLE attendee_sessions (
      token TEXT PRIMARY KEY NOT NULL,
      attendee_email TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE email_outbox (
      id TEXT PRIMARY KEY NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'sent')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      created_at TEXT NOT NULL,
      sent_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX attendee_sessions_email_idx
    ON attendee_sessions (attendee_email)
  `;

  yield* sql`
    CREATE INDEX email_outbox_recipient_status_idx
    ON email_outbox (recipient, status, created_at)
  `;

  yield* sql`
    INSERT INTO orders (
      id,
      event_id,
      idempotency_key,
      buyer_name,
      buyer_email,
      status,
      total_minor,
      currency,
      provider_reference,
      created_at,
      updated_at
    )
    VALUES (
      'order-demo-ada',
      'event-effect-systems-summit-2026',
      'demo-ada-seed',
      'Ada Lovelace',
      'ada@example.test',
      'paid',
      5900,
      'EUR',
      'local-payment-demo-ada',
      '2026-09-01T10:00:00Z',
      '2026-09-01T10:00:01Z'
    )
  `;

  yield* sql`
    INSERT INTO order_items (order_id, ticket_type_id, quantity, unit_price_minor)
    VALUES ('order-demo-ada', 'ticket-summit-community', 1, 5900)
  `;

  yield* sql`
    INSERT INTO tickets (
      id,
      order_id,
      event_id,
      ticket_type_id,
      holder_name,
      holder_email,
      code,
      status,
      created_at,
      updated_at
    )
    VALUES (
      'ticket-demo-ada',
      'order-demo-ada',
      'event-effect-systems-summit-2026',
      'ticket-summit-community',
      'Ada Lovelace',
      'ada@example.test',
      'GTH-DEMOADA0001',
      'valid',
      '2026-09-01T10:00:01Z',
      '2026-09-01T10:00:01Z'
    )
  `;

  yield* sql`
    UPDATE ticket_types
    SET quantity_sold = quantity_sold + 1
    WHERE id = 'ticket-summit-community'
  `;

  yield* sql`
    INSERT INTO attendee_sessions (token, attendee_email, expires_at, created_at)
    VALUES (
      'demo-attendee-ada',
      'ada@example.test',
      '2027-01-01T00:00:00Z',
      '2026-09-01T10:00:02Z'
    )
  `;

  yield* sql`
    INSERT INTO email_outbox (
      id,
      recipient,
      subject,
      body,
      aggregate_type,
      aggregate_id,
      status,
      attempts,
      created_at,
      sent_at
    )
    VALUES (
      'email-ticket-demo-ada',
      'ada@example.test',
      'Your Effect Systems Summit ticket',
      'Your ticket code is GTH-DEMOADA0001.',
      'ticket',
      'ticket-demo-ada',
      'sent',
      1,
      '2026-09-01T10:00:01Z',
      '2026-09-01T10:00:02Z'
    )
  `;
});
