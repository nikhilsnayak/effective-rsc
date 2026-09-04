import { Context, Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import { EventSummary } from '@/modules/event/model';

type EventRow = {
  readonly capacity: number;
  readonly countryCode: string;
  readonly description: string;
  readonly endsAt: string;
  readonly eventId: string;
  readonly eventSlug: string;
  readonly locality: string;
  readonly name: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly startsAt: string;
  readonly status: string;
  readonly tagline: string;
  readonly timezone: string;
  readonly venueName: string;
};

const decodeEvents = Schema.decodeUnknownEffect(Schema.Array(EventSummary));

export class EventRepository extends Context.Service<EventRepository>()(
  '@effective-rsc/example-event-platform/event/EventRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      return {
        findPublicBySlug: Effect.fn('EventRepository.findPublicBySlug')(function* (
          organizationSlug: string,
          eventSlug: string,
        ) {
          const rows = yield* sql<EventRow>`
            SELECT
              events.id AS eventId,
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
              organizations.id AS organizationId,
              organizations.slug AS organizationSlug,
              organizations.name AS organizationName
            FROM events
            INNER JOIN organizations ON organizations.id = events.organization_id
            WHERE organizations.slug = ${organizationSlug}
              AND events.slug = ${eventSlug}
              AND events.status IN ('published', 'completed')
            LIMIT 1
          `;
          const decoded = yield* decodeEvents(rows);

          return decoded[0] ?? null;
        }),
        listPublic: sql<EventRow>`
            SELECT
              events.id AS eventId,
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
              organizations.id AS organizationId,
              organizations.slug AS organizationSlug,
              organizations.name AS organizationName
            FROM events
            INNER JOIN organizations ON organizations.id = events.organization_id
            WHERE events.status IN ('published', 'completed')
            ORDER BY events.starts_at ASC
          `.pipe(Effect.flatMap(decodeEvents)),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
  static readonly layerTest = Layer.mock(this);
}
