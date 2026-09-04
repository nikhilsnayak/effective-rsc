import { Schema } from 'effect';

export const OrganizationRole = Schema.Literals([
  'owner',
  'admin',
  'event_manager',
  'check_in_staff',
  'viewer',
]);
export type OrganizationRole = typeof OrganizationRole.Type;

export const ManagedEventStatus = Schema.Literals(['draft', 'published', 'cancelled', 'completed']);
export type ManagedEventStatus = typeof ManagedEventStatus.Type;
export type EventTransitionTarget = Exclude<ManagedEventStatus, 'draft'>;

export const ManagedEvent = Schema.Struct({
  endsAt: Schema.String,
  eventId: Schema.String,
  eventSlug: Schema.String,
  name: Schema.String,
  organizationId: Schema.String,
  startsAt: Schema.String,
  status: ManagedEventStatus,
  updatedAt: Schema.String,
});
export type ManagedEvent = typeof ManagedEvent.Type;

export const ManagedOrganization = Schema.Struct({
  name: Schema.String,
  organizationId: Schema.String,
  organizationSlug: Schema.String,
  role: OrganizationRole,
});
export type ManagedOrganization = typeof ManagedOrganization.Type;

export const OrganizerUser = Schema.Struct({
  email: Schema.String,
  name: Schema.String,
  userId: Schema.String,
});
export type OrganizerUser = typeof OrganizerUser.Type;

export type OrganizationWorkspace = ManagedOrganization & {
  readonly events: ReadonlyArray<ManagedEvent>;
};

export type OrganizerDashboard = {
  readonly organizations: ReadonlyArray<OrganizationWorkspace>;
  readonly user: OrganizerUser;
};

export class OrganizerUnavailable extends Schema.TaggedError<OrganizerUnavailable>()(
  '@effective-rsc/example-event-platform/organizer/OrganizerUnavailable',
  { operation: Schema.String },
) {}

export class OrganizerAccessDenied extends Schema.TaggedError<OrganizerAccessDenied>()(
  '@effective-rsc/example-event-platform/organizer/OrganizerAccessDenied',
  { resourceId: Schema.String, userId: Schema.String },
) {}

export class EventStatusTransitionRejected extends Schema.TaggedError<EventStatusTransitionRejected>()(
  '@effective-rsc/example-event-platform/organizer/EventStatusTransitionRejected',
  {
    currentStatus: ManagedEventStatus,
    eventId: Schema.String,
    targetStatus: ManagedEventStatus,
  },
) {}

export class EventConcurrentUpdate extends Schema.TaggedError<EventConcurrentUpdate>()(
  '@effective-rsc/example-event-platform/organizer/EventConcurrentUpdate',
  { eventId: Schema.String },
) {}
