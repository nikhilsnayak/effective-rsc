import { Clock, Context, type Duration, Effect, Layer } from 'effect';

import { conference, schedules, sessionById, speakers } from './data';
import {
  type AgendaItem,
  type ConferenceDay,
  ConferenceUnavailable,
  type ObservedQuery,
  type Schedule,
} from './model';
import { ConferenceRepository } from './repository';

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

const unavailable = (operation: string) =>
  Effect.mapError(() => new ConferenceUnavailable({ operation }));

export class ConferenceService extends Context.Service<ConferenceService>()(
  '@effective-rsc/example-kitchen-sink/conference/ConferenceService',
  {
    make: Effect.gen(function* () {
      const repository = yield* ConferenceRepository;

      return {
        agenda: repository.selectedSessionIds.pipe(
          unavailable('load agenda'),
          Effect.flatMap((selectedIds) => {
            const items: Array<AgendaItem> = [];
            for (const [sessionId, { calendarDate, dayLabel, session }] of sessionById) {
              if (selectedIds.has(sessionId)) {
                items.push({
                  calendarDate,
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
        schedule: Effect.fn('ConferenceService.schedule')(function* (day: ConferenceDay) {
          const selectedIds = yield* repository.selectedSessionIds.pipe(
            unavailable('load schedule'),
          );
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
        speaker: Effect.fn('ConferenceService.speaker')(function* (speakerId: string) {
          const definition = speakers.get(speakerId);
          if (definition === undefined) {
            return yield* Effect.die(new Error(`Unknown conference speaker "${speakerId}".`));
          }

          return yield* query({
            latency: definition.latency,
            value: definition.speaker,
          });
        }),
        toggleAgenda: Effect.fn('ConferenceService.toggleAgenda')(function* (sessionId: string) {
          if (!sessionById.has(sessionId)) {
            return null;
          }

          return yield* repository.toggleAgenda(sessionId).pipe(unavailable('update agenda'));
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
