import { Clock, Context, Duration, Effect, Layer, MutableRef } from 'effect';

export type ConferenceDay = 'saturday' | 'sunday';

export type Conference = {
  readonly dates: string;
  readonly location: string;
  readonly name: string;
  readonly tagline: string;
  readonly venue: string;
  readonly year: number;
};

export type Session = {
  readonly description: string;
  readonly endsAt: string;
  readonly id: string;
  readonly isInAgenda: boolean;
  readonly room: string;
  readonly speakerId: string;
  readonly startsAt: string;
  readonly title: string;
  readonly track: 'Architecture' | 'Craft' | 'Platform';
};

export type Speaker = {
  readonly id: string;
  readonly name: string;
  readonly role: string;
};

export type Schedule = {
  readonly date: string;
  readonly day: ConferenceDay;
  readonly label: string;
  readonly sessions: ReadonlyArray<Session>;
};

type SessionDefinition = Omit<Session, 'isInAgenda'>;

type ScheduleDefinition = Omit<Schedule, 'sessions'> & {
  readonly sessions: ReadonlyArray<SessionDefinition>;
};

export type AgendaItem = Pick<Session, 'endsAt' | 'id' | 'room' | 'startsAt' | 'title'> & {
  readonly dayLabel: string;
};

export type ObservedQuery<Value> = {
  readonly completedAt: number;
  readonly data: Value;
  readonly startedAt: number;
};

type QueryOptions<Value> = {
  readonly latency: Duration.Input;
  readonly value: Value;
};

const query = Effect.fnUntraced(function* <Value>({ latency, value }: QueryOptions<Value>) {
  const startedAt = yield* Clock.currentTimeMillis;
  yield* Effect.sleep(latency);
  const completedAt = yield* Clock.currentTimeMillis;

  return { completedAt, data: value, startedAt } satisfies ObservedQuery<Value>;
});

const conference = {
  dates: '22–23 August 2026',
  location: 'Bengaluru, India',
  name: 'Converge',
  tagline: 'Two days for people building ambitious software.',
  venue: 'Bangalore International Centre',
  year: 2026,
} satisfies Conference;

const schedules = {
  saturday: {
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
} as const satisfies Record<ConferenceDay, ScheduleDefinition>;

const speakers: ReadonlyMap<
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

const initialAgenda = new Set([
  'server-components-from-first-principles',
  'mutation-protocols-that-compose',
]);
const selectedSessionIds = MutableRef.make<ReadonlySet<string>>(initialAgenda);

const sessionById: ReadonlyMap<
  string,
  { readonly dayLabel: string; readonly session: SessionDefinition }
> = new Map(
  Object.values(schedules).flatMap((schedule) =>
    schedule.sessions.map(
      (session) => [session.id, { dayLabel: schedule.label, session }] as const,
    ),
  ),
);

export class ConferenceRepository extends Context.Service<ConferenceRepository>()(
  '@effective-rsc/example-kitchen-sink/conference/ConferenceRepository',
  {
    make: Effect.succeed({
      agenda: Effect.sync(() => MutableRef.get(selectedSessionIds)).pipe(
        Effect.flatMap((selectedIds) => {
          const items: Array<AgendaItem> = [];
          for (const [sessionId, { dayLabel, session }] of sessionById) {
            if (selectedIds.has(sessionId)) {
              items.push({
                dayLabel,
                endsAt: session.endsAt,
                id: session.id,
                room: session.room,
                startsAt: session.startsAt,
                title: session.title,
              });
            }
          }

          return query({ latency: '130 millis', value: items });
        }),
      ),
      conference: query({ latency: '80 millis', value: conference }),
      schedule: Effect.fn('ConferenceRepository.schedule')(function* (day: ConferenceDay) {
        const selectedIds = MutableRef.get(selectedSessionIds);
        const definition = schedules[day];
        const value: Schedule = {
          ...definition,
          sessions: definition.sessions.map((session) => ({
            ...session,
            isInAgenda: selectedIds.has(session.id),
          })),
        };

        return yield* query({ latency: '2 seconds', value });
      }),
      speaker: Effect.fn('ConferenceRepository.speaker')(function* (speakerId: string) {
        const definition = speakers.get(speakerId);
        if (definition === undefined) {
          return yield* Effect.die(new Error(`Unknown conference speaker "${speakerId}".`));
        }

        return yield* query({
          latency: definition.latency,
          value: definition.speaker,
        });
      }),
      toggleAgenda: Effect.fn('ConferenceRepository.toggleAgenda')(function* (sessionId: string) {
        if (!sessionById.has(sessionId)) {
          return null;
        }

        return yield* Effect.sync(() => {
          const selectedIds = MutableRef.get(selectedSessionIds);
          const nextSelectedIds = new Set(selectedIds);
          const selected = !nextSelectedIds.has(sessionId);
          if (selected) {
            nextSelectedIds.add(sessionId);
          } else {
            nextSelectedIds.delete(sessionId);
          }

          MutableRef.set(selectedSessionIds, nextSelectedIds);
          return { selected };
        });
      }),
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
