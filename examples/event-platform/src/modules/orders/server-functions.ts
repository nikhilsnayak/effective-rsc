'use server';

import { Effect, Schema } from 'effect';

import type { OrdersError } from '@/modules/orders/service';
import { OrdersService } from '@/modules/orders/service';
import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';

export type OrderMutationState =
  | { readonly message: string; readonly status: 'success' }
  | { readonly message: string; readonly status: 'error' };

const RefundInput = Schema.fromFormData(
  Schema.Struct({
    eventId: Schema.NonEmptyString,
    orderId: Schema.NonEmptyString,
    reason: Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(3), Schema.isMaxLength(500)),
  }),
);

const failureState = (error: OrdersError): OrderMutationState => {
  switch (error._tag) {
    case '@effective-rsc/example-event-platform/orders/OrdersAccessDenied':
      return { message: 'Your organizer role cannot manage orders.', status: 'error' };
    case '@effective-rsc/example-event-platform/orders/OrderNotRefundable':
      return { message: 'That order is unavailable or was already refunded.', status: 'error' };
    case '@effective-rsc/example-event-platform/orders/OrdersUnavailable':
      return { message: 'Order management is temporarily unavailable.', status: 'error' };
  }
};

export const refundOrder = OrganizerERSC.ServerFn.make({
  input: RefundInput,
  handler: Effect.fn('refundOrder')(function* ({ eventId, orderId, reason }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* OrdersService;
    return yield* service.refund(userId, eventId, orderId, reason).pipe(
      Effect.map(
        () => ({ message: 'Order refunded and attendee notified.', status: 'success' }) as const,
      ),
      Effect.catch((error) => Effect.succeed(failureState(error))),
    );
  }),
});
