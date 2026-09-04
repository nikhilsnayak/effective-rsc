import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    CREATE TABLE ticket_types (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
      currency TEXT NOT NULL,
      quantity_total INTEGER NOT NULL CHECK (quantity_total > 0),
      quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
      quantity_sold INTEGER NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
      sales_starts_at TEXT NOT NULL,
      sales_ends_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'hidden')),
      CHECK (quantity_reserved + quantity_sold <= quantity_total),
      CHECK (sales_starts_at < sales_ends_at)
    )
  `;

  yield* sql`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
      idempotency_key TEXT NOT NULL,
      buyer_name TEXT NOT NULL,
      buyer_email TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
      total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
      currency TEXT NOT NULL,
      provider_reference TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (event_id, idempotency_key)
    )
  `;

  yield* sql`
    CREATE TABLE order_items (
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      ticket_type_id TEXT NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
      PRIMARY KEY (order_id, ticket_type_id)
    )
  `;

  yield* sql`
    CREATE TABLE tickets (
      id TEXT PRIMARY KEY NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
      ticket_type_id TEXT NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
      holder_name TEXT NOT NULL,
      holder_email TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('valid', 'cancelled', 'checked_in')),
      created_at TEXT NOT NULL,
      UNIQUE (order_id, ticket_type_id)
    )
  `;

  yield* sql`
    CREATE INDEX orders_event_email_idx
    ON orders (event_id, buyer_email)
  `;

  yield* sql`
    CREATE INDEX tickets_event_status_idx
    ON tickets (event_id, status)
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
      sales_starts_at,
      sales_ends_at,
      status
    )
    VALUES
      (
        'ticket-summit-general',
        'event-effect-systems-summit-2026',
        'General admission',
        'Full-day admission, lunch, and the evening community reception.',
        14900,
        'EUR',
        180,
        '2026-08-01T00:00:00Z',
        '2026-11-11T22:59:59Z',
        'active'
      ),
      (
        'ticket-summit-community',
        'event-effect-systems-summit-2026',
        'Community',
        'A limited allocation for independent maintainers and students.',
        5900,
        'EUR',
        60,
        '2026-08-01T00:00:00Z',
        '2026-11-11T22:59:59Z',
        'active'
      )
  `;
});
