import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';

import { type EventSummary, PublishedEventNotFound } from '@/modules/event/model';
import { EventRepository } from '@/modules/event/repository';
import { EventService } from '@/modules/event/service';

const conference = {
  capacity: 320,
  countryCode: 'IN',
  description: 'A focused conference.',
  endsAt: '2026-08-23T16:30:00+05:30',
  eventId: 'event-effective-rsc-conf-2026',
  eventSlug: 'effective-rsc-conf-2026',
  locality: 'Bengaluru',
  name: 'effective-rsc Conf',
  organizationId: 'org-effective-rsc',
  organizationName: 'Effective RSC',
  organizationSlug: 'effective-rsc',
  startsAt: '2026-08-22T09:30:00+05:30',
  status: 'completed',
  tagline: 'Two days on RSC and Effect.',
  timezone: 'Asia/Kolkata',
  venueName: 'Bangalore International Centre',
} satisfies EventSummary;

const RepositoryLayer = EventRepository.layerTest({
  findPublicBySlug: (organizationSlug, eventSlug) =>
    Effect.succeed(
      organizationSlug === conference.organizationSlug && eventSlug === conference.eventSlug
        ? conference
        : null,
    ),
  listPublic: Effect.succeed([conference]),
});
const ServiceLayer = EventService.layer.pipe(Layer.provide(RepositoryLayer));

describe('EventService', () => {
  it.effect('returns the public catalog and resolves published events', () =>
    Effect.gen(function* () {
      const service = yield* EventService;

      const events = yield* service.listPublished;
      expect(events).toEqual([conference]);

      const event = yield* service.getPublished('effective-rsc', 'effective-rsc-conf-2026');
      expect(event).toEqual(conference);
    }).pipe(Effect.provide(ServiceLayer)),
  );

  it.effect('models a non-public address as a typed not-found failure', () =>
    Effect.gen(function* () {
      const service = yield* EventService;
      const error = yield* service.getPublished('effective-rsc', 'missing').pipe(Effect.flip);

      expect(error._tag).toBe('@effective-rsc/example-event-platform/event/PublishedEventNotFound');
      if (!Schema.is(PublishedEventNotFound)(error)) {
        return;
      }
      expect(error.organizationSlug).toBe('effective-rsc');
      expect(error.eventSlug).toBe('missing');
    }).pipe(Effect.provide(ServiceLayer)),
  );
});
