import { Context, Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import type {
  CheckoutInput,
  CheckoutReceipt,
  RegistrationQuestion,
  TicketType,
} from '@/modules/registration/model';
import {
  RegistrationQuestion as RegistrationQuestionSchema,
  TicketType as TicketTypeSchema,
} from '@/modules/registration/model';

const OrderStatus = Schema.Literals(['pending', 'paid', 'failed', 'cancelled', 'refunded']);
type OrderStatus = typeof OrderStatus.Type;

const OrderRecord = Schema.Struct({
  attendeeSessionToken: Schema.NullOr(Schema.String),
  buyerEmail: Schema.String,
  buyerName: Schema.String,
  checkoutFingerprint: Schema.NullOr(Schema.String),
  currency: Schema.String,
  discountCode: Schema.NullOr(Schema.String),
  discountMinor: Schema.Finite,
  eventId: Schema.String,
  orderId: Schema.String,
  providerReference: Schema.NullOr(Schema.String),
  status: OrderStatus,
  subtotalMinor: Schema.Finite,
  ticketCode: Schema.NullOr(Schema.String),
  ticketId: Schema.NullOr(Schema.String),
  ticketTypeId: Schema.String,
  totalMinor: Schema.Finite,
});
export type OrderRecord = typeof OrderRecord.Type;

export type ReserveOrderResult =
  | { readonly _tag: 'Existing'; readonly order: OrderRecord }
  | { readonly _tag: 'ReplayMismatch'; readonly orderId: string }
  | { readonly _tag: 'Reserved'; readonly order: OrderRecord }
  | { readonly _tag: 'DiscountUnavailable'; readonly code: string }
  | { readonly _tag: 'AnswersInvalid'; readonly reason: string }
  | { readonly _tag: 'SoldOut' }
  | { readonly _tag: 'TicketUnavailable' };

const decodeOrder = Effect.fnUntraced(function* (rows: ReadonlyArray<OrderRecord>) {
  const decoded = yield* Schema.decodeEffect(Schema.Array(OrderRecord))(rows);
  return decoded[0] ?? null;
});

export const checkoutFingerprint = (input: CheckoutInput) =>
  JSON.stringify({
    answers: [...(input.answers ?? [])]
      .map(({ answer, questionId }) => ({ answer: answer.trim(), questionId }))
      .sort((left, right) => left.questionId.localeCompare(right.questionId)),
    buyerEmail: input.buyerEmail.trim().toLowerCase(),
    buyerName: input.buyerName.trim(),
    discountCode: input.discountCode?.trim().toUpperCase() || null,
    paymentMethod: input.paymentMethod,
    ticketTypeId: input.ticketTypeId,
  });

const listQuestions = Effect.fnUntraced(function* (sql: SqlClient, eventId: string) {
  const rows = yield* sql<{
    readonly description: string;
    readonly eventId: string;
    readonly label: string;
    readonly optionsJson: string;
    readonly questionId: string;
    readonly questionType: 'select' | 'text';
    readonly required: number;
    readonly sortOrder: number;
  }>`
    SELECT
      id AS questionId,
      event_id AS eventId,
      label,
      description,
      question_type AS questionType,
      required,
      options_json AS optionsJson,
      sort_order AS sortOrder
    FROM registration_questions
    WHERE event_id = ${eventId}
      AND status = 'active'
    ORDER BY sort_order ASC, created_at ASC
  `;
  const questions = yield* Effect.forEach(rows, (row) =>
    Schema.decodeEffect(Schema.fromJsonString(Schema.Array(Schema.String)))(row.optionsJson).pipe(
      Effect.map(
        (options) =>
          ({
            description: row.description,
            eventId: row.eventId,
            label: row.label,
            options,
            questionId: row.questionId,
            questionType: row.questionType,
            required: row.required === 1,
            sortOrder: row.sortOrder,
          }) satisfies RegistrationQuestion,
      ),
    ),
  );
  return yield* Schema.decodeEffect(Schema.Array(RegistrationQuestionSchema))(questions);
});

const orderById = (sql: SqlClient, orderId: string) =>
  sql<OrderRecord>`
    SELECT
      orders.id AS orderId,
      orders.event_id AS eventId,
      orders.checkout_fingerprint AS checkoutFingerprint,
      orders.attendee_session_token AS attendeeSessionToken,
      orders.buyer_name AS buyerName,
      orders.buyer_email AS buyerEmail,
      orders.status,
      orders.subtotal_minor AS subtotalMinor,
      orders.discount_minor AS discountMinor,
      orders.total_minor AS totalMinor,
      orders.currency,
      discount_codes.code AS discountCode,
      orders.provider_reference AS providerReference,
      order_items.ticket_type_id AS ticketTypeId,
      tickets.id AS ticketId,
      tickets.code AS ticketCode
    FROM orders
    INNER JOIN order_items ON order_items.order_id = orders.id
    LEFT JOIN discount_codes ON discount_codes.id = orders.discount_code_id
    LEFT JOIN tickets ON tickets.order_id = orders.id
    WHERE orders.id = ${orderId}
    LIMIT 1
  `.pipe(Effect.flatMap(decodeOrder));

export class RegistrationRepository extends Context.Service<RegistrationRepository>()(
  '@effective-rsc/example-event-platform/registration/RegistrationRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      return {
        completeOrder: Effect.fn('RegistrationRepository.completeOrder')(function* (
          orderId: string,
          providerReference: string,
          ticketId: string,
          ticketCode: string,
          attendeeSessionToken: string,
          completedAt: string,
        ) {
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const orders = yield* sql<{
                readonly eventId: string;
                readonly ticketTypeId: string;
              }>`
                UPDATE orders
                SET
                  status = 'paid',
                  provider_reference = ${providerReference},
                  attendee_session_token = ${attendeeSessionToken},
                  updated_at = ${completedAt}
                WHERE id = ${orderId}
                  AND status = 'pending'
                RETURNING
                  event_id AS eventId,
                  (
                    SELECT ticket_type_id
                    FROM order_items
                    WHERE order_items.order_id = orders.id
                    LIMIT 1
                  ) AS ticketTypeId
              `;
              const order = orders[0];
              if (order === undefined) {
                return yield* orderById(sql, orderId);
              }

              const inventory = yield* sql<{ readonly ticketTypeId: string }>`
                UPDATE ticket_types
                SET
                  quantity_reserved = quantity_reserved - 1,
                  quantity_sold = quantity_sold + 1
                WHERE id = ${order.ticketTypeId}
                  AND quantity_reserved > 0
                RETURNING id AS ticketTypeId
              `;
              if (inventory.length !== 1) {
                return yield* Effect.die(
                  new TypeError(`Order "${orderId}" has no reserved ticket inventory.`),
                );
              }
              const buyer = yield* sql<{
                readonly buyerEmail: string;
                readonly buyerName: string;
              }>`
                SELECT buyer_name AS buyerName, buyer_email AS buyerEmail
                FROM orders
                WHERE id = ${orderId}
              `;
              const holder = buyer[0];
              if (holder === undefined) {
                return yield* Effect.die(
                  new TypeError(`Order "${orderId}" has no ticket holder identity.`),
                );
              }

              yield* sql`
                INSERT INTO tickets (
                  id,
                  order_id,
                  event_id,
                  ticket_type_id,
                  holder_name,
                  holder_email,
                  code,
                  status,
                  created_at,
                  updated_at
                )
                VALUES (
                  ${ticketId},
                  ${orderId},
                  ${order.eventId},
                  ${order.ticketTypeId},
                  ${holder.buyerName},
                  ${holder.buyerEmail},
                  ${ticketCode},
                  'valid',
                  ${completedAt},
                  ${completedAt}
                )
              `;

              yield* sql`
                INSERT INTO email_outbox (
                  id,
                  recipient,
                  subject,
                  body,
                  aggregate_type,
                  aggregate_id,
                  status,
                  created_at
                )
                VALUES (
                  ${`email-${ticketId}`},
                  ${holder.buyerEmail},
                  ${'Your event ticket'},
                  ${`Your ticket code is ${ticketCode}. Open /attendee/access/${attendeeSessionToken} to access your attendee hub.`},
                  'ticket',
                  ${ticketId},
                  'pending',
                  ${completedAt}
                )
              `;

              yield* sql`
                INSERT OR IGNORE INTO attendee_sessions (
                  token,
                  attendee_email,
                  expires_at,
                  created_at
                )
                VALUES (
                  ${attendeeSessionToken},
                  ${holder.buyerEmail},
                  datetime(${completedAt}, '+30 days'),
                  ${completedAt}
                )
              `;

              return yield* orderById(sql, orderId);
            }),
          );
        }),
        failOrder: Effect.fn('RegistrationRepository.failOrder')(function* (
          orderId: string,
          failedAt: string,
        ) {
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* sql<{
                readonly discountCodeId: string | null;
                readonly ticketTypeId: string;
              }>`
                UPDATE orders
                SET status = 'failed', updated_at = ${failedAt}
                WHERE id = ${orderId}
                  AND status = 'pending'
                RETURNING (
                  SELECT ticket_type_id
                  FROM order_items
                  WHERE order_items.order_id = orders.id
                  LIMIT 1
                ) AS ticketTypeId,
                discount_code_id AS discountCodeId
              `;
              const failed = rows[0];
              if (failed !== undefined) {
                yield* sql`
                  UPDATE ticket_types
                  SET quantity_reserved = quantity_reserved - 1
                  WHERE id = ${failed.ticketTypeId}
                    AND quantity_reserved > 0
                `;
                if (failed.discountCodeId !== null) {
                  yield* sql`
                    UPDATE discount_codes
                    SET redeemed_count = redeemed_count - 1, updated_at = ${failedAt}
                    WHERE id = ${failed.discountCodeId}
                      AND redeemed_count > 0
                  `;
                }
              }

              return failed !== undefined;
            }),
          );
        }),
        findOrder: Effect.fn('RegistrationRepository.findOrder')(function* (orderId: string) {
          return yield* orderById(sql, orderId);
        }),
        listAvailable: Effect.fn('RegistrationRepository.listAvailable')(function* (
          eventId: string,
          now: string,
        ) {
          const rows = yield* sql<TicketType>`
            SELECT
              ticket_types.id AS ticketTypeId,
              ticket_types.event_id AS eventId,
              ticket_types.name,
              ticket_types.description,
              ticket_types.price_minor AS priceMinor,
              ticket_types.currency,
              ticket_types.quantity_total - ticket_types.quantity_reserved - ticket_types.quantity_sold AS available
            FROM ticket_types
            INNER JOIN events ON events.id = ticket_types.event_id
            WHERE ticket_types.event_id = ${eventId}
              AND ticket_types.status = 'active'
              AND events.status = 'published'
              AND datetime(ticket_types.sales_starts_at) <= datetime(${now})
              AND datetime(ticket_types.sales_ends_at) >= datetime(${now})
            ORDER BY ticket_types.price_minor ASC
          `;

          return yield* Schema.decodeEffect(Schema.Array(TicketTypeSchema))(rows);
        }),
        listQuestions: Effect.fn('RegistrationRepository.listQuestions')(function* (
          eventId: string,
        ) {
          return yield* listQuestions(sql, eventId);
        }),
        reserveOrder: Effect.fn('RegistrationRepository.reserveOrder')(function* (
          input: CheckoutInput,
          orderId: string,
          createdAt: string,
        ) {
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const existing = yield* sql<OrderRecord>`
                SELECT
                  orders.id AS orderId,
                  orders.event_id AS eventId,
                  orders.checkout_fingerprint AS checkoutFingerprint,
                  orders.attendee_session_token AS attendeeSessionToken,
                  orders.buyer_name AS buyerName,
                  orders.buyer_email AS buyerEmail,
                  orders.status,
                  orders.subtotal_minor AS subtotalMinor,
                  orders.discount_minor AS discountMinor,
                  orders.total_minor AS totalMinor,
                  orders.currency,
                  discount_codes.code AS discountCode,
                  orders.provider_reference AS providerReference,
                  order_items.ticket_type_id AS ticketTypeId,
                  tickets.id AS ticketId,
                  tickets.code AS ticketCode
                FROM orders
                INNER JOIN order_items ON order_items.order_id = orders.id
                LEFT JOIN discount_codes ON discount_codes.id = orders.discount_code_id
                LEFT JOIN tickets ON tickets.order_id = orders.id
                WHERE orders.event_id = ${input.eventId}
                  AND orders.idempotency_key = ${input.idempotencyKey}
                LIMIT 1
              `.pipe(Effect.flatMap(decodeOrder));
              if (existing !== null) {
                if (existing.checkoutFingerprint !== checkoutFingerprint(input)) {
                  return { orderId: existing.orderId, _tag: 'ReplayMismatch' } as const;
                }
                return { order: existing, _tag: 'Existing' } as const;
              }

              const types = yield* sql<{
                readonly currency: string;
                readonly priceMinor: number;
              }>`
                SELECT
                  ticket_types.price_minor AS priceMinor,
                  ticket_types.currency
                FROM ticket_types
                INNER JOIN events ON events.id = ticket_types.event_id
                WHERE ticket_types.id = ${input.ticketTypeId}
                  AND ticket_types.event_id = ${input.eventId}
                  AND ticket_types.status = 'active'
                  AND events.status = 'published'
                  AND datetime(ticket_types.sales_starts_at) <= datetime(${createdAt})
                  AND datetime(ticket_types.sales_ends_at) >= datetime(${createdAt})
                LIMIT 1
              `;
              const ticketType = types[0];
              if (ticketType === undefined) {
                return { _tag: 'TicketUnavailable' } as const;
              }

              const questions = yield* listQuestions(sql, input.eventId);
              const submittedAnswers = input.answers ?? [];
              const answerIds = submittedAnswers.map((answer) => answer.questionId);
              if (new Set(answerIds).size !== answerIds.length) {
                return {
                  reason: 'Each registration question can only be answered once.',
                  _tag: 'AnswersInvalid',
                } as const;
              }
              const questionIds = new Set(questions.map((question) => question.questionId));
              if (submittedAnswers.some((answer) => !questionIds.has(answer.questionId))) {
                return {
                  reason: 'The registration questions changed. Review your answers and try again.',
                  _tag: 'AnswersInvalid',
                } as const;
              }
              const answers = new Map(
                submittedAnswers.map((answer) => [answer.questionId, answer.answer.trim()]),
              );
              const invalidQuestion = questions.find((question) => {
                const answer = answers.get(question.questionId) ?? '';
                return (
                  (question.required && answer.length === 0) ||
                  (answer.length > 0 &&
                    question.questionType === 'select' &&
                    !question.options.includes(answer))
                );
              });
              if (invalidQuestion !== undefined) {
                return {
                  reason: `Review your answer for “${invalidQuestion.label}”.`,
                  _tag: 'AnswersInvalid',
                } as const;
              }

              const reservations = yield* sql<{ readonly ticketTypeId: string }>`
                UPDATE ticket_types
                SET quantity_reserved = quantity_reserved + 1
                WHERE id = ${input.ticketTypeId}
                  AND quantity_reserved + quantity_sold < quantity_total
                RETURNING id AS ticketTypeId
              `;
              if (reservations.length === 0) {
                return { _tag: 'SoldOut' } as const;
              }

              const discountCode = input.discountCode?.trim().toUpperCase() ?? '';
              let discountCodeId: string | null = null;
              let discountMinor = 0;
              if (discountCode.length > 0) {
                const discounts = yield* sql<{
                  readonly amount: number;
                  readonly code: string;
                  readonly discountCodeId: string;
                  readonly discountType: 'fixed' | 'percent';
                }>`
                  UPDATE discount_codes
                  SET redeemed_count = redeemed_count + 1, updated_at = ${createdAt}
                  WHERE event_id = ${input.eventId}
                    AND code = ${discountCode}
                    AND status = 'active'
                    AND datetime(starts_at) <= datetime(${createdAt})
                    AND datetime(ends_at) >= datetime(${createdAt})
                    AND (max_redemptions IS NULL OR redeemed_count < max_redemptions)
                  RETURNING
                    id AS discountCodeId,
                    code,
                    discount_type AS discountType,
                    amount
                `;
                const discount = discounts[0];
                if (discount === undefined) {
                  yield* sql`
                    UPDATE ticket_types
                    SET quantity_reserved = quantity_reserved - 1
                    WHERE id = ${input.ticketTypeId}
                      AND quantity_reserved > 0
                  `;
                  return { code: discountCode, _tag: 'DiscountUnavailable' } as const;
                }
                discountCodeId = discount.discountCodeId;
                discountMinor = Math.min(
                  ticketType.priceMinor,
                  discount.discountType === 'percent'
                    ? Math.floor((ticketType.priceMinor * discount.amount) / 100)
                    : discount.amount,
                );
              }

              const totalMinor = ticketType.priceMinor - discountMinor;

              yield* sql`
                INSERT INTO orders (
                  id,
                  event_id,
                  idempotency_key,
                  buyer_name,
                  buyer_email,
                  status,
                  subtotal_minor,
                  discount_minor,
                  discount_code_id,
                  checkout_fingerprint,
                  total_minor,
                  currency,
                  created_at,
                  updated_at
                )
                VALUES (
                  ${orderId},
                  ${input.eventId},
                  ${input.idempotencyKey},
                  ${input.buyerName},
                  ${input.buyerEmail},
                  'pending',
                  ${ticketType.priceMinor},
                  ${discountMinor},
                  ${discountCodeId},
                  ${checkoutFingerprint(input)},
                  ${totalMinor},
                  ${ticketType.currency},
                  ${createdAt},
                  ${createdAt}
                )
              `;
              yield* sql`
                INSERT INTO order_items (order_id, ticket_type_id, quantity, unit_price_minor)
                VALUES (${orderId}, ${input.ticketTypeId}, 1, ${ticketType.priceMinor})
              `;
              yield* Effect.forEach(
                questions,
                (question) => {
                  const answer = answers.get(question.questionId) ?? '';
                  return answer.length === 0
                    ? Effect.void
                    : sql`
                        INSERT INTO registration_answers (
                          order_id, question_id, answer, created_at
                        )
                        VALUES (${orderId}, ${question.questionId}, ${answer}, ${createdAt})
                      `.pipe(Effect.asVoid);
                },
                { concurrency: 1 },
              );
              const order = yield* orderById(sql, orderId);

              if (order === null) {
                return yield* Effect.die(
                  new TypeError(`Reserved order "${orderId}" could not be reloaded.`),
                );
              }
              return { order, _tag: 'Reserved' } as const;
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

export const orderReceipt = (order: OrderRecord): CheckoutReceipt | null =>
  order.status === 'paid' &&
  order.attendeeSessionToken !== null &&
  order.providerReference !== null &&
  order.ticketCode !== null &&
  order.ticketId !== null
    ? {
        attendeeAccessPath: `/attendee/access/${order.attendeeSessionToken}`,
        buyerEmail: order.buyerEmail,
        buyerName: order.buyerName,
        currency: order.currency,
        discountCode: order.discountCode,
        discountMinor: order.discountMinor,
        eventId: order.eventId,
        orderId: order.orderId,
        providerReference: order.providerReference,
        subtotalMinor: order.subtotalMinor,
        ticketCode: order.ticketCode,
        ticketId: order.ticketId,
        ticketTypeId: order.ticketTypeId,
        totalMinor: order.totalMinor,
      }
    : null;
