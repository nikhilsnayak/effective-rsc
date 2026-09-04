import { Context, Effect, Layer } from 'effect';

import { EventCatalogUnavailable, PublishedEventNotFound } from '@/modules/event/model';
import { EventRepository } from '@/modules/event/repository';

const unavailable = (operation: string) =>
  Effect.mapError(() => new EventCatalogUnavailable({ operation }));

export class EventService extends Context.Service<EventService>()(
  '@effective-rsc/example-event-platform/event/EventService',
  {
    make: Effect.gen(function* () {
      const repository = yield* EventRepository;

      return {
        getPublished: Effect.fn('EventService.getPublished')(function* (
          organizationSlug: string,
          eventSlug: string,
        ) {
          const event = yield* repository
            .findPublicBySlug(organizationSlug, eventSlug)
            .pipe(unavailable('load published event'));

          if (event === null) {
            return yield* new PublishedEventNotFound({ eventSlug, organizationSlug });
          }

          return event;
        }),
        listPublished: repository.listPublic.pipe(unavailable('list published events')),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
