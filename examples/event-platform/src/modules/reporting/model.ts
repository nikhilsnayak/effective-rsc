import { Schema } from 'effect';

import { ManagedEventStatus, OrganizationRole } from '@/modules/organizer/model';

export const ReportEvent = Schema.Struct({
  eventId: Schema.String,
  eventName: Schema.String,
  organizationName: Schema.String,
  role: OrganizationRole,
  status: ManagedEventStatus,
});
export type ReportEvent = typeof ReportEvent.Type;

export const SalesSummary = Schema.Struct({
  capacity: Schema.Finite,
  checkedInTickets: Schema.Finite,
  issuedTickets: Schema.Finite,
  reservedTickets: Schema.Finite,
  soldTickets: Schema.Finite,
});
export type SalesSummary = typeof SalesSummary.Type;

export const TicketSales = Schema.Struct({
  currency: Schema.String,
  name: Schema.String,
  priceMinor: Schema.Finite,
  quantityReserved: Schema.Finite,
  quantitySold: Schema.Finite,
  quantityTotal: Schema.Finite,
  ticketTypeId: Schema.String,
});
export type TicketSales = typeof TicketSales.Type;

export const PaymentStatus = Schema.Literals([
  'pending',
  'paid',
  'failed',
  'cancelled',
  'refunded',
]);
export type PaymentStatus = typeof PaymentStatus.Type;

export const PaymentOutcome = Schema.Struct({
  currency: Schema.String,
  orderCount: Schema.Finite,
  status: PaymentStatus,
  totalMinor: Schema.Finite,
});
export type PaymentOutcome = typeof PaymentOutcome.Type;

export type EventReport = {
  readonly event: ReportEvent;
  readonly payments: ReadonlyArray<PaymentOutcome>;
  readonly summary: SalesSummary;
  readonly ticketSales: ReadonlyArray<TicketSales>;
};

export class ReportingAccessDenied extends Schema.TaggedError<ReportingAccessDenied>()(
  '@effective-rsc/example-event-platform/reporting/ReportingAccessDenied',
  { eventId: Schema.String, userId: Schema.String },
) {}

export class ReportingUnavailable extends Schema.TaggedError<ReportingUnavailable>()(
  '@effective-rsc/example-event-platform/reporting/ReportingUnavailable',
  { operation: Schema.String },
) {}
