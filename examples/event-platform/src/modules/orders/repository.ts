import { Context, Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import type { OutboundEmail } from '@/modules/attendee/email-gateway';
import { ManagedOrder, OrderEvent } from '@/modules/orders/model';

const OrderEvents = Schema.Array(OrderEvent);
const ManagedOrders = Schema.Array(ManagedOrder);

export type RefundResult = {
  readonly message: OutboundEmail;
  readonly order: ManagedOrder;
};

export class OrdersRepository extends Context.Service<OrdersRepository>()(
  '@effective-rsc/example-event-platform/orders/OrdersRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      const listOrders = Effect.fn('OrdersRepository.listOrders')(function* (
        userId: string,
        eventId: string,
      ) {
        const rows = yield* sql<ManagedOrder>`
          SELECT
            orders.id AS orderId,
            orders.buyer_name AS buyerName,
            orders.buyer_email AS buyerEmail,
            orders.status,
            orders.total_minor AS totalMinor,
            orders.currency,
            orders.created_at AS createdAt,
            orders.updated_at AS updatedAt,
            COALESCE((
              SELECT group_concat(
                registration_questions.label || ': ' || registration_answers.answer,
                char(10)
              )
              FROM registration_answers
              INNER JOIN registration_questions
                ON registration_questions.id = registration_answers.question_id
              WHERE registration_answers.order_id = orders.id
            ), '') AS registrationAnswers,
            (
              SELECT order_events.reason
              FROM order_events
              WHERE order_events.order_id = orders.id
                AND order_events.action = 'refunded'
              ORDER BY order_events.recorded_at DESC
              LIMIT 1
            ) AS refundReason,
            (
              SELECT order_events.recorded_at
              FROM order_events
              WHERE order_events.order_id = orders.id
                AND order_events.action = 'refunded'
              ORDER BY order_events.recorded_at DESC
              LIMIT 1
            ) AS refundedAt,
            ticket_types.name AS ticketTypeName,
            tickets.code AS ticketCode,
            tickets.status AS ticketStatus
          FROM orders
          INNER JOIN events ON events.id = orders.event_id
          INNER JOIN order_items ON order_items.order_id = orders.id
          INNER JOIN ticket_types ON ticket_types.id = order_items.ticket_type_id
          LEFT JOIN tickets ON tickets.order_id = orders.id
          WHERE orders.event_id = ${eventId}
            AND EXISTS (
              SELECT 1
              FROM organization_memberships
              WHERE organization_memberships.organization_id = events.organization_id
                AND organization_memberships.user_id = ${userId}
                AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
            )
          ORDER BY orders.created_at DESC
        `;

        return yield* Schema.decodeEffect(ManagedOrders)(rows);
      });

      return {
        listOrders,
        loadEvent: Effect.fn('OrdersRepository.loadEvent')(function* (
          userId: string,
          eventId: string,
        ) {
          const rows = yield* sql<OrderEvent>`
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
          const events = yield* Schema.decodeEffect(OrderEvents)(rows);

          return events[0] ?? null;
        }),
        markEmailSent: Effect.fn('OrdersRepository.markEmailSent')(function* (
          emailId: string,
          sentAt: string,
        ) {
          const rows = yield* sql<{ readonly emailId: string }>`
            UPDATE email_outbox
            SET status = 'sent', attempts = attempts + 1, sent_at = ${sentAt}
            WHERE id = ${emailId}
              AND status = 'pending'
            RETURNING id AS emailId
          `;
          return rows.length === 1;
        }),
        refund: Effect.fn('OrdersRepository.refund')(function* (
          userId: string,
          eventId: string,
          orderId: string,
          reason: string,
          refundedAt: string,
        ) {
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* sql<{ readonly buyerEmail: string; readonly buyerName: string }>`
                UPDATE orders
                SET status = 'refunded', updated_at = ${refundedAt}
                WHERE id = ${orderId}
                  AND event_id = ${eventId}
                  AND status = 'paid'
                  AND EXISTS (
                    SELECT 1
                    FROM events
                    INNER JOIN organization_memberships
                      ON organization_memberships.organization_id = events.organization_id
                    WHERE events.id = orders.event_id
                      AND organization_memberships.user_id = ${userId}
                      AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
                  )
                RETURNING buyer_name AS buyerName, buyer_email AS buyerEmail
              `;
              const refunded = rows[0];
              if (refunded === undefined) {
                return null;
              }

              yield* sql`
                UPDATE ticket_types
                SET quantity_sold = MAX(
                  0,
                  quantity_sold - COALESCE((
                    SELECT quantity
                    FROM order_items
                    WHERE order_items.order_id = ${orderId}
                      AND order_items.ticket_type_id = ticket_types.id
                  ), 0)
                )
                WHERE id IN (
                  SELECT ticket_type_id FROM order_items WHERE order_id = ${orderId}
                )
              `;
              yield* sql`
                UPDATE tickets
                SET status = 'cancelled', updated_at = ${refundedAt}
                WHERE order_id = ${orderId}
                  AND status IN ('valid', 'checked_in')
              `;
              yield* sql`
                INSERT INTO order_events (
                  id, order_id, actor_user_id, action, reason, recorded_at
                )
                VALUES (
                  ${`order-event-refund-${orderId}`},
                  ${orderId},
                  ${userId},
                  'refunded',
                  ${reason},
                  ${refundedAt}
                )
              `;

              const emailId = `email-refund-${orderId}`;
              const subject = 'Your event order was refunded';
              const body = `Your order ${orderId} was refunded. Reason: ${reason}`;
              yield* sql`
                INSERT INTO email_outbox (
                  id, recipient, subject, body, aggregate_type, aggregate_id, status, created_at
                )
                VALUES (
                  ${emailId},
                  ${refunded.buyerEmail},
                  ${subject},
                  ${body},
                  'order',
                  ${orderId},
                  'pending',
                  ${refundedAt}
                )
              `;

              const orders = yield* listOrders(userId, eventId);
              const order = orders.find((candidate) => candidate.orderId === orderId);
              if (order === undefined) {
                return yield* Effect.die(
                  new TypeError(`Refunded order "${orderId}" could not be reloaded.`),
                );
              }
              return {
                message: { body, emailId, recipient: refunded.buyerEmail, subject },
                order,
              } satisfies RefundResult;
            }),
          );
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
  static readonly layerTest = Layer.mock(this);
}
