import { Context, Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import { CheckInAuditEntry, CheckInEvent, CheckInTicket } from '@/modules/check-in/model';

export type CredentialTransition = {
  readonly action: 'check_in' | 'undo';
  readonly eventId: string;
  readonly expectedStatus: 'checked_in' | 'valid';
  readonly recordedAt: string;
  readonly staffUserId: string;
  readonly targetStatus: 'checked_in' | 'valid';
  readonly ticketId: string;
};

export class CheckInRepository extends Context.Service<CheckInRepository>()(
  '@effective-rsc/example-event-platform/check-in/CheckInRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      return {
        findCredential: Effect.fn('CheckInRepository.findCredential')(function* (
          staffUserId: string,
          eventId: string,
          ticketCode: string,
        ) {
          const rows = yield* sql<CheckInTicket>`
            SELECT
              tickets.id AS ticketId,
              tickets.code,
              tickets.status,
              tickets.holder_name AS holderName,
              tickets.holder_email AS holderEmail,
              tickets.event_id AS eventId,
              ticket_types.name AS ticketTypeName,
              events.name AS eventName
            FROM tickets
            INNER JOIN ticket_types ON ticket_types.id = tickets.ticket_type_id
            INNER JOIN events ON events.id = tickets.event_id
            WHERE tickets.event_id = ${eventId}
              AND tickets.code = ${ticketCode}
              AND EXISTS (
                SELECT 1
                FROM organization_memberships
                WHERE organization_memberships.organization_id = events.organization_id
                  AND organization_memberships.user_id = ${staffUserId}
                  AND organization_memberships.role IN ('owner', 'admin', 'event_manager', 'check_in_staff')
              )
            LIMIT 1
          `;
          const tickets = yield* Schema.decodeEffect(Schema.Array(CheckInTicket))(rows);

          return tickets[0] ?? null;
        }),
        loadAudit: Effect.fn('CheckInRepository.loadAudit')(function* (
          staffUserId: string,
          eventId: string,
        ) {
          const rows = yield* sql<CheckInAuditEntry>`
            SELECT
              check_in_events.action,
              check_in_events.recorded_at AS recordedAt,
              tickets.code AS ticketCode,
              tickets.holder_name AS holderName,
              users.name AS staffName
            FROM check_in_events
            INNER JOIN tickets ON tickets.id = check_in_events.ticket_id
            INNER JOIN users ON users.id = check_in_events.staff_user_id
            INNER JOIN events ON events.id = check_in_events.event_id
            WHERE check_in_events.event_id = ${eventId}
              AND EXISTS (
                SELECT 1
                FROM organization_memberships
                WHERE organization_memberships.organization_id = events.organization_id
                  AND organization_memberships.user_id = ${staffUserId}
                  AND organization_memberships.role IN ('owner', 'admin', 'event_manager', 'check_in_staff')
              )
            ORDER BY check_in_events.recorded_at DESC
            LIMIT 20
          `;

          return yield* Schema.decodeEffect(Schema.Array(CheckInAuditEntry))(rows);
        }),
        loadEvent: Effect.fn('CheckInRepository.loadEvent')(function* (
          staffUserId: string,
          eventId: string,
        ) {
          const rows = yield* sql<CheckInEvent>`
            SELECT
              events.id AS eventId,
              events.name AS eventName,
              organizations.name AS organizationName,
              organization_memberships.role,
              COUNT(tickets.id) AS issued,
              COUNT(CASE WHEN tickets.status = 'checked_in' THEN 1 END) AS checkedIn
            FROM events
            INNER JOIN organizations ON organizations.id = events.organization_id
            INNER JOIN organization_memberships
              ON organization_memberships.organization_id = events.organization_id
            LEFT JOIN tickets ON tickets.event_id = events.id
            WHERE events.id = ${eventId}
              AND organization_memberships.user_id = ${staffUserId}
              AND organization_memberships.role IN ('owner', 'admin', 'event_manager', 'check_in_staff')
            GROUP BY events.id, organizations.id, organization_memberships.role
            LIMIT 1
          `;
          const events = yield* Schema.decodeEffect(Schema.Array(CheckInEvent))(rows);

          return events[0] ?? null;
        }),
        transitionCredential: Effect.fn('CheckInRepository.transitionCredential')(function* (
          input: CredentialTransition,
        ) {
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* sql<{ readonly ticketId: string }>`
                UPDATE tickets
                SET status = ${input.targetStatus}, updated_at = ${input.recordedAt}
                WHERE id = ${input.ticketId}
                  AND event_id = ${input.eventId}
                  AND status = ${input.expectedStatus}
                  AND EXISTS (
                    SELECT 1
                    FROM events
                    INNER JOIN organization_memberships
                      ON organization_memberships.organization_id = events.organization_id
                    WHERE events.id = tickets.event_id
                      AND organization_memberships.user_id = ${input.staffUserId}
                      AND organization_memberships.role IN ('owner', 'admin', 'event_manager', 'check_in_staff')
                  )
                RETURNING id AS ticketId
              `;
              if (rows.length === 0) {
                return false;
              }

              yield* sql`
                INSERT INTO check_in_events (
                  id,
                  ticket_id,
                  event_id,
                  staff_user_id,
                  action,
                  recorded_at
                )
                VALUES (
                  ${`check-in-${input.ticketId}-${input.recordedAt}`},
                  ${input.ticketId},
                  ${input.eventId},
                  ${input.staffUserId},
                  ${input.action},
                  ${input.recordedAt}
                )
              `;
              return true;
            }),
          );
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
  static readonly layerTest = Layer.mock(this);
}
