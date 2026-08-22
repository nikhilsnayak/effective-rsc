import { Clock, Context, Duration, Effect, Layer } from 'effect';

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
  readonly room: string;
  readonly speaker: string;
  readonly speakerRole: string;
  readonly startsAt: string;
  readonly title: string;
  readonly track: 'Architecture' | 'Craft' | 'Platform';
};

export type Schedule = {
  readonly date: string;
  readonly day: ConferenceDay;
  readonly label: string;
  readonly sessions: ReadonlyArray<Session>;
};

export type AgendaItem = Pick<Session, 'endsAt' | 'id' | 'room' | 'startsAt' | 'title'> & {
  readonly dayLabel: string;
};

export type NavigationItem = {
  readonly day: ConferenceDay;
  readonly href: string;
  readonly label: string;
  readonly shortDate: string;
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
        speaker: 'Nikhil Nayak',
        speakerRole: 'Creator, effective-rsc',
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
        speaker: 'Maya Iyer',
        speakerRole: 'Runtime engineer',
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
        speaker: 'Theo Martins',
        speakerRole: 'Browser platform engineer',
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
        speaker: 'Leena Shah',
        speakerRole: 'Design engineer',
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
        speaker: 'Rohan Mehta',
        speakerRole: 'Framework engineer',
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
        speaker: 'Anika Rao',
        speakerRole: 'Type systems researcher',
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
        speaker: 'Jonah Kim',
        speakerRole: 'Web platform lead',
        startsAt: '12:00',
        title: 'The browser is the platform',
        track: 'Platform',
      },
    ],
  },
} as const satisfies Record<ConferenceDay, Schedule>;

const navigation = [
  { day: 'saturday', href: '/', label: 'Saturday', shortDate: '22 Aug' },
  { day: 'sunday', href: '/schedule/day-two', label: 'Sunday', shortDate: '23 Aug' },
] as const satisfies ReadonlyArray<NavigationItem>;

const agenda = [
  {
    dayLabel: 'Saturday',
    endsAt: '10:15',
    id: 'server-components-from-first-principles',
    room: 'Auditorium',
    startsAt: '09:30',
    title: 'Server Components from first principles',
  },
  {
    dayLabel: 'Sunday',
    endsAt: '11:30',
    id: 'mutation-protocols-that-compose',
    room: 'Studio',
    startsAt: '10:45',
    title: 'Mutation protocols that compose',
  },
] as const satisfies ReadonlyArray<AgendaItem>;

export class ConferenceRepository extends Context.Service<ConferenceRepository>()(
  '@effective-rsc/example-kitchen-sink/conference/ConferenceRepository',
  {
    make: Effect.succeed({
      agenda: query({ latency: '130 millis', value: agenda }),
      conference: query({ latency: '80 millis', value: conference }),
      navigation: query({ latency: '90 millis', value: navigation }),
      schedule: Effect.fn('ConferenceRepository.schedule')(function* (day: ConferenceDay) {
        return yield* query({ latency: '220 millis', value: schedules[day] });
      }),
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
