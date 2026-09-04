import { Schema } from 'effect';

import { ManagedEventStatus, OrganizationRole } from '@/modules/organizer/model';
import { PaymentStatus } from '@/modules/reporting/model';

export const OrderEvent = Schema.Struct({
  eventId: Schema.String,
  eventName: Schema.String,
  organizationName: Schema.String,
  role: OrganizationRole,
  status: ManagedEventStatus,
});
export type OrderEvent = typeof OrderEvent.Type;

export const ManagedOrder = Schema.Struct({
  buyerEmail: Schema.String,
  buyerName: Schema.String,
  createdAt: Schema.String,
  currency: Schema.String,
  orderId: Schema.String,
  registrationAnswers: Schema.String,
  refundReason: Schema.NullOr(Schema.String),
  refundedAt: Schema.NullOr(Schema.String),
  status: PaymentStatus,
  ticketCode: Schema.NullOr(Schema.String),
  ticketStatus: Schema.NullOr(Schema.Literals(['valid', 'cancelled', 'checked_in'])),
  ticketTypeName: Schema.String,
  totalMinor: Schema.Finite,
  updatedAt: Schema.String,
});
export type ManagedOrder = typeof ManagedOrder.Type;

export type OrdersWorkspace = {
  readonly event: OrderEvent;
  readonly orders: ReadonlyArray<ManagedOrder>;
};

export class OrdersAccessDenied extends Schema.TaggedError<OrdersAccessDenied>()(
  '@effective-rsc/example-event-platform/orders/OrdersAccessDenied',
  { eventId: Schema.String, userId: Schema.String },
) {}

export class OrderNotRefundable extends Schema.TaggedError<OrderNotRefundable>()(
  '@effective-rsc/example-event-platform/orders/OrderNotRefundable',
  { orderId: Schema.String },
) {}

export class OrdersUnavailable extends Schema.TaggedError<OrdersUnavailable>()(
  '@effective-rsc/example-event-platform/orders/OrdersUnavailable',
  { operation: Schema.String },
) {}
