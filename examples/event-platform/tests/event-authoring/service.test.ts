import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import type { CreateEventInput } from '@/modules/event-authoring/model';
import { EventAuthoringRepository } from '@/modules/event-authoring/repository';
import { EventAuthoringService } from '@/modules/event-authoring/service';

const createInput = {
  capacity: 120,
  countryCode: 'IN',
  description: 'A newly authored event.',
  endsAt: '2027-02-10T17:00',
  eventSlug: 'effect-operations-day',
  locality: 'Bengaluru',
  name: 'Effect Operations Day',
  organizationId: 'org-effective-rsc',
  startsAt: '2027-02-10T09:00',
  tagline: 'Typed operations in practice.',
  timezone: 'Asia/Kolkata',
  venueName: 'Bangalore International Centre',
} satisfies CreateEventInput;

const organization = {
  name: 'Effective RSC',
  organizationId: 'org-effective-rsc',
  organizationSlug: 'effective-rsc',
  role: 'owner',
} as const;

describe('EventAuthoringService', () => {
  it.effect('normalizes venue-local scheduling before creating a private draft', () => {
    let persisted: CreateEventInput | undefined;
    const ServiceLayer = EventAuthoringService.layer.pipe(
      Layer.provide(
        EventAuthoringRepository.layerTest({
          createEvent: (_userId, input) =>
            Effect.sync(() => {
              persisted = input;
              return 'event-created';
            }),
          findOrganization: () => Effect.succeed(organization),
          isSlugAvailable: () => Effect.succeed(true),
        }),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* EventAuthoringService;
      const created = yield* service.createEvent('user-nikhil', createInput);

      expect(created.eventId).toBe('event-created');
      expect(created.organizationSlug).toBe('effective-rsc');
      expect(persisted?.startsAt).toBe('2027-02-10T03:30:00.000Z');
      expect(persisted?.endsAt).toBe('2027-02-10T11:30:00.000Z');
    }).pipe(Effect.provide(ServiceLayer));
  });

  it.effect('rejects an invalid local schedule before persistence', () => {
    const ServiceLayer = EventAuthoringService.layer.pipe(
      Layer.provide(
        EventAuthoringRepository.layerTest({
          createEvent: () => Effect.die(new Error('invalid schedule must not be persisted')),
          findOrganization: () => Effect.succeed(organization),
          isSlugAvailable: () => Effect.succeed(true),
        }),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* EventAuthoringService;
      const error = yield* service
        .createEvent('user-nikhil', {
          ...createInput,
          endsAt: '2027-02-10T08:00',
        })
        .pipe(Effect.flip);

      expect(error._tag).toBe(
        '@effective-rsc/example-event-platform/event-authoring/EventScheduleInvalid',
      );
    }).pipe(Effect.provide(ServiceLayer));
  });

  it.effect('rejects check-in-only membership for event creation', () => {
    const ServiceLayer = EventAuthoringService.layer.pipe(
      Layer.provide(
        EventAuthoringRepository.layerTest({
          findOrganization: () => Effect.succeed(null),
        }),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* EventAuthoringService;
      const error = yield* service.createEvent('user-nikhil', createInput).pipe(Effect.flip);

      expect(error._tag).toBe(
        '@effective-rsc/example-event-platform/event-authoring/EventAuthoringAccessDenied',
      );
    }).pipe(Effect.provide(ServiceLayer));
  });
});
