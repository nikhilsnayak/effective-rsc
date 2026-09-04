import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { EmailGateway } from '@/modules/attendee/email-gateway';
import { AttendeeRepository } from '@/modules/attendee/repository';
import { AttendeeService } from '@/modules/attendee/service';

const attendeeTicket = {
  code: 'GTH-DEMOADA0001',
  currency: 'EUR',
  endsAt: '2026-11-12T18:00:00+01:00',
  eventId: 'event-effect-systems-summit-2026',
  eventName: 'Effect Systems Summit',
  holderEmail: 'ada@example.test',
  holderName: 'Ada Lovelace',
  locality: 'Amsterdam',
  orderId: 'order-demo-ada',
  organizationName: 'Runtime Collective',
  providerReference: 'local-payment-demo-ada',
  startsAt: '2026-11-12T09:00:00+01:00',
  status: 'valid',
  ticketId: 'ticket-demo-ada',
  ticketTypeName: 'Community',
  timezone: 'Europe/Amsterdam',
  totalMinor: 5900,
  venueName: 'De Hallen Studios',
} as const;

const attendeeLayer = (
  repository: Parameters<typeof AttendeeRepository.layerTest>[0],
  gateway: Parameters<typeof EmailGateway.layerTest>[0] = {},
) =>
  AttendeeService.layer.pipe(
    Layer.provide(
      Layer.merge(AttendeeRepository.layerTest(repository), EmailGateway.layerTest(gateway)),
    ),
  );

describe('AttendeeService', () => {
  it.effect('delivers pending outbox messages before returning the dashboard mailbox', () =>
    Effect.gen(function* () {
      const service = yield* AttendeeService;
      const dashboard = yield* service.dashboard('demo-attendee-ada');

      expect(dashboard.email).toBe('ada@example.test');
      expect(dashboard.tickets).toEqual([attendeeTicket]);
    }).pipe(
      Effect.provide(
        attendeeLayer(
          {
            listDeliveredEmail: () => Effect.succeed([]),
            listPendingEmail: () =>
              Effect.succeed([
                {
                  body: 'Your ticket code is GTH-DEMOADA0001.',
                  emailId: 'email-ticket-demo-ada',
                  recipient: 'ada@example.test',
                  subject: 'Your ticket',
                },
              ]),
            listTickets: () => Effect.succeed([attendeeTicket]),
            markEmailSent: () => Effect.succeed(true),
            resolveSession: () => Effect.succeed('ada@example.test'),
          },
          { deliver: () => Effect.void },
        ),
      ),
    ),
  );

  it.effect('rejects an unknown or expired attendee session', () =>
    Effect.gen(function* () {
      const service = yield* AttendeeService;
      const error = yield* service.dashboard('expired-token').pipe(Effect.flip);

      expect(error._tag).toBe(
        '@effective-rsc/example-event-platform/attendee/AttendeeAccessDenied',
      );
    }).pipe(Effect.provide(attendeeLayer({ resolveSession: () => Effect.succeed(null) }))),
  );
});
