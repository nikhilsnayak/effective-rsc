import { DateTime, Effect, Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

class TicketSaleTimeInvalid extends Schema.TaggedError<TicketSaleTimeInvalid>()(
  '@effective-rsc/example-event-platform/persistence/TicketSaleTimeInvalid',
  { value: Schema.String, timezone: Schema.String },
) {}

// Earlier ticket authoring stored datetime-local form values without converting them to UTC.
const saleInstant = Effect.fnUntraced(function* (value: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  const instant = yield* Effect.fromOption(
    DateTime.makeZoned(value, {
      timeZone: timezone,
      adjustForTimeZone: true,
      disambiguation: 'reject',
    }),
    () => new TicketSaleTimeInvalid({ value, timezone }),
  );
  return DateTime.formatIso(instant);
});

export default Effect.gen(function* () {
  const sql = yield* SqlClient;
  const tickets = yield* sql<{
    readonly id: string;
    readonly timezone: string;
    readonly salesStartsAt: string;
    readonly salesEndsAt: string;
  }>`
    SELECT ticket_types.id, events.timezone,
      sales_starts_at AS salesStartsAt, sales_ends_at AS salesEndsAt
    FROM ticket_types
    INNER JOIN events ON events.id = ticket_types.event_id
    WHERE length(sales_starts_at) = 16 OR length(sales_ends_at) = 16
  `;
  for (const ticket of tickets) {
    const startsAt = yield* saleInstant(ticket.salesStartsAt, ticket.timezone);
    const endsAt = yield* saleInstant(ticket.salesEndsAt, ticket.timezone);
    yield* sql`
      UPDATE ticket_types SET sales_starts_at = ${startsAt}, sales_ends_at = ${endsAt}
      WHERE id = ${ticket.id}
    `;
  }
});
