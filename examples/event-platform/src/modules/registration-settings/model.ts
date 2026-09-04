import { Schema } from 'effect';

import { ManagedEventStatus, OrganizationRole } from '@/modules/organizer/model';
import {
  RegistrationQuestionType,
  type RegistrationQuestionType as RegistrationQuestionTypeValue,
} from '@/modules/registration/model';

export const ManagedRegistrationQuestion = Schema.Struct({
  description: Schema.String,
  label: Schema.String,
  options: Schema.Array(Schema.String),
  questionId: Schema.String,
  questionType: RegistrationQuestionType,
  required: Schema.Boolean,
  sortOrder: Schema.Finite,
  status: Schema.Literals(['active', 'archived']),
});
export type ManagedRegistrationQuestion = typeof ManagedRegistrationQuestion.Type;

export const RegistrationSettingsEvent = Schema.Struct({
  eventId: Schema.String,
  eventName: Schema.String,
  organizationName: Schema.String,
  role: OrganizationRole,
  status: ManagedEventStatus,
});
export type RegistrationSettingsEvent = typeof RegistrationSettingsEvent.Type;

export type CreateRegistrationQuestionInput = {
  readonly description: string;
  readonly eventId: string;
  readonly label: string;
  readonly options: ReadonlyArray<string>;
  readonly questionId: string;
  readonly questionType: RegistrationQuestionTypeValue;
  readonly required: boolean;
};

export type RegistrationSettingsWorkspace = {
  readonly event: RegistrationSettingsEvent;
  readonly questions: ReadonlyArray<ManagedRegistrationQuestion>;
};

export class RegistrationSettingsAccessDenied extends Schema.TaggedError<RegistrationSettingsAccessDenied>()(
  '@effective-rsc/example-event-platform/registration-settings/RegistrationSettingsAccessDenied',
  { eventId: Schema.String, userId: Schema.String },
) {}

export class RegistrationQuestionInvalid extends Schema.TaggedError<RegistrationQuestionInvalid>()(
  '@effective-rsc/example-event-platform/registration-settings/RegistrationQuestionInvalid',
  { reason: Schema.String },
) {}

export class RegistrationQuestionUnavailable extends Schema.TaggedError<RegistrationQuestionUnavailable>()(
  '@effective-rsc/example-event-platform/registration-settings/RegistrationQuestionUnavailable',
  { questionId: Schema.String },
) {}

export class RegistrationSettingsUnavailable extends Schema.TaggedError<RegistrationSettingsUnavailable>()(
  '@effective-rsc/example-event-platform/registration-settings/RegistrationSettingsUnavailable',
  { operation: Schema.String },
) {}
