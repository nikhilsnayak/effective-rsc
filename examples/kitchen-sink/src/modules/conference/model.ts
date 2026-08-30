import { Schema } from 'effect';

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
  readonly calendarDate: string;
  readonly date: string;
  readonly day: ConferenceDay;
  readonly label: string;
  readonly sessions: ReadonlyArray<Session>;
};

export type SessionDefinition = Omit<Session, 'isInAgenda'>;

export type ScheduleDefinition = Omit<Schedule, 'sessions'> & {
  readonly sessions: ReadonlyArray<SessionDefinition>;
};

export type AgendaItem = Pick<Session, 'endsAt' | 'id' | 'room' | 'startsAt' | 'title'> & {
  readonly calendarDate: string;
  readonly dayLabel: string;
};

export type ObservedQuery<Value> = {
  readonly completedAt: number;
  readonly data: Value;
  readonly startedAt: number;
};

export class ConferenceUnavailable extends Schema.TaggedError<ConferenceUnavailable>()(
  '@effective-rsc/example-kitchen-sink/conference/ConferenceUnavailable',
  { operation: Schema.String },
) {}
