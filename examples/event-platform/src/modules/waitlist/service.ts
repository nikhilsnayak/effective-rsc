import { Context, DateTime, Effect, Layer } from 'effect';

import { EmailGateway } from '@/modules/attendee/email-gateway';
import {
  type JoinWaitlistInput,
  WaitlistAccessDenied,
  WaitlistEntryUnavailable,
  WaitlistTicketAvailable,
  WaitlistTicketUnavailable,
  WaitlistUnavailable,
  type WaitlistWorkspace,
} from '@/modules/waitlist/model';
import { WaitlistRepository } from '@/modules/waitlist/repository';

const unavailable = (operation: string) =>
  Effect.mapError(() => new WaitlistUnavailable({ operation }));

export type WaitlistError =
  | WaitlistAccessDenied
  | WaitlistEntryUnavailable
  | WaitlistTicketAvailable
  | WaitlistTicketUnavailable
  | WaitlistUnavailable;

export class WaitlistService extends Context.Service<WaitlistService>()(
  '@effective-rsc/example-event-platform/waitlist/WaitlistService',
  {
    make: Effect.gen(function* () {
      const emailGateway = yield* EmailGateway;
      const repository = yield* WaitlistRepository;

      const authorize = Effect.fnUntraced(function* (userId: string, eventId: string) {
        const event = yield* repository
          .loadEvent(userId, eventId)
          .pipe(unavailable('authorize waitlist management'));
        if (event === null) {
          return yield* new WaitlistAccessDenied({ eventId, userId });
        }
        return event;
      });

      return {
        notify: Effect.fn('WaitlistService.notify')(function* (
          userId: string,
          eventId: string,
          entryId: string,
        ) {
          yield* authorize(userId, eventId);
          const now = yield* DateTime.now;
          const notified = yield* repository
            .notify(userId, eventId, entryId, DateTime.formatIso(now))
            .pipe(unavailable('notify waitlisted attendee'));
          if (notified === null) {
            return yield* new WaitlistEntryUnavailable({ entryId });
          }

          yield* emailGateway.deliver(notified.message);
          const deliveredAt = yield* DateTime.now;
          const marked = yield* repository
            .markEmailSent(notified.message.emailId, DateTime.formatIso(deliveredAt))
            .pipe(unavailable('record waitlist update delivery'));
          if (!marked) {
            return yield* new WaitlistUnavailable({
              operation: 'record waitlist update delivery',
            });
          }
          return notified.entry;
        }),
        join: Effect.fn('WaitlistService.join')(function* (
          input: JoinWaitlistInput,
          idempotencyKey: string,
        ) {
          const normalized = {
            ...input,
            attendeeEmail: input.attendeeEmail.trim().toLowerCase(),
            attendeeName: input.attendeeName.trim(),
          };
          const now = yield* DateTime.now;
          const result = yield* repository
            .join(normalized, `waitlist-${idempotencyKey}`, DateTime.formatIso(now))
            .pipe(unavailable('join ticket waitlist'));
          if (result._tag === 'TicketAvailable') {
            return yield* new WaitlistTicketAvailable({ ticketTypeId: input.ticketTypeId });
          }
          if (result._tag === 'TicketUnavailable') {
            return yield* new WaitlistTicketUnavailable({ ticketTypeId: input.ticketTypeId });
          }
          return result.entry;
        }),
        workspace: Effect.fn('WaitlistService.workspace')(function* (
          userId: string,
          eventId: string,
        ): Effect.fn.Return<WaitlistWorkspace, WaitlistAccessDenied | WaitlistUnavailable> {
          const event = yield* authorize(userId, eventId);
          const entries = yield* repository
            .listEntries(userId, eventId)
            .pipe(unavailable('load event waitlist'));
          return { entries, event };
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
