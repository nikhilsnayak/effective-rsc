import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { RegistrationSettingsRepository } from '@/modules/registration-settings/repository';
import { RegistrationRepository } from '@/modules/registration/repository';
import { runMigrations } from '@/persistence/Migrations';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const RepositoryLayer = Layer.merge(
  RegistrationRepository.layer,
  RegistrationSettingsRepository.layer,
).pipe(Layer.provide(PersistenceLayer));

const eventId = 'event-effect-systems-summit-2026';

describe('RegistrationSettingsRepository', () => {
  it.effect('creates and archives a question without discarding its definition', () =>
    Effect.gen(function* () {
      const settings = yield* RegistrationSettingsRepository;
      const registration = yield* RegistrationRepository;
      const created = yield* settings.create(
        'user-maya',
        {
          description: 'Used to plan room accessibility.',
          eventId,
          label: 'Accessibility requirements',
          options: [],
          questionId: 'question-test-accessibility',
          questionType: 'text',
          required: false,
        },
        '2026-09-04T09:00:00Z',
      );
      expect(created).toBe(true);

      const publicQuestions = yield* registration.listQuestions(eventId);
      expect(
        publicQuestions.some((question) => question.questionId === 'question-test-accessibility'),
      ).toBe(true);

      const archived = yield* settings.archive(
        'user-maya',
        eventId,
        'question-test-accessibility',
        '2026-09-04T09:01:00Z',
      );
      expect(archived).toBe(true);
      const afterArchive = yield* registration.listQuestions(eventId);
      expect(
        afterArchive.some((question) => question.questionId === 'question-test-accessibility'),
      ).toBe(false);

      const managedQuestions = yield* settings.listQuestions('user-maya', eventId);
      expect(
        managedQuestions.find((question) => question.questionId === 'question-test-accessibility')
          ?.status,
      ).toBe('archived');
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('does not create questions for an unauthorized organizer', () =>
    Effect.gen(function* () {
      const settings = yield* RegistrationSettingsRepository;
      const created = yield* settings.create(
        'user-nikhil',
        {
          description: '',
          eventId,
          label: 'Unauthorized question',
          options: [],
          questionId: 'question-test-unauthorized',
          questionType: 'text',
          required: false,
        },
        '2026-09-04T09:00:00Z',
      );
      expect(created).toBe(false);
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
