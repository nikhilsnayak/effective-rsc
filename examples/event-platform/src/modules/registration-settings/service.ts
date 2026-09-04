import { Context, DateTime, Effect, Layer } from 'effect';

import {
  type CreateRegistrationQuestionInput,
  RegistrationQuestionInvalid,
  RegistrationQuestionUnavailable,
  RegistrationSettingsAccessDenied,
  RegistrationSettingsUnavailable,
  type RegistrationSettingsWorkspace,
} from '@/modules/registration-settings/model';
import { RegistrationSettingsRepository } from '@/modules/registration-settings/repository';

const unavailable = (operation: string) =>
  Effect.mapError(() => new RegistrationSettingsUnavailable({ operation }));

export type RegistrationSettingsError =
  | RegistrationQuestionInvalid
  | RegistrationQuestionUnavailable
  | RegistrationSettingsAccessDenied
  | RegistrationSettingsUnavailable;

export class RegistrationSettingsService extends Context.Service<RegistrationSettingsService>()(
  '@effective-rsc/example-event-platform/registration-settings/RegistrationSettingsService',
  {
    make: Effect.gen(function* () {
      const repository = yield* RegistrationSettingsRepository;

      const authorize = Effect.fnUntraced(function* (userId: string, eventId: string) {
        const event = yield* repository
          .loadEvent(userId, eventId)
          .pipe(unavailable('authorize registration settings'));
        if (event === null) {
          return yield* new RegistrationSettingsAccessDenied({ eventId, userId });
        }
        return event;
      });

      return {
        archive: Effect.fn('RegistrationSettingsService.archive')(function* (
          userId: string,
          eventId: string,
          questionId: string,
        ) {
          yield* authorize(userId, eventId);
          const now = yield* DateTime.now;
          const archived = yield* repository
            .archive(userId, eventId, questionId, DateTime.formatIso(now))
            .pipe(unavailable('archive registration question'));
          if (!archived) {
            return yield* new RegistrationQuestionUnavailable({ questionId });
          }
        }),
        create: Effect.fn('RegistrationSettingsService.create')(function* (
          userId: string,
          input: CreateRegistrationQuestionInput,
        ) {
          yield* authorize(userId, input.eventId);
          const options = [
            ...new Set(input.options.map((option) => option.trim()).filter(Boolean)),
          ];
          if (input.questionType === 'select' && options.length < 2) {
            return yield* new RegistrationQuestionInvalid({
              reason: 'Select questions need at least two distinct options.',
            });
          }
          const now = yield* DateTime.now;
          const created = yield* repository
            .create(
              userId,
              { ...input, options: input.questionType === 'select' ? options : [] },
              DateTime.formatIso(now),
            )
            .pipe(unavailable('create registration question'));
          if (!created) {
            return yield* new RegistrationSettingsAccessDenied({
              eventId: input.eventId,
              userId,
            });
          }
        }),
        workspace: Effect.fn('RegistrationSettingsService.workspace')(function* (
          userId: string,
          eventId: string,
        ): Effect.fn.Return<
          RegistrationSettingsWorkspace,
          RegistrationSettingsAccessDenied | RegistrationSettingsUnavailable
        > {
          const event = yield* authorize(userId, eventId);
          const questions = yield* repository
            .listQuestions(userId, eventId)
            .pipe(unavailable('load registration settings'));
          return { event, questions };
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
