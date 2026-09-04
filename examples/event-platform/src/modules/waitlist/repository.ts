import { Context, Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import type { OutboundEmail } from '@/modules/attendee/email-gateway';
import { type JoinWaitlistInput, WaitlistEntry, WaitlistEvent } from '@/modules/waitlist/model';

const WaitlistEntries = Schema.Array(WaitlistEntry);
const WaitlistEvents = Schema.Array(WaitlistEvent);

export type JoinWaitlistResult =
  | { readonly _tag: 'Existing'; readonly entry: WaitlistEntry }
  | { readonly _tag: 'Joined'; readonly entry: WaitlistEntry }
  | { readonly _tag: 'TicketAvailable' }
  | { readonly _tag: 'TicketUnavailable' };

export type NotifyWaitlistResult = {
  readonly entry: WaitlistEntry;
  readonly message: OutboundEmail;
};

const entryById = (sql: SqlClient, entryId: string) =>
  sql<WaitlistEntry>`
    SELECT
      waitlist_entries.id AS entryId,
      waitlist_entries.event_id AS eventId,
      waitlist_entries.ticket_type_id AS ticketTypeId,
      ticket_types.name AS ticketTypeName,
      waitlist_entries.attendee_name AS attendeeName,
      waitlist_entries.attendee_email AS attendeeEmail,
      waitlist_entries.status,
      waitlist_entries.created_at AS createdAt,
      waitlist_entries.notified_at AS notifiedAt
    FROM waitlist_entries
    INNER JOIN ticket_types ON ticket_types.id = waitlist_entries.ticket_type_id
    WHERE waitlist_entries.id = ${entryId}
    LIMIT 1
  `.pipe(
    Effect.flatMap(Schema.decodeEffect(WaitlistEntries)),
    Effect.map((entries) => entries[0] ?? null),
  );

export class WaitlistRepository extends Context.Service<WaitlistRepository>()(
  '@effective-rsc/example-event-platform/waitlist/WaitlistRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      return {
        notify: Effect.fn('WaitlistRepository.notify')(function* (
          userId: string,
          eventId: string,
          entryId: string,
          notifiedAt: string,
        ) {
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const notified = yield* sql<{ readonly attendeeEmail: string }>`
                UPDATE waitlist_entries
                SET status = 'notified', notified_at = ${notifiedAt}, updated_at = ${notifiedAt}
                WHERE id = ${entryId}
                  AND event_id = ${eventId}
                  AND status = 'waiting'
                  AND EXISTS (
                    SELECT 1
                    FROM events
                    INNER JOIN organization_memberships
                      ON organization_memberships.organization_id = events.organization_id
                    WHERE events.id = waitlist_entries.event_id
                      AND organization_memberships.user_id = ${userId}
                      AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
                  )
                RETURNING attendee_email AS attendeeEmail
              `;
              if (notified.length === 0) {
                return null;
              }

              const entry = yield* entryById(sql, entryId);
              if (entry === null) {
                return yield* Effect.die(
                  new TypeError(`Notified waitlist entry "${entryId}" could not be reloaded.`),
                );
              }

              const emailId = `email-waitlist-${entryId}`;
              const subject = `Waitlist update for ${entry.ticketTypeName}`;
              const body = `You are next on the waitlist for ${entry.ticketTypeName}. This update does not reserve a place; the organizer will follow up with a registration link if capacity is released.`;
              yield* sql`
                INSERT INTO email_outbox (
                  id, recipient, subject, body, aggregate_type, aggregate_id, status, created_at
                )
                VALUES (
                  ${emailId},
                  ${entry.attendeeEmail},
                  ${subject},
                  ${body},
                  'waitlist',
                  ${entryId},
                  'pending',
                  ${notifiedAt}
                )
              `;

              return {
                entry,
                message: { body, emailId, recipient: entry.attendeeEmail, subject },
              } satisfies NotifyWaitlistResult;
            }),
          );
        }),
        join: Effect.fn('WaitlistRepository.join')(function* (
          input: JoinWaitlistInput,
          entryId: string,
          joinedAt: string,
        ) {
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const tickets = yield* sql<{ readonly available: number }>`
                SELECT
                  ticket_types.quantity_total
                    - ticket_types.quantity_reserved
                    - ticket_types.quantity_sold AS available
                FROM ticket_types
                INNER JOIN events ON events.id = ticket_types.event_id
                WHERE ticket_types.id = ${input.ticketTypeId}
                  AND ticket_types.event_id = ${input.eventId}
                  AND ticket_types.status = 'active'
                  AND events.status = 'published'
                  AND datetime(ticket_types.sales_starts_at) <= datetime(${joinedAt})
                  AND datetime(ticket_types.sales_ends_at) >= datetime(${joinedAt})
                LIMIT 1
              `;
              const ticket = tickets[0];
              if (ticket === undefined) {
                return { _tag: 'TicketUnavailable' } as const;
              }
              if (ticket.available > 0) {
                return { _tag: 'TicketAvailable' } as const;
              }

              const existing = yield* sql<{ readonly entryId: string }>`
                SELECT id AS entryId
                FROM waitlist_entries
                WHERE event_id = ${input.eventId}
                  AND ticket_type_id = ${input.ticketTypeId}
                  AND attendee_email = ${input.attendeeEmail}
                LIMIT 1
              `;
              if (existing[0] !== undefined) {
                const entry = yield* entryById(sql, existing[0].entryId);
                if (entry === null) {
                  return yield* Effect.die(
                    new TypeError(`Waitlist entry "${existing[0].entryId}" could not be reloaded.`),
                  );
                }
                return { entry, _tag: 'Existing' } as const;
              }

              yield* sql`
                INSERT INTO waitlist_entries (
                  id,
                  event_id,
                  ticket_type_id,
                  attendee_name,
                  attendee_email,
                  status,
                  created_at,
                  updated_at
                )
                VALUES (
                  ${entryId},
                  ${input.eventId},
                  ${input.ticketTypeId},
                  ${input.attendeeName},
                  ${input.attendeeEmail},
                  'waiting',
                  ${joinedAt},
                  ${joinedAt}
                )
              `;
              const entry = yield* entryById(sql, entryId);
              if (entry === null) {
                return yield* Effect.die(
                  new TypeError(`Created waitlist entry "${entryId}" could not be reloaded.`),
                );
              }
              return { entry, _tag: 'Joined' } as const;
            }),
          );
        }),
        listEntries: Effect.fn('WaitlistRepository.listEntries')(function* (
          userId: string,
          eventId: string,
        ) {
          const rows = yield* sql<WaitlistEntry>`
            SELECT
              waitlist_entries.id AS entryId,
              waitlist_entries.event_id AS eventId,
              waitlist_entries.ticket_type_id AS ticketTypeId,
              ticket_types.name AS ticketTypeName,
              waitlist_entries.attendee_name AS attendeeName,
              waitlist_entries.attendee_email AS attendeeEmail,
              waitlist_entries.status,
              waitlist_entries.created_at AS createdAt,
              waitlist_entries.notified_at AS notifiedAt
            FROM waitlist_entries
            INNER JOIN ticket_types ON ticket_types.id = waitlist_entries.ticket_type_id
            INNER JOIN events ON events.id = waitlist_entries.event_id
            WHERE waitlist_entries.event_id = ${eventId}
              AND EXISTS (
                SELECT 1
                FROM organization_memberships
                WHERE organization_memberships.organization_id = events.organization_id
                  AND organization_memberships.user_id = ${userId}
                  AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
              )
            ORDER BY waitlist_entries.created_at ASC
          `;
          return yield* Schema.decodeEffect(WaitlistEntries)(rows);
        }),
        loadEvent: Effect.fn('WaitlistRepository.loadEvent')(function* (
          userId: string,
          eventId: string,
        ) {
          const rows = yield* sql<WaitlistEvent>`
            SELECT
              events.id AS eventId,
              events.name AS eventName,
              events.status,
              organizations.name AS organizationName,
              organization_memberships.role
            FROM events
            INNER JOIN organizations ON organizations.id = events.organization_id
            INNER JOIN organization_memberships
              ON organization_memberships.organization_id = events.organization_id
            WHERE events.id = ${eventId}
              AND organization_memberships.user_id = ${userId}
              AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
            LIMIT 1
          `;
          const events = yield* Schema.decodeEffect(WaitlistEvents)(rows);
          return events[0] ?? null;
        }),
        markEmailSent: Effect.fn('WaitlistRepository.markEmailSent')(function* (
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
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
  static readonly layerTest = Layer.mock(this);
}
