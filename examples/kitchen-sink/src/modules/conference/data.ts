import type { Duration } from 'effect';

import type {
  Conference,
  ConferenceDay,
  ScheduleDefinition,
  SessionDefinition,
  Speaker,
} from './model';

export const conference = {
  dates: '22–23 August 2026',
  location: 'Bengaluru, India',
  name: 'effective-rsc Conf',
  tagline: 'Two days on React Server Components and the Effect runtime.',
  venue: 'Bangalore International Centre',
  year: 2026,
} satisfies Conference;

export const schedules = {
  saturday: {
    calendarDate: '2026-08-22',
    date: '22 August',
    day: 'saturday',
    label: 'Saturday',
    sessions: [
      {
        description:
          'A ground-up look at Flight, full-document streaming, and the module graphs behind a Server Component application.',
        endsAt: '10:15',
        id: 'server-components-from-first-principles',
        room: 'Auditorium',
        speakerId: 'nikhil-nayak',
        startsAt: '09:30',
        title: 'Server Components from first principles',
        track: 'Architecture',
      },
      {
        description:
          'What changes when typed errors, interruption, resources, and observability are the foundation of an application runtime?',
        endsAt: '11:30',
        id: 'effect-is-the-runtime',
        room: 'Auditorium',
        speakerId: 'maya-iyer',
        startsAt: '10:45',
        title: 'Effect is the runtime, not a utility belt',
        track: 'Platform',
      },
      {
        description:
          'Using Suspense, transitions, and the Navigation API to make the URL and the revealed interface commit as one event.',
        endsAt: '12:45',
        id: 'router-that-waits-for-ui',
        room: 'Studio',
        speakerId: 'theo-martins',
        startsAt: '12:00',
        title: 'A router that waits for the UI',
        track: 'Platform',
      },
      {
        description:
          'Practical design techniques for loading, cancellation, optimistic state, and interfaces that remain composed under pressure.',
        endsAt: '15:15',
        id: 'designing-for-interruption',
        room: 'Studio',
        speakerId: 'leena-shah',
        startsAt: '14:30',
        title: 'Designing for interruption',
        track: 'Craft',
      },
    ],
  },
  sunday: {
    calendarDate: '2026-08-23',
    date: '23 August',
    day: 'sunday',
    label: 'Sunday',
    sessions: [
      {
        description:
          'A segment-oriented cache model for instant navigation without turning the whole application into a stale snapshot.',
        endsAt: '10:15',
        id: 'cache-the-work-not-the-page',
        room: 'Auditorium',
        speakerId: 'rohan-mehta',
        startsAt: '09:30',
        title: 'Cache the work, not the page',
        track: 'Architecture',
      },
      {
        description:
          'Preserving React’s native mutation protocol while adding typed inputs, failures, and application-managed lifetimes.',
        endsAt: '11:30',
        id: 'mutation-protocols-that-compose',
        room: 'Studio',
        speakerId: 'anika-rao',
        startsAt: '10:45',
        title: 'Mutation protocols that compose',
        track: 'Platform',
      },
      {
        description:
          'A tour of the modern browser APIs that let frameworks become smaller while application interactions become richer.',
        endsAt: '12:45',
        id: 'browser-is-the-platform',
        room: 'Auditorium',
        speakerId: 'jonah-kim',
        startsAt: '12:00',
        title: 'The browser is the platform',
        track: 'Platform',
      },
    ],
  },
} satisfies Record<ConferenceDay, ScheduleDefinition>;

export const speakers: ReadonlyMap<
  string,
  { readonly latency: Duration.Input; readonly speaker: Speaker }
> = new Map([
  [
    'nikhil-nayak',
    {
      latency: '180 millis',
      speaker: { id: 'nikhil-nayak', name: 'Nikhil Nayak', role: 'Creator, effective-rsc' },
    },
  ],
  [
    'maya-iyer',
    {
      latency: '420 millis',
      speaker: { id: 'maya-iyer', name: 'Maya Iyer', role: 'Runtime engineer' },
    },
  ],
  [
    'theo-martins',
    {
      latency: '700 millis',
      speaker: {
        id: 'theo-martins',
        name: 'Theo Martins',
        role: 'Browser platform engineer',
      },
    },
  ],
  [
    'leena-shah',
    {
      latency: '960 millis',
      speaker: { id: 'leena-shah', name: 'Leena Shah', role: 'Design engineer' },
    },
  ],
  [
    'rohan-mehta',
    {
      latency: '240 millis',
      speaker: { id: 'rohan-mehta', name: 'Rohan Mehta', role: 'Framework engineer' },
    },
  ],
  [
    'anika-rao',
    {
      latency: '540 millis',
      speaker: { id: 'anika-rao', name: 'Anika Rao', role: 'Type systems researcher' },
    },
  ],
  [
    'jonah-kim',
    {
      latency: '840 millis',
      speaker: { id: 'jonah-kim', name: 'Jonah Kim', role: 'Web platform lead' },
    },
  ],
]);

type IndexedSession = {
  readonly calendarDate: string;
  readonly dayLabel: string;
  readonly session: SessionDefinition;
};

export const sessionById: ReadonlyMap<string, IndexedSession> = new Map(
  Object.values(schedules).flatMap((schedule) =>
    schedule.sessions.map(
      (session) =>
        [
          session.id,
          { calendarDate: schedule.calendarDate, dayLabel: schedule.label, session },
        ] satisfies readonly [string, IndexedSession],
    ),
  ),
);
