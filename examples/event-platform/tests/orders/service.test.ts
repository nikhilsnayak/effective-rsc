import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { EmailGateway } from '@/modules/attendee/email-gateway';
import { OrdersRepository } from '@/modules/orders/repository';
import { OrdersService } from '@/modules/orders/service';

const event = {
  eventId: 'event-effect-systems-summit-2026',
  eventName: 'Effect Systems Summit',
  organizationName: 'Runtime Collective',
  role: 'owner',
  status: 'published',
} as const;

const layer = (
  repository: Parameters<typeof OrdersRepository.layerTest>[0],
  gateway: Parameters<typeof EmailGateway.layerTest>[0] = {},
) =>
  OrdersService.layer.pipe(
    Layer.provide(
      Layer.merge(OrdersRepository.layerTest(repository), EmailGateway.layerTest(gateway)),
    ),
  );

describe('OrdersService', () => {
  it.effect('delivers and records a refund notification', () => {
    const activity: Array<string> = [];

    return Effect.gen(function* () {
      const service = yield* OrdersService;
      const order = yield* service.refund(
        'user-maya',
        event.eventId,
        'order-demo-ada',
        'Attendee requested cancellation',
      );

      expect(order.status).toBe('refunded');
      expect(activity).toEqual(['deliver:ada@example.test', 'record:email-refund-order-demo-ada']);
    }).pipe(
      Effect.provide(
        layer(
          {
            loadEvent: () => Effect.succeed(event),
            markEmailSent: (emailId) => {
              activity.push(`record:${emailId}`);
              return Effect.succeed(true);
            },
            refund: () =>
              Effect.succeed({
                message: {
                  body: 'Refunded',
                  emailId: 'email-refund-order-demo-ada',
                  recipient: 'ada@example.test',
                  subject: 'Refund',
                },
                order: {
                  buyerEmail: 'ada@example.test',
                  buyerName: 'Ada Lovelace',
                  createdAt: '2026-09-01T10:00:00Z',
                  currency: 'EUR',
                  orderId: 'order-demo-ada',
                  registrationAnswers: '',
                  refundReason: 'Attendee requested cancellation',
                  refundedAt: '2026-09-04T08:01:00Z',
                  status: 'refunded',
                  ticketCode: 'GTH-DEMOADA0001',
                  ticketStatus: 'cancelled',
                  ticketTypeName: 'Community',
                  totalMinor: 5900,
                  updatedAt: '2026-09-04T08:01:00Z',
                },
              }),
          },
          {
            deliver: (message) => {
              activity.push(`deliver:${message.recipient}`);
              return Effect.void;
            },
          },
        ),
      ),
    );
  });
});
