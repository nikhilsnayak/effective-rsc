import { Context, DateTime, Effect, Layer } from 'effect';

import {
  CheckInAccessDenied,
  type CheckInConsole,
  CheckInConcurrentUpdate,
  CheckInCredentialNotFound,
  type CheckInTicket,
  CheckInTicketCancelled,
  CheckInTicketNotCheckedIn,
  CheckInUnavailable,
} from '@/modules/check-in/model';
import { CheckInRepository } from '@/modules/check-in/repository';

export type CheckInResult =
  | { readonly _tag: 'AlreadyCheckedIn'; readonly ticket: CheckInTicket }
  | { readonly _tag: 'CheckedIn'; readonly ticket: CheckInTicket }
  | { readonly _tag: 'Reopened'; readonly ticket: CheckInTicket };

export type CheckInError =
  | CheckInAccessDenied
  | CheckInConcurrentUpdate
  | CheckInCredentialNotFound
  | CheckInTicketCancelled
  | CheckInTicketNotCheckedIn
  | CheckInUnavailable;

const unavailable = (operation: string) =>
  Effect.mapError(() => new CheckInUnavailable({ operation }));

export class CheckInService extends Context.Service<CheckInService>()(
  '@effective-rsc/example-event-platform/check-in/CheckInService',
  {
    make: Effect.gen(function* () {
      const repository = yield* CheckInRepository;

      const authorize = Effect.fnUntraced(function* (staffUserId: string, eventId: string) {
        const event = yield* repository
          .loadEvent(staffUserId, eventId)
          .pipe(unavailable('authorize check-in staff'));
        if (event === null) {
          return yield* new CheckInAccessDenied({ eventId, userId: staffUserId });
        }
        return event;
      });

      const credential = Effect.fnUntraced(function* (
        staffUserId: string,
        eventId: string,
        ticketCode: string,
      ) {
        yield* authorize(staffUserId, eventId);
        const ticket = yield* repository
          .findCredential(staffUserId, eventId, ticketCode)
          .pipe(unavailable('look up check-in credential'));
        if (ticket === null) {
          return yield* new CheckInCredentialNotFound({ eventId, ticketCode });
        }
        return ticket;
      });

      return {
        checkIn: Effect.fn('CheckInService.checkIn')(function* (
          staffUserId: string,
          eventId: string,
          ticketCode: string,
        ): Effect.fn.Return<
          CheckInResult,
          | CheckInAccessDenied
          | CheckInConcurrentUpdate
          | CheckInCredentialNotFound
          | CheckInTicketCancelled
          | CheckInUnavailable
        > {
          const ticket = yield* credential(staffUserId, eventId, ticketCode);
          if (ticket.status === 'checked_in') {
            return { ticket, _tag: 'AlreadyCheckedIn' };
          }
          if (ticket.status === 'cancelled') {
            return yield* new CheckInTicketCancelled({ ticketCode });
          }

          const now = yield* DateTime.now;
          const changed = yield* repository
            .transitionCredential({
              action: 'check_in',
              eventId,
              expectedStatus: 'valid',
              recordedAt: DateTime.formatIso(now),
              staffUserId,
              targetStatus: 'checked_in',
              ticketId: ticket.ticketId,
            })
            .pipe(unavailable('check in attendee'));
          if (!changed) {
            return yield* new CheckInConcurrentUpdate({ ticketCode });
          }

          return { ticket: { ...ticket, status: 'checked_in' }, _tag: 'CheckedIn' };
        }),
        console: Effect.fn('CheckInService.console')(function* (
          staffUserId: string,
          eventId: string,
        ) {
          const event = yield* authorize(staffUserId, eventId);
          const audit = yield* repository
            .loadAudit(staffUserId, eventId)
            .pipe(unavailable('load check-in activity'));

          return { audit, event } satisfies CheckInConsole;
        }),
        undo: Effect.fn('CheckInService.undo')(function* (
          staffUserId: string,
          eventId: string,
          ticketCode: string,
        ) {
          const ticket = yield* credential(staffUserId, eventId, ticketCode);
          if (ticket.status !== 'checked_in') {
            return yield* new CheckInTicketNotCheckedIn({ ticketCode });
          }

          const now = yield* DateTime.now;
          const changed = yield* repository
            .transitionCredential({
              action: 'undo',
              eventId,
              expectedStatus: 'checked_in',
              recordedAt: DateTime.formatIso(now),
              staffUserId,
              targetStatus: 'valid',
              ticketId: ticket.ticketId,
            })
            .pipe(unavailable('undo attendee check-in'));
          if (!changed) {
            return yield* new CheckInConcurrentUpdate({ ticketCode });
          }

          return { ticket: { ...ticket, status: 'valid' }, _tag: 'Reopened' } as const;
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
