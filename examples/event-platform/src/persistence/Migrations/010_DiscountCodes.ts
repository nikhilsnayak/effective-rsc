import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    CREATE TABLE discount_codes (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
      redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (event_id, code),
      CHECK (starts_at < ends_at),
      CHECK (discount_type != 'percent' OR amount <= 100)
    )
  `;

  yield* sql`ALTER TABLE orders ADD COLUMN subtotal_minor INTEGER NOT NULL DEFAULT 0`;
  yield* sql`ALTER TABLE orders ADD COLUMN discount_minor INTEGER NOT NULL DEFAULT 0`;
  yield* sql`ALTER TABLE orders ADD COLUMN discount_code_id TEXT`;

  yield* sql`
    UPDATE orders
    SET subtotal_minor = total_minor
  `;

  yield* sql`
    CREATE INDEX discount_codes_event_status_idx
    ON discount_codes (event_id, status)
  `;

  yield* sql`
    INSERT INTO discount_codes (
      id,
      event_id,
      code,
      discount_type,
      amount,
      max_redemptions,
      starts_at,
      ends_at,
      status,
      created_at,
      updated_at
    )
    VALUES (
      'discount-summit-community-20',
      'event-effect-systems-summit-2026',
      'COMMUNITY20',
      'percent',
      20,
      100,
      '2026-08-01T00:00:00Z',
      '2026-11-11T22:59:59Z',
      'active',
      '2026-08-01T00:00:00Z',
      '2026-08-01T00:00:00Z'
    )
  `;
});
