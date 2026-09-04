import { Context, DateTime, Effect, Layer } from 'effect';

import { EmailGateway } from '@/modules/attendee/email-gateway';
import {
  AnnouncementNotSendable,
  CommunicationsAccessDenied,
  type CommunicationsWorkspace,
  CommunicationsUnavailable,
  type SaveAnnouncementInput,
} from '@/modules/communications/model';
import { CommunicationsRepository } from '@/modules/communications/repository';

const unavailable = (operation: string) =>
  Effect.mapError(() => new CommunicationsUnavailable({ operation }));

export class CommunicationsService extends Context.Service<CommunicationsService>()(
  '@effective-rsc/example-event-platform/communications/CommunicationsService',
  {
    make: Effect.gen(function* () {
      const emailGateway = yield* EmailGateway;
      const repository = yield* CommunicationsRepository;

      const authorize = Effect.fnUntraced(function* (userId: string, eventId: string) {
        const event = yield* repository
          .loadEvent(userId, eventId)
          .pipe(unavailable('authorize event communications'));
        if (event === null) {
          return yield* new CommunicationsAccessDenied({ eventId, userId });
        }
        return event;
      });

      return {
        saveDraft: Effect.fn('CommunicationsService.saveDraft')(function* (
          userId: string,
          input: SaveAnnouncementInput,
        ) {
          yield* authorize(userId, input.eventId);
          const now = yield* DateTime.now;
          const saved = yield* repository
            .saveDraft(userId, input, DateTime.formatIso(now))
            .pipe(unavailable('save announcement draft'));
          if (!saved) {
            return yield* new CommunicationsAccessDenied({ eventId: input.eventId, userId });
          }
        }),
        send: Effect.fn('CommunicationsService.send')(function* (
          userId: string,
          eventId: string,
          announcementId: string,
        ) {
          yield* authorize(userId, eventId);
          const now = yield* DateTime.now;
          const queued = yield* repository
            .queueAnnouncement(userId, eventId, announcementId, DateTime.formatIso(now))
            .pipe(unavailable('queue announcement'));
          if (queued === null) {
            return yield* new AnnouncementNotSendable({ announcementId, eventId });
          }

          yield* Effect.forEach(
            queued.messages,
            (message) =>
              Effect.gen(function* () {
                yield* emailGateway.deliver(message);
                const deliveredAt = yield* DateTime.now;
                const marked = yield* repository
                  .markEmailSent(message.emailId, DateTime.formatIso(deliveredAt))
                  .pipe(unavailable('record announcement delivery'));
                if (!marked) {
                  return yield* new CommunicationsUnavailable({
                    operation: 'record announcement delivery',
                  });
                }
              }),
            { concurrency: 1 },
          );

          return { recipientCount: queued.messages.length };
        }),
        workspace: Effect.fn('CommunicationsService.workspace')(function* (
          userId: string,
          eventId: string,
        ): Effect.fn.Return<
          CommunicationsWorkspace,
          CommunicationsAccessDenied | CommunicationsUnavailable
        > {
          const event = yield* authorize(userId, eventId);
          const announcements = yield* repository
            .listAnnouncements(userId, eventId)
            .pipe(unavailable('load event announcements'));

          return { announcements, event };
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}

export type CommunicationsError =
  | AnnouncementNotSendable
  | CommunicationsAccessDenied
  | CommunicationsUnavailable;
