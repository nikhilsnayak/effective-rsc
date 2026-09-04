import { Context, Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import {
  ManagedEvent,
  ManagedEventStatus,
  ManagedOrganization,
  OrganizationRole,
  OrganizerUser,
} from '@/modules/organizer/model';

const OrganizerUsers = Schema.Array(OrganizerUser);
const ManagedOrganizations = Schema.Array(ManagedOrganization);
const ManagedEvents = Schema.Array(ManagedEvent);
const ManagedEventAccess = Schema.Struct({
  ...ManagedEvent.fields,
  role: OrganizationRole,
});

export type OrganizerRepositoryDashboard = {
  readonly events: ReadonlyArray<ManagedEvent>;
  readonly organizations: ReadonlyArray<ManagedOrganization>;
  readonly user: OrganizerUser;
};

export type ManagedEventAccess = typeof ManagedEventAccess.Type;

export class OrganizerRepository extends Context.Service<OrganizerRepository>()(
  '@effective-rsc/example-event-platform/organizer/OrganizerRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      return {
        compareAndSetEventStatus: Effect.fn('OrganizerRepository.compareAndSetEventStatus')(
          function* (
            userId: string,
            eventId: string,
            expectedStatus: ManagedEventStatus,
            targetStatus: ManagedEventStatus,
            updatedAt: string,
          ) {
            const rows = yield* sql<{ readonly eventId: string }>`
              UPDATE events
              SET status = ${targetStatus}, updated_at = ${updatedAt}
              WHERE id = ${eventId}
                AND status = ${expectedStatus}
                AND EXISTS (
                  SELECT 1
                  FROM organization_memberships
                  WHERE organization_memberships.organization_id = events.organization_id
                    AND organization_memberships.user_id = ${userId}
                    AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
                )
              RETURNING id AS eventId
            `;

            return rows.length === 1;
          },
        ),
        findEventAccess: Effect.fn('OrganizerRepository.findEventAccess')(function* (
          userId: string,
          eventId: string,
        ) {
          const rows = yield* sql<ManagedEventAccess>`
            SELECT
              events.id AS eventId,
              events.organization_id AS organizationId,
              events.slug AS eventSlug,
              events.name,
              events.status,
              events.starts_at AS startsAt,
              events.ends_at AS endsAt,
              events.updated_at AS updatedAt,
              organization_memberships.role
            FROM events
            INNER JOIN organization_memberships
              ON organization_memberships.organization_id = events.organization_id
            WHERE events.id = ${eventId}
              AND organization_memberships.user_id = ${userId}
            LIMIT 1
          `;
          const decoded = yield* Schema.decodeEffect(Schema.Array(ManagedEventAccess))(rows);

          return decoded[0] ?? null;
        }),
        loadDashboard: Effect.fn('OrganizerRepository.loadDashboard')(function* (userId: string) {
          const [userRows, organizationRows, eventRows] = yield* Effect.all(
            [
              sql<OrganizerUser>`
                SELECT id AS userId, email, name
                FROM users
                WHERE id = ${userId}
                LIMIT 1
              `,
              sql<ManagedOrganization>`
                SELECT
                  organizations.id AS organizationId,
                  organizations.slug AS organizationSlug,
                  organizations.name,
                  organization_memberships.role
                FROM organization_memberships
                INNER JOIN organizations
                  ON organizations.id = organization_memberships.organization_id
                WHERE organization_memberships.user_id = ${userId}
                ORDER BY organizations.name
              `,
              sql<ManagedEvent>`
                SELECT
                  events.id AS eventId,
                  events.organization_id AS organizationId,
                  events.slug AS eventSlug,
                  events.name,
                  events.status,
                  events.starts_at AS startsAt,
                  events.ends_at AS endsAt,
                  events.updated_at AS updatedAt
                FROM events
                INNER JOIN organization_memberships
                  ON organization_memberships.organization_id = events.organization_id
                WHERE organization_memberships.user_id = ${userId}
                ORDER BY events.starts_at DESC
              `,
            ],
            { concurrency: 'unbounded' },
          );
          const [users, organizations, events] = yield* Effect.all([
            Schema.decodeEffect(OrganizerUsers)(userRows),
            Schema.decodeEffect(ManagedOrganizations)(organizationRows),
            Schema.decodeEffect(ManagedEvents)(eventRows),
          ]);
          const user = users[0];

          return user === undefined ? null : { events, organizations, user };
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
  static readonly layerTest = Layer.mock(this);
}
