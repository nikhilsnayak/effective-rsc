'use server';

import { Effect, Schema } from 'effect';

import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';
import type { RegistrationSettingsError } from '@/modules/registration-settings/service';
import { RegistrationSettingsService } from '@/modules/registration-settings/service';

export type RegistrationSettingsMutationState =
  | { readonly message: string; readonly status: 'success' }
  | { readonly message: string; readonly status: 'error' };

const RequiredText = (maximum: number) =>
  Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1), Schema.isMaxLength(maximum));
const CreateInput = Schema.fromFormData(
  Schema.Struct({
    description: Schema.String.check(Schema.isTrimmed(), Schema.isMaxLength(500)),
    eventId: Schema.NonEmptyString,
    label: RequiredText(160),
    options: Schema.String.check(Schema.isTrimmed(), Schema.isMaxLength(1_000)),
    questionId: Schema.String.check(Schema.isUUID()),
    questionType: Schema.Literals(['text', 'select']),
    required: Schema.Literals(['true', 'false']),
  }),
);
const ArchiveInput = Schema.fromFormData(
  Schema.Struct({
    eventId: Schema.NonEmptyString,
    questionId: Schema.NonEmptyString,
  }),
);

const failureState = (error: RegistrationSettingsError): RegistrationSettingsMutationState => {
  switch (error._tag) {
    case '@effective-rsc/example-event-platform/registration-settings/RegistrationSettingsAccessDenied':
      return { message: 'Your organizer role cannot change registration.', status: 'error' };
    case '@effective-rsc/example-event-platform/registration-settings/RegistrationQuestionInvalid':
      return { message: error.reason, status: 'error' };
    case '@effective-rsc/example-event-platform/registration-settings/RegistrationQuestionUnavailable':
      return { message: 'That question is unavailable or already archived.', status: 'error' };
    case '@effective-rsc/example-event-platform/registration-settings/RegistrationSettingsUnavailable':
      return { message: 'Registration settings are temporarily unavailable.', status: 'error' };
  }
};

export const createRegistrationQuestion = OrganizerERSC.ServerFn.make({
  input: CreateInput,
  handler: Effect.fn('createRegistrationQuestion')(function* (input) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* RegistrationSettingsService;
    return yield* service
      .create(userId, {
        ...input,
        options: input.options.split(/[\n,]/),
        required: input.required === 'true',
      })
      .pipe(
        Effect.as({ message: 'Registration question created.', status: 'success' } as const),
        Effect.catch((error) => Effect.succeed(failureState(error))),
      );
  }),
});

export const archiveRegistrationQuestion = OrganizerERSC.ServerFn.make({
  input: ArchiveInput,
  handler: Effect.fn('archiveRegistrationQuestion')(function* ({ eventId, questionId }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* RegistrationSettingsService;
    return yield* service.archive(userId, eventId, questionId).pipe(
      Effect.as({ message: 'Registration question archived.', status: 'success' } as const),
      Effect.catch((error) => Effect.succeed(failureState(error))),
    );
  }),
});
