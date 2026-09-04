import { Context, Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import type { OutboundEmail } from '@/modules/attendee/email-gateway';
import { AttendeeTicket, DeliveredEmail } from '@/modules/attendee/model';

const SessionRecord = Schema.Struct({ email: Schema.String });
const PendingEmail = Schema.Struct({
  body: Schema.String,
  emailId: Schema.String,
  recipient: Schema.String,
  subject: Schema.String,
});

const decodeTickets = Schema.decodeEffect(Schema.Array(AttendeeTicket));

export class AttendeeRepository extends Context.Service<AttendeeRepository>()(
  '@effective-rsc/example-event-platform/attendee/AttendeeRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      return {
        findTicket: Effect.fn('AttendeeRepository.findTicket')(function* (
          email: string,
          ticketCode: string,
        ) {
          const rows = yield* sql<AttendeeTicket>`
            SELECT
              tickets.id AS ticketId,
              tickets.code,
              tickets.status,
              tickets.holder_name AS holderName,
              tickets.holder_email AS holderEmail,
              tickets.event_id AS eventId,
              ticket_types.name AS ticketTypeName,
              events.name AS eventName,
              events.starts_at AS startsAt,
              events.ends_at AS endsAt,
              events.timezone,
              events.venue_name AS venueName,
              events.locality,
              organizations.name AS organizationName,
              orders.id AS orderId,
              orders.total_minor AS totalMinor,
              orders.currency,
              orders.provider_reference AS providerReference
            FROM tickets
            INNER JOIN ticket_types ON ticket_types.id = tickets.ticket_type_id
            INNER JOIN events ON events.id = tickets.event_id
            INNER JOIN organizations ON organizations.id = events.organization_id
            INNER JOIN orders ON orders.id = tickets.order_id
            WHERE tickets.holder_email = ${email}
              AND tickets.code = ${ticketCode}
              AND orders.status = 'paid'
            LIMIT 1
          `;
          const tickets = yield* decodeTickets(rows);

          return tickets[0] ?? null;
        }),
        listDeliveredEmail: Effect.fn('AttendeeRepository.listDeliveredEmail')(function* (
          email: string,
        ) {
          const rows = yield* sql<DeliveredEmail>`
            SELECT
              id AS emailId,
              recipient,
              subject,
              body,
              sent_at AS sentAt
            FROM email_outbox
            WHERE recipient = ${email}
              AND status = 'sent'
            ORDER BY sent_at DESC
          `;

          return yield* Schema.decodeEffect(Schema.Array(DeliveredEmail))(rows);
        }),
        listPendingEmail: Effect.fn('AttendeeRepository.listPendingEmail')(function* (
          email: string,
        ) {
          const rows = yield* sql<OutboundEmail>`
            SELECT id AS emailId, recipient, subject, body
            FROM email_outbox
            WHERE recipient = ${email}
              AND status = 'pending'
            ORDER BY created_at
          `;

          return yield* Schema.decodeEffect(Schema.Array(PendingEmail))(rows);
        }),
        listTickets: Effect.fn('AttendeeRepository.listTickets')(function* (email: string) {
          const rows = yield* sql<AttendeeTicket>`
            SELECT
              tickets.id AS ticketId,
              tickets.code,
              tickets.status,
              tickets.holder_name AS holderName,
              tickets.holder_email AS holderEmail,
              tickets.event_id AS eventId,
              ticket_types.name AS ticketTypeName,
              events.name AS eventName,
              events.starts_at AS startsAt,
              events.ends_at AS endsAt,
              events.timezone,
              events.venue_name AS venueName,
              events.locality,
              organizations.name AS organizationName,
              orders.id AS orderId,
              orders.total_minor AS totalMinor,
              orders.currency,
              orders.provider_reference AS providerReference
            FROM tickets
            INNER JOIN ticket_types ON ticket_types.id = tickets.ticket_type_id
            INNER JOIN events ON events.id = tickets.event_id
            INNER JOIN organizations ON organizations.id = events.organization_id
            INNER JOIN orders ON orders.id = tickets.order_id
            WHERE tickets.holder_email = ${email}
              AND orders.status = 'paid'
            ORDER BY events.starts_at DESC
          `;

          return yield* decodeTickets(rows);
        }),
        markEmailSent: Effect.fn('AttendeeRepository.markEmailSent')(function* (
          emailId: string,
          sentAt: string,
        ) {
          const rows = yield* sql<{ readonly emailId: string }>`
            UPDATE email_outbox
            SET status = 'sent', attempts = attempts + 1, sent_at = ${sentAt}
            WHERE id = ${emailId}
              AND status = 'pending'
            RETURNING id AS emailId
          `;

          return rows.length === 1;
        }),
        resolveSession: Effect.fn('AttendeeRepository.resolveSession')(function* (
          sessionToken: string,
          now: string,
        ) {
          const rows = yield* sql<{ readonly email: string }>`
            SELECT attendee_email AS email
            FROM attendee_sessions
            WHERE token = ${sessionToken}
              AND datetime(expires_at) > datetime(${now})
            LIMIT 1
          `;
          const sessions = yield* Schema.decodeEffect(Schema.Array(SessionRecord))(rows);

          return sessions[0]?.email ?? null;
        }),
        updateHolderName: Effect.fn('AttendeeRepository.updateHolderName')(function* (
          email: string,
          ticketId: string,
          holderName: string,
          updatedAt: string,
        ) {
          const rows = yield* sql<{ readonly ticketId: string }>`
            UPDATE tickets
            SET holder_name = ${holderName}, updated_at = ${updatedAt}
            WHERE id = ${ticketId}
              AND holder_email = ${email}
              AND status = 'valid'
            RETURNING id AS ticketId
          `;

          return rows.length === 1;
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
  static readonly layerTest = Layer.mock(this);
}
