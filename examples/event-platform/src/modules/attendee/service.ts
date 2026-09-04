import { Context, DateTime, Effect, Layer } from 'effect';

import { EmailGateway } from '@/modules/attendee/email-gateway';
import {
  AttendeeAccessDenied,
  type AttendeeDashboard,
  AttendeeHubUnavailable,
  AttendeeTicketNotFound,
  TicketHolderUpdateRejected,
} from '@/modules/attendee/model';
import { AttendeeRepository } from '@/modules/attendee/repository';

const unavailable = (operation: string) =>
  Effect.mapError(() => new AttendeeHubUnavailable({ operation }));

export class AttendeeService extends Context.Service<AttendeeService>()(
  '@effective-rsc/example-event-platform/attendee/AttendeeService',
  {
    make: Effect.gen(function* () {
      const emailGateway = yield* EmailGateway;
      const repository = yield* AttendeeRepository;

      const resolveEmail = Effect.fnUntraced(function* (sessionToken: string) {
        const now = yield* DateTime.now;
        const email = yield* repository
          .resolveSession(sessionToken, DateTime.formatIso(now))
          .pipe(unavailable('resolve attendee session'));

        if (email === null) {
          return yield* new AttendeeAccessDenied({ sessionToken });
        }
        return email;
      });

      const deliverPendingEmail = Effect.fnUntraced(function* (email: string) {
        const messages = yield* repository
          .listPendingEmail(email)
          .pipe(unavailable('load pending attendee email'));

        yield* Effect.forEach(
          messages,
          (message) =>
            Effect.gen(function* () {
              yield* emailGateway.deliver(message);
              const now = yield* DateTime.now;
              yield* repository
                .markEmailSent(message.emailId, DateTime.formatIso(now))
                .pipe(unavailable('mark attendee email delivered'));
            }),
          { concurrency: 1 },
        );
      });

      return {
        dashboard: Effect.fn('AttendeeService.dashboard')(function* (
          sessionToken: string,
        ): Effect.fn.Return<AttendeeDashboard, AttendeeAccessDenied | AttendeeHubUnavailable> {
          const email = yield* resolveEmail(sessionToken);
          yield* deliverPendingEmail(email);
          const [messages, tickets] = yield* Effect.all(
            [repository.listDeliveredEmail(email), repository.listTickets(email)],
            { concurrency: 'unbounded' },
          ).pipe(unavailable('load attendee dashboard'));

          return { email, messages, tickets };
        }),
        ticket: Effect.fn('AttendeeService.ticket')(function* (
          sessionToken: string,
          ticketCode: string,
        ) {
          const email = yield* resolveEmail(sessionToken);
          const ticket = yield* repository
            .findTicket(email, ticketCode)
            .pipe(unavailable('load attendee ticket'));

          if (ticket === null) {
            return yield* new AttendeeTicketNotFound({ ticketCode });
          }
          return ticket;
        }),
        updateHolderName: Effect.fn('AttendeeService.updateHolderName')(function* (
          sessionToken: string,
          ticketId: string,
          holderName: string,
        ) {
          const email = yield* resolveEmail(sessionToken);
          const now = yield* DateTime.now;
          const updated = yield* repository
            .updateHolderName(email, ticketId, holderName, DateTime.formatIso(now))
            .pipe(unavailable('update ticket holder'));

          if (!updated) {
            return yield* new TicketHolderUpdateRejected({ ticketId });
          }
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
