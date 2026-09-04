import { Context, Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import {
  type CreateRegistrationQuestionInput,
  type ManagedRegistrationQuestion,
  ManagedRegistrationQuestion as ManagedRegistrationQuestionSchema,
  RegistrationSettingsEvent,
} from '@/modules/registration-settings/model';

const ManagedQuestions = Schema.Array(ManagedRegistrationQuestionSchema);
const SettingsEvents = Schema.Array(RegistrationSettingsEvent);
const OptionsFromJson = Schema.fromJsonString(Schema.Array(Schema.String));

const listQuestions = Effect.fnUntraced(function* (
  sql: SqlClient,
  userId: string,
  eventId: string,
) {
  const rows = yield* sql<{
    readonly description: string;
    readonly label: string;
    readonly optionsJson: string;
    readonly questionId: string;
    readonly questionType: 'select' | 'text';
    readonly required: number;
    readonly sortOrder: number;
    readonly status: 'active' | 'archived';
  }>`
    SELECT
      registration_questions.id AS questionId,
      registration_questions.label,
      registration_questions.description,
      registration_questions.question_type AS questionType,
      registration_questions.required,
      registration_questions.options_json AS optionsJson,
      registration_questions.sort_order AS sortOrder,
      registration_questions.status
    FROM registration_questions
    INNER JOIN events ON events.id = registration_questions.event_id
    WHERE registration_questions.event_id = ${eventId}
      AND EXISTS (
        SELECT 1
        FROM organization_memberships
        WHERE organization_memberships.organization_id = events.organization_id
          AND organization_memberships.user_id = ${userId}
          AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
      )
    ORDER BY registration_questions.sort_order ASC, registration_questions.created_at ASC
  `;
  const questions = yield* Effect.forEach(rows, (row) =>
    Schema.decodeEffect(OptionsFromJson)(row.optionsJson).pipe(
      Effect.map(
        (options) =>
          ({
            description: row.description,
            label: row.label,
            options,
            questionId: row.questionId,
            questionType: row.questionType,
            required: row.required === 1,
            sortOrder: row.sortOrder,
            status: row.status,
          }) satisfies ManagedRegistrationQuestion,
      ),
    ),
  );
  return yield* Schema.decodeEffect(ManagedQuestions)(questions);
});

export class RegistrationSettingsRepository extends Context.Service<RegistrationSettingsRepository>()(
  '@effective-rsc/example-event-platform/registration-settings/RegistrationSettingsRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      return {
        archive: Effect.fn('RegistrationSettingsRepository.archive')(function* (
          userId: string,
          eventId: string,
          questionId: string,
          archivedAt: string,
        ) {
          const rows = yield* sql<{ readonly questionId: string }>`
            UPDATE registration_questions
            SET status = 'archived', updated_at = ${archivedAt}
            WHERE id = ${questionId}
              AND event_id = ${eventId}
              AND status = 'active'
              AND EXISTS (
                SELECT 1
                FROM events
                INNER JOIN organization_memberships
                  ON organization_memberships.organization_id = events.organization_id
                WHERE events.id = registration_questions.event_id
                  AND organization_memberships.user_id = ${userId}
                  AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
              )
            RETURNING id AS questionId
          `;
          return rows.length === 1;
        }),
        create: Effect.fn('RegistrationSettingsRepository.create')(function* (
          userId: string,
          input: CreateRegistrationQuestionInput,
          createdAt: string,
        ) {
          const optionsJson = yield* Schema.encodeEffect(OptionsFromJson)(input.options);
          const rows = yield* sql<{ readonly questionId: string }>`
            INSERT INTO registration_questions (
              id,
              event_id,
              label,
              description,
              question_type,
              required,
              options_json,
              sort_order,
              status,
              created_at,
              updated_at
            )
            SELECT
              ${input.questionId},
              ${input.eventId},
              ${input.label},
              ${input.description},
              ${input.questionType},
              ${input.required ? 1 : 0},
              ${optionsJson},
              COALESCE((
                SELECT MAX(sort_order) + 10
                FROM registration_questions
                WHERE event_id = ${input.eventId}
              ), 10),
              'active',
              ${createdAt},
              ${createdAt}
            WHERE EXISTS (
              SELECT 1
              FROM events
              INNER JOIN organization_memberships
                ON organization_memberships.organization_id = events.organization_id
              WHERE events.id = ${input.eventId}
                AND organization_memberships.user_id = ${userId}
                AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
            )
            RETURNING id AS questionId
          `;
          return rows.length === 1;
        }),
        listQuestions: Effect.fn('RegistrationSettingsRepository.listQuestions')(function* (
          userId: string,
          eventId: string,
        ) {
          return yield* listQuestions(sql, userId, eventId);
        }),
        loadEvent: Effect.fn('RegistrationSettingsRepository.loadEvent')(function* (
          userId: string,
          eventId: string,
        ) {
          const rows = yield* sql<RegistrationSettingsEvent>`
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
          const events = yield* Schema.decodeEffect(SettingsEvents)(rows);
          return events[0] ?? null;
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
  static readonly layerTest = Layer.mock(this);
}
