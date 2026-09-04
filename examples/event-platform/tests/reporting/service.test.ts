import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { ReportingRepository } from '@/modules/reporting/repository';
import { ReportingService } from '@/modules/reporting/service';

const event = {
  eventId: 'event-effect-systems-summit-2026',
  eventName: 'Effect Systems Summit',
  organizationName: 'Runtime Collective',
  role: 'owner',
  status: 'published',
} as const;

const layer = (repository: Parameters<typeof ReportingRepository.layerTest>[0]) =>
  ReportingService.layer.pipe(Layer.provide(ReportingRepository.layerTest(repository)));

describe('ReportingService', () => {
  it.effect('assembles the event report after authorization', () =>
    Effect.gen(function* () {
      const service = yield* ReportingService;
      const report = yield* service.eventReport('user-maya', event.eventId);

      expect(report.event).toEqual(event);
      expect(report.summary.soldTickets).toBe(1);
      expect(report.payments[0]).toMatchObject({ status: 'paid', totalMinor: 5900 });
    }).pipe(
      Effect.provide(
        layer({
          loadEvent: () => Effect.succeed(event),
          loadPayments: () =>
            Effect.succeed([
              { currency: 'EUR', orderCount: 1, status: 'paid' as const, totalMinor: 5900 },
            ]),
          loadSummary: () =>
            Effect.succeed({
              capacity: 240,
              checkedInTickets: 0,
              issuedTickets: 1,
              reservedTickets: 0,
              soldTickets: 1,
            }),
          loadTicketSales: () => Effect.succeed([]),
        }),
      ),
    ),
  );

  it.effect('rejects users without reporting access before loading financial data', () => {
    let loadedFinancialData = false;

    return Effect.gen(function* () {
      const service = yield* ReportingService;
      const error = yield* service.eventReport('user-nikhil', event.eventId).pipe(Effect.flip);

      expect(error._tag).toBe(
        '@effective-rsc/example-event-platform/reporting/ReportingAccessDenied',
      );
      expect(loadedFinancialData).toBe(false);
    }).pipe(
      Effect.provide(
        layer({
          loadEvent: () => Effect.succeed(null),
          loadPayments: () => {
            loadedFinancialData = true;
            return Effect.succeed([]);
          },
          loadSummary: () => Effect.succeed(null),
          loadTicketSales: () => Effect.succeed([]),
        }),
      ),
    );
  });
});
