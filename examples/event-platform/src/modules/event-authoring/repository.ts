import { Context, Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import {
  AuthoringOrganization,
  type CreateEventInput,
  EditableEvent,
  type EventDetailsInput,
  type EventEditor,
  ManagedTicketType,
  type TicketTypeInput,
} from '@/modules/event-authoring/model';

export class EventAuthoringRepository extends Context.Service<EventAuthoringRepository>()(
  '@effective-rsc/example-event-platform/event-authoring/EventAuthoringRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      return {
        createEvent: Effect.fn('EventAuthoringRepository.createEvent')(function* (
          userId: string,
          input: CreateEventInput,
          createdAt: string,
        ) {
          const rows = yield* sql<{ readonly eventId: string }>`
            INSERT INTO events (
              id,
              organization_id,
              slug,
              name,
              tagline,
              description,
              status,
              format,
              timezone,
              venue_name,
              locality,
              country_code,
              starts_at,
              ends_at,
              capacity,
              created_at,
              updated_at
            )
            SELECT
              'event-' || lower(hex(randomblob(12))),
              ${input.organizationId},
              ${input.eventSlug},
              ${input.name},
              ${input.tagline},
              ${input.description},
              'draft',
              'in_person',
              ${input.timezone},
              ${input.venueName},
              ${input.locality},
              ${input.countryCode},
              ${input.startsAt},
              ${input.endsAt},
              ${input.capacity},
              ${createdAt},
              ${createdAt}
            WHERE EXISTS (
              SELECT 1
              FROM organization_memberships
              WHERE organization_id = ${input.organizationId}
                AND user_id = ${userId}
                AND role IN ('owner', 'admin', 'event_manager')
            )
            RETURNING id AS eventId
          `;

          return rows[0]?.eventId ?? null;
        }),
        createTicketType: Effect.fn('EventAuthoringRepository.createTicketType')(function* (
          userId: string,
          input: TicketTypeInput,
        ) {
          const rows = yield* sql<{ readonly ticketTypeId: string }>`
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
            SELECT
              'ticket-' || lower(hex(randomblob(12))),
              ${input.eventId},
              ${input.name},
              ${input.description},
              ${input.priceMinor},
              ${input.currency},
              ${input.quantityTotal},
              ${input.salesStartsAt},
              ${input.salesEndsAt},
              'active'
            FROM events
            WHERE events.id = ${input.eventId}
              AND EXISTS (
                SELECT 1
                FROM organization_memberships
                WHERE organization_id = events.organization_id
                  AND user_id = ${userId}
                  AND role IN ('owner', 'admin', 'event_manager')
              )
            RETURNING id AS ticketTypeId
          `;

          return rows[0]?.ticketTypeId ?? null;
        }),
        findOrganization: Effect.fn('EventAuthoringRepository.findOrganization')(function* (
          userId: string,
          organizationId: string,
        ) {
          const rows = yield* sql<AuthoringOrganization>`
            SELECT
              organizations.id AS organizationId,
              organizations.slug AS organizationSlug,
              organizations.name,
              organization_memberships.role
            FROM organizations
            INNER JOIN organization_memberships
              ON organization_memberships.organization_id = organizations.id
            WHERE organizations.id = ${organizationId}
              AND organization_memberships.user_id = ${userId}
              AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
            LIMIT 1
          `;
          const decoded = yield* Schema.decodeEffect(Schema.Array(AuthoringOrganization))(rows);

          return decoded[0] ?? null;
        }),
        isSlugAvailable: Effect.fn('EventAuthoringRepository.isSlugAvailable')(function* (
          organizationId: string,
          eventSlug: string,
          excludingEventId: string | null,
        ) {
          const rows = yield* sql<{ readonly occupied: number }>`
            SELECT EXISTS (
              SELECT 1
              FROM events
              WHERE organization_id = ${organizationId}
                AND slug = ${eventSlug}
                AND (${excludingEventId} IS NULL OR id <> ${excludingEventId})
            ) AS occupied
          `;

          return rows[0]?.occupied !== 1;
        }),
        loadEditor: Effect.fn('EventAuthoringRepository.loadEditor')(function* (
          userId: string,
          eventId: string,
        ) {
          const eventRows = yield* sql<EditableEvent>`
            SELECT
              events.id AS eventId,
              events.organization_id AS organizationId,
              organizations.name AS organizationName,
              organizations.slug AS organizationSlug,
              events.slug AS eventSlug,
              events.name,
              events.tagline,
              events.description,
              events.status,
              events.timezone,
              events.venue_name AS venueName,
              events.locality,
              events.country_code AS countryCode,
              events.starts_at AS startsAt,
              events.ends_at AS endsAt,
              events.capacity,
              events.updated_at AS updatedAt
            FROM events
            INNER JOIN organizations ON organizations.id = events.organization_id
            INNER JOIN organization_memberships
              ON organization_memberships.organization_id = events.organization_id
            WHERE events.id = ${eventId}
              AND organization_memberships.user_id = ${userId}
              AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
            LIMIT 1
          `;
          const events = yield* Schema.decodeEffect(Schema.Array(EditableEvent))(eventRows);
          const event = events[0];
          if (event === undefined) {
            return null;
          }

          const ticketRows = yield* sql<ManagedTicketType>`
            SELECT
              id AS ticketTypeId,
              name,
              description,
              price_minor AS priceMinor,
              currency,
              quantity_total AS quantityTotal,
              quantity_reserved AS quantityReserved,
              quantity_sold AS quantitySold,
              sales_starts_at AS salesStartsAt,
              sales_ends_at AS salesEndsAt,
              status
            FROM ticket_types
            WHERE event_id = ${eventId}
            ORDER BY price_minor, name
          `;
          const tickets = yield* Schema.decodeEffect(Schema.Array(ManagedTicketType))(ticketRows);

          return { event, tickets } satisfies EventEditor;
        }),
        setTicketTypeStatus: Effect.fn('EventAuthoringRepository.setTicketTypeStatus')(function* (
          userId: string,
          eventId: string,
          ticketTypeId: string,
          status: 'active' | 'hidden',
        ) {
          const rows = yield* sql<{ readonly ticketTypeId: string }>`
            UPDATE ticket_types
            SET status = ${status}
            WHERE id = ${ticketTypeId}
              AND event_id = ${eventId}
              AND EXISTS (
                SELECT 1
                FROM events
                INNER JOIN organization_memberships
                  ON organization_memberships.organization_id = events.organization_id
                WHERE events.id = ticket_types.event_id
                  AND organization_memberships.user_id = ${userId}
                  AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
              )
            RETURNING id AS ticketTypeId
          `;

          return rows.length === 1;
        }),
        updateEvent: Effect.fn('EventAuthoringRepository.updateEvent')(function* (
          userId: string,
          eventId: string,
          input: EventDetailsInput,
          expectedUpdatedAt: string,
          updatedAt: string,
        ) {
          const rows = yield* sql<{ readonly eventId: string }>`
            UPDATE events
            SET
              slug = ${input.eventSlug},
              name = ${input.name},
              tagline = ${input.tagline},
              description = ${input.description},
              timezone = ${input.timezone},
              venue_name = ${input.venueName},
              locality = ${input.locality},
              country_code = ${input.countryCode},
              starts_at = ${input.startsAt},
              ends_at = ${input.endsAt},
              capacity = ${input.capacity},
              updated_at = ${updatedAt}
            WHERE id = ${eventId}
              AND updated_at = ${expectedUpdatedAt}
              AND EXISTS (
                SELECT 1
                FROM organization_memberships
                WHERE organization_id = events.organization_id
                  AND user_id = ${userId}
                  AND role IN ('owner', 'admin', 'event_manager')
              )
            RETURNING id AS eventId
          `;

          return rows.length === 1;
        }),
        updateTicketType: Effect.fn('EventAuthoringRepository.updateTicketType')(function* (
          userId: string,
          input: TicketTypeInput & { readonly ticketTypeId: string },
        ) {
          const rows = yield* sql<{ readonly ticketTypeId: string }>`
            UPDATE ticket_types
            SET
              name = ${input.name},
              description = ${input.description},
              price_minor = ${input.priceMinor},
              currency = ${input.currency},
              quantity_total = ${input.quantityTotal},
              sales_starts_at = ${input.salesStartsAt},
              sales_ends_at = ${input.salesEndsAt}
            WHERE id = ${input.ticketTypeId}
              AND event_id = ${input.eventId}
              AND ${input.quantityTotal} >= quantity_reserved + quantity_sold
              AND EXISTS (
                SELECT 1
                FROM events
                INNER JOIN organization_memberships
                  ON organization_memberships.organization_id = events.organization_id
                WHERE events.id = ticket_types.event_id
                  AND organization_memberships.user_id = ${userId}
                  AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
              )
            RETURNING id AS ticketTypeId
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
