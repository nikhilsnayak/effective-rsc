import { Context, DateTime, Effect, Layer } from 'effect';

import { EmailGateway } from '@/modules/attendee/email-gateway';
import {
  OrderNotRefundable,
  OrdersAccessDenied,
  type OrdersWorkspace,
  OrdersUnavailable,
} from '@/modules/orders/model';
import { OrdersRepository } from '@/modules/orders/repository';

const unavailable = (operation: string) =>
  Effect.mapError(() => new OrdersUnavailable({ operation }));

export type OrdersError = OrderNotRefundable | OrdersAccessDenied | OrdersUnavailable;

export class OrdersService extends Context.Service<OrdersService>()(
  '@effective-rsc/example-event-platform/orders/OrdersService',
  {
    make: Effect.gen(function* () {
      const emailGateway = yield* EmailGateway;
      const repository = yield* OrdersRepository;

      const authorize = Effect.fnUntraced(function* (userId: string, eventId: string) {
        const event = yield* repository
          .loadEvent(userId, eventId)
          .pipe(unavailable('authorize order management'));
        if (event === null) {
          return yield* new OrdersAccessDenied({ eventId, userId });
        }
        return event;
      });

      return {
        refund: Effect.fn('OrdersService.refund')(function* (
          userId: string,
          eventId: string,
          orderId: string,
          reason: string,
        ) {
          yield* authorize(userId, eventId);
          const now = yield* DateTime.now;
          const refunded = yield* repository
            .refund(userId, eventId, orderId, reason, DateTime.formatIso(now))
            .pipe(unavailable('refund order'));
          if (refunded === null) {
            return yield* new OrderNotRefundable({ orderId });
          }

          yield* emailGateway.deliver(refunded.message);
          const deliveredAt = yield* DateTime.now;
          const marked = yield* repository
            .markEmailSent(refunded.message.emailId, DateTime.formatIso(deliveredAt))
            .pipe(unavailable('record refund notification'));
          if (!marked) {
            return yield* new OrdersUnavailable({ operation: 'record refund notification' });
          }
          return refunded.order;
        }),
        workspace: Effect.fn('OrdersService.workspace')(function* (
          userId: string,
          eventId: string,
        ): Effect.fn.Return<OrdersWorkspace, OrdersAccessDenied | OrdersUnavailable> {
          const event = yield* authorize(userId, eventId);
          const orders = yield* repository
            .listOrders(userId, eventId)
            .pipe(unavailable('load event orders'));
          return { event, orders };
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
