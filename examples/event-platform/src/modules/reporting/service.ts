import { Context, Effect, Layer } from 'effect';

import {
  type EventReport,
  ReportingAccessDenied,
  ReportingUnavailable,
} from '@/modules/reporting/model';
import { ReportingRepository } from '@/modules/reporting/repository';

const unavailable = (operation: string) =>
  Effect.mapError(() => new ReportingUnavailable({ operation }));

export class ReportingService extends Context.Service<ReportingService>()(
  '@effective-rsc/example-event-platform/reporting/ReportingService',
  {
    make: Effect.gen(function* () {
      const repository = yield* ReportingRepository;

      return {
        eventReport: Effect.fn('ReportingService.eventReport')(function* (
          userId: string,
          eventId: string,
        ) {
          const event = yield* repository
            .loadEvent(userId, eventId)
            .pipe(unavailable('authorize event report'));
          if (event === null) {
            return yield* new ReportingAccessDenied({ eventId, userId });
          }

          const [payments, summary, ticketSales] = yield* Effect.all(
            [
              repository.loadPayments(userId, eventId),
              repository.loadSummary(userId, eventId),
              repository.loadTicketSales(userId, eventId),
            ],
            { concurrency: 'unbounded' },
          ).pipe(unavailable('load event report'));

          if (summary === null) {
            return yield* new ReportingUnavailable({ operation: 'load sales summary' });
          }

          return { event, payments, summary, ticketSales } satisfies EventReport;
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
