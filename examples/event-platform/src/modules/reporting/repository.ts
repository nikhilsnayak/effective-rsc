import { Context, Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import { PaymentOutcome, ReportEvent, SalesSummary, TicketSales } from '@/modules/reporting/model';

const ReportEvents = Schema.Array(ReportEvent);
const SalesSummaries = Schema.Array(SalesSummary);
const TicketSalesRows = Schema.Array(TicketSales);
const PaymentOutcomes = Schema.Array(PaymentOutcome);

export class ReportingRepository extends Context.Service<ReportingRepository>()(
  '@effective-rsc/example-event-platform/reporting/ReportingRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      return {
        loadEvent: Effect.fn('ReportingRepository.loadEvent')(function* (
          userId: string,
          eventId: string,
        ) {
          const rows = yield* sql<ReportEvent>`
            SELECT
              events.id AS eventId,
              events.name AS eventName,
              events.status,
              organizations.name AS organizationName,
              organization_memberships.role
            FROM events
            INNER JOIN organizations ON organizations.id = events.organization_id
            INNER JOIN organization_memberships
              ON organization_memberships.organization_id = events.organization_id
            WHERE events.id = ${eventId}
              AND organization_memberships.user_id = ${userId}
              AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
            LIMIT 1
          `;
          const events = yield* Schema.decodeEffect(ReportEvents)(rows);

          return events[0] ?? null;
        }),
        loadPayments: Effect.fn('ReportingRepository.loadPayments')(function* (
          userId: string,
          eventId: string,
        ) {
          const rows = yield* sql<PaymentOutcome>`
            SELECT
              orders.status,
              orders.currency,
              COUNT(*) AS orderCount,
              COALESCE(SUM(orders.total_minor), 0) AS totalMinor
            FROM orders
            INNER JOIN events ON events.id = orders.event_id
            WHERE orders.event_id = ${eventId}
              AND EXISTS (
                SELECT 1
                FROM organization_memberships
                WHERE organization_memberships.organization_id = events.organization_id
                  AND organization_memberships.user_id = ${userId}
                  AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
              )
            GROUP BY orders.status, orders.currency
            ORDER BY orders.status, orders.currency
          `;

          return yield* Schema.decodeEffect(PaymentOutcomes)(rows);
        }),
        loadSummary: Effect.fn('ReportingRepository.loadSummary')(function* (
          userId: string,
          eventId: string,
        ) {
          const rows = yield* sql<SalesSummary>`
            SELECT
              COALESCE(SUM(ticket_types.quantity_total), 0) AS capacity,
              COALESCE(SUM(ticket_types.quantity_reserved), 0) AS reservedTickets,
              COALESCE(SUM(ticket_types.quantity_sold), 0) AS soldTickets,
              (
                SELECT COUNT(*)
                FROM tickets
                WHERE tickets.event_id = events.id
                  AND tickets.status != 'cancelled'
              ) AS issuedTickets,
              (
                SELECT COUNT(*)
                FROM tickets
                WHERE tickets.event_id = events.id
                  AND tickets.status = 'checked_in'
              ) AS checkedInTickets
            FROM events
            LEFT JOIN ticket_types ON ticket_types.event_id = events.id
            WHERE events.id = ${eventId}
              AND EXISTS (
                SELECT 1
                FROM organization_memberships
                WHERE organization_memberships.organization_id = events.organization_id
                  AND organization_memberships.user_id = ${userId}
                  AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
              )
            GROUP BY events.id
          `;
          const summaries = yield* Schema.decodeEffect(SalesSummaries)(rows);

          return summaries[0] ?? null;
        }),
        loadTicketSales: Effect.fn('ReportingRepository.loadTicketSales')(function* (
          userId: string,
          eventId: string,
        ) {
          const rows = yield* sql<TicketSales>`
            SELECT
              ticket_types.id AS ticketTypeId,
              ticket_types.name,
              ticket_types.price_minor AS priceMinor,
              ticket_types.currency,
              ticket_types.quantity_total AS quantityTotal,
              ticket_types.quantity_reserved AS quantityReserved,
              ticket_types.quantity_sold AS quantitySold
            FROM ticket_types
            INNER JOIN events ON events.id = ticket_types.event_id
            WHERE ticket_types.event_id = ${eventId}
              AND EXISTS (
                SELECT 1
                FROM organization_memberships
                WHERE organization_memberships.organization_id = events.organization_id
                  AND organization_memberships.user_id = ${userId}
                  AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
              )
            ORDER BY ticket_types.price_minor DESC, ticket_types.name
          `;

          return yield* Schema.decodeEffect(TicketSalesRows)(rows);
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
  static readonly layerTest = Layer.mock(this);
}
