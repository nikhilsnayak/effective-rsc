import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import type { ManagedEventAccess } from '@/modules/organizer/repository';
import { OrganizerRepository } from '@/modules/organizer/repository';
import { OrganizerService } from '@/modules/organizer/service';

const draftEvent = {
  endsAt: '2026-12-05T17:30:00+05:30',
  eventId: 'event-rsc-workshop-lab-2026',
  eventSlug: 'rsc-workshop-lab-2026',
  name: 'RSC Workshop Lab',
  organizationId: 'org-effective-rsc',
  role: 'owner',
  startsAt: '2026-12-05T09:30:00+05:30',
  status: 'draft',
  updatedAt: '2026-08-30T09:00:00Z',
} satisfies ManagedEventAccess;

const RepositoryLayer = OrganizerRepository.layerTest({
  compareAndSetEventStatus: () => Effect.succeed(true),
  findEventAccess: () => Effect.succeed(draftEvent),
  loadDashboard: () =>
    Effect.succeed({
      events: [draftEvent],
      organizations: [
        {
          name: 'Effective RSC',
          organizationId: 'org-effective-rsc',
          organizationSlug: 'effective-rsc',
          role: 'owner',
        },
      ],
      user: { email: 'nikhil@example.test', name: 'Nikhil Nayak', userId: 'user-nikhil' },
    }),
});
const ServiceLayer = OrganizerService.layer.pipe(Layer.provide(RepositoryLayer));

describe('OrganizerService', () => {
  it.effect('groups managed events into their organization workspaces', () =>
    Effect.gen(function* () {
      const service = yield* OrganizerService;
      const dashboard = yield* service.dashboard('user-nikhil');

      expect(dashboard.organizations).toHaveLength(1);
      expect(dashboard.organizations[0]?.events.map((event) => event.eventId)).toEqual([
        'event-rsc-workshop-lab-2026',
      ]);
    }).pipe(Effect.provide(ServiceLayer)),
  );

  it.effect('applies an allowed lifecycle transition', () =>
    Effect.gen(function* () {
      const service = yield* OrganizerService;
      const event = yield* service.transitionEvent(
        'user-nikhil',
        'event-rsc-workshop-lab-2026',
        'published',
      );

      expect(event.status).toBe('published');
      expect(event.updatedAt).not.toBe(draftEvent.updatedAt);
    }).pipe(Effect.provide(ServiceLayer)),
  );

  it.effect('rejects lifecycle transitions that violate the event state machine', () => {
    const serviceLayer = OrganizerService.layer.pipe(
      Layer.provide(
        OrganizerRepository.layerTest({
          findEventAccess: () => Effect.succeed({ ...draftEvent, status: 'completed' as const }),
        }),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* OrganizerService;
      const error = yield* service
        .transitionEvent('user-nikhil', draftEvent.eventId, 'published')
        .pipe(Effect.flip);

      expect(error._tag).toBe(
        '@effective-rsc/example-event-platform/organizer/EventStatusTransitionRejected',
      );
    }).pipe(Effect.provide(serviceLayer));
  });
});
