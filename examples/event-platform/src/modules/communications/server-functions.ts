'use server';

import { Effect, Schema } from 'effect';

import { AnnouncementAudience } from '@/modules/communications/model';
import type { CommunicationsError } from '@/modules/communications/service';
import { CommunicationsService } from '@/modules/communications/service';
import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';

const CommunicationsMutationState = Schema.Union([
  Schema.Struct({ message: Schema.String, status: Schema.Literal('success') }),
  Schema.Struct({ message: Schema.String, status: Schema.Literal('error') }),
]);
export type CommunicationsMutationState = typeof CommunicationsMutationState.Type;

const RequiredText = (maximum: number) =>
  Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1), Schema.isMaxLength(maximum));

const SaveAnnouncementInput = Schema.fromFormData(
  Schema.Struct({
    announcementId: Schema.NonEmptyString,
    audience: AnnouncementAudience,
    body: RequiredText(4_000),
    eventId: Schema.NonEmptyString,
    subject: RequiredText(160),
  }),
);
const SendAnnouncementInput = Schema.fromFormData(
  Schema.Struct({
    announcementId: Schema.NonEmptyString,
    eventId: Schema.NonEmptyString,
  }),
);

const failureState = (error: CommunicationsError): CommunicationsMutationState => {
  switch (error._tag) {
    case '@effective-rsc/example-event-platform/communications/CommunicationsAccessDenied':
      return { message: 'Your organizer role cannot manage communications.', status: 'error' };
    case '@effective-rsc/example-event-platform/communications/AnnouncementNotSendable':
      return { message: 'That announcement is unavailable or was already sent.', status: 'error' };
    case '@effective-rsc/example-event-platform/communications/CommunicationsUnavailable':
      return { message: 'Communications are temporarily unavailable.', status: 'error' };
  }
};

const result = <A>(effect: Effect.Effect<A, CommunicationsError>, message: (value: A) => string) =>
  effect.pipe(
    Effect.map((value) => ({ message: message(value), status: 'success' }) as const),
    Effect.catch((error) => Effect.succeed(failureState(error))),
  );

export const saveAnnouncement = OrganizerERSC.ServerFn.make({
  input: [Schema.NullOr(CommunicationsMutationState), SaveAnnouncementInput],
  handler: Effect.fn('saveAnnouncement')(function* (_previousState, input) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* CommunicationsService;
    return yield* result(service.saveDraft(userId, input), () => 'Announcement draft saved.');
  }),
});

export const sendAnnouncement = OrganizerERSC.ServerFn.make({
  input: [Schema.NullOr(CommunicationsMutationState), SendAnnouncementInput],
  handler: Effect.fn('sendAnnouncement')(function* (_previousState, { announcementId, eventId }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* CommunicationsService;
    return yield* result(service.send(userId, eventId, announcementId), ({ recipientCount }) =>
      recipientCount === 0
        ? 'No pending deliveries.'
        : recipientCount === 1
          ? 'Announcement delivered to 1 attendee.'
          : `Announcement delivered to ${recipientCount} attendees.`,
    );
  }),
});
