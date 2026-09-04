import { Context, DateTime, Effect, Layer } from 'effect';

import {
  EventConcurrentUpdate,
  EventStatusTransitionRejected,
  type EventTransitionTarget,
  type ManagedEvent,
  type ManagedEventStatus,
  OrganizerAccessDenied,
  type OrganizerDashboard,
  OrganizerUnavailable,
} from '@/modules/organizer/model';
import { OrganizerRepository } from '@/modules/organizer/repository';

const transitions: Record<ManagedEventStatus, ReadonlyArray<EventTransitionTarget>> = {
  cancelled: [],
  completed: [],
  draft: ['published', 'cancelled'],
  published: ['completed', 'cancelled'],
};

const managementRoles = new Set(['owner', 'admin', 'event_manager']);

const unavailable = (operation: string) =>
  Effect.mapError(() => new OrganizerUnavailable({ operation }));

export const availableEventTransitions = (status: ManagedEventStatus) => transitions[status];

export class OrganizerService extends Context.Service<OrganizerService>()(
  '@effective-rsc/example-event-platform/organizer/OrganizerService',
  {
    make: Effect.gen(function* () {
      const repository = yield* OrganizerRepository;

      return {
        dashboard: Effect.fn('OrganizerService.dashboard')(function* (userId: string) {
          const record = yield* repository
            .loadDashboard(userId)
            .pipe(unavailable('load organizer workspace'));

          if (record === null || record.organizations.length === 0) {
            return yield* new OrganizerAccessDenied({ resourceId: 'organizer', userId });
          }

          return {
            organizations: record.organizations.map((organization) => ({
              ...organization,
              events: record.events.filter(
                (event) => event.organizationId === organization.organizationId,
              ),
            })),
            user: record.user,
          } satisfies OrganizerDashboard;
        }),
        transitionEvent: Effect.fn('OrganizerService.transitionEvent')(function* (
          userId: string,
          eventId: string,
          targetStatus: EventTransitionTarget,
        ) {
          const access = yield* repository
            .findEventAccess(userId, eventId)
            .pipe(unavailable('authorize event management'));

          if (access === null || !managementRoles.has(access.role)) {
            return yield* new OrganizerAccessDenied({ resourceId: eventId, userId });
          }

          if (!transitions[access.status].includes(targetStatus)) {
            return yield* new EventStatusTransitionRejected({
              currentStatus: access.status,
              eventId,
              targetStatus,
            });
          }

          const now = yield* DateTime.now;
          const updatedAt = DateTime.formatIso(now);
          const updated = yield* repository
            .compareAndSetEventStatus(userId, eventId, access.status, targetStatus, updatedAt)
            .pipe(unavailable('update event status'));

          if (!updated) {
            return yield* new EventConcurrentUpdate({ eventId });
          }

          return {
            endsAt: access.endsAt,
            eventId: access.eventId,
            eventSlug: access.eventSlug,
            name: access.name,
            organizationId: access.organizationId,
            startsAt: access.startsAt,
            status: targetStatus,
            updatedAt,
          } satisfies ManagedEvent;
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
