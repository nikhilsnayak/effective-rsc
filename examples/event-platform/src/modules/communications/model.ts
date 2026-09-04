import { Schema } from 'effect';

import { ManagedEventStatus, OrganizationRole } from '@/modules/organizer/model';

export const AnnouncementAudience = Schema.Literals([
  'all_attendees',
  'checked_in',
  'not_checked_in',
]);
export type AnnouncementAudience = typeof AnnouncementAudience.Type;

export const AnnouncementStatus = Schema.Literals(['draft', 'sent']);
export type AnnouncementStatus = typeof AnnouncementStatus.Type;

export const CommunicationEvent = Schema.Struct({
  allAttendees: Schema.Finite,
  checkedInAttendees: Schema.Finite,
  eventId: Schema.String,
  eventName: Schema.String,
  notCheckedInAttendees: Schema.Finite,
  organizationName: Schema.String,
  role: OrganizationRole,
  status: ManagedEventStatus,
});
export type CommunicationEvent = typeof CommunicationEvent.Type;

export const Announcement = Schema.Struct({
  announcementId: Schema.String,
  audience: AnnouncementAudience,
  body: Schema.String,
  createdAt: Schema.String,
  deliveredCount: Schema.Finite,
  pendingCount: Schema.Finite,
  recipientCount: Schema.Finite,
  sentAt: Schema.NullOr(Schema.String),
  status: AnnouncementStatus,
  subject: Schema.String,
  updatedAt: Schema.String,
});
export type Announcement = typeof Announcement.Type;

export type CommunicationsWorkspace = {
  readonly announcements: ReadonlyArray<Announcement>;
  readonly event: CommunicationEvent;
};

export type SaveAnnouncementInput = {
  readonly announcementId: string;
  readonly audience: AnnouncementAudience;
  readonly body: string;
  readonly eventId: string;
  readonly subject: string;
};

export class CommunicationsAccessDenied extends Schema.TaggedError<CommunicationsAccessDenied>()(
  '@effective-rsc/example-event-platform/communications/CommunicationsAccessDenied',
  { eventId: Schema.String, userId: Schema.String },
) {}

export class AnnouncementNotSendable extends Schema.TaggedError<AnnouncementNotSendable>()(
  '@effective-rsc/example-event-platform/communications/AnnouncementNotSendable',
  { announcementId: Schema.String, eventId: Schema.String },
) {}

export class CommunicationsUnavailable extends Schema.TaggedError<CommunicationsUnavailable>()(
  '@effective-rsc/example-event-platform/communications/CommunicationsUnavailable',
  { operation: Schema.String },
) {}
