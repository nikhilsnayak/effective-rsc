import { describe, expect, it } from '@effect/vitest';
import { Effect, Fiber, Layer } from 'effect';
import { TestClock } from 'effect/testing';
import { SqlError, UnknownError } from 'effect/unstable/sql/SqlError';

import { ConferenceRepository } from '../../src/modules/conference/repository';
import { ConferenceService } from '../../src/modules/conference/service';

const RepositoryLayer = ConferenceRepository.layerTest({
  selectedSessionIds: Effect.succeed(new Set(['server-components-from-first-principles'])),
  toggleAgenda: (sessionId) => Effect.succeed({ selected: sessionId.length > 0 }),
});
const ServiceLayer = ConferenceService.layer.pipe(Layer.provide(RepositoryLayer));

describe('ConferenceService', () => {
  it.effect('joins SQL-owned agenda membership into conference domain models', () =>
    Effect.gen(function* () {
      const service = yield* ConferenceService;
      const agendaFiber = yield* Effect.forkChild(service.agenda);
      const scheduleFiber = yield* Effect.forkChild(service.schedule('saturday'));

      yield* TestClock.adjust('2 seconds');

      const agenda = yield* Fiber.join(agendaFiber);
      const schedule = yield* Fiber.join(scheduleFiber);

      expect(agenda.data.map((item) => item.id)).toEqual([
        'server-components-from-first-principles',
      ]);
      expect(schedule.data.sessions[0]?.isInAgenda).toBe(true);
      expect(schedule.data.sessions[1]?.isInAgenda).toBe(false);
      const missingSession = yield* service.toggleAgenda('missing-session');
      expect(missingSession).toBeNull();
    }).pipe(Effect.provide(ServiceLayer)),
  );

  it.effect('maps repository failures to the domain error', () =>
    Effect.gen(function* () {
      const failure = new SqlError({
        reason: new UnknownError({ cause: new Error('database unavailable') }),
      });
      const serviceLayer = ConferenceService.layer.pipe(
        Layer.provide(
          ConferenceRepository.layerTest({
            selectedSessionIds: Effect.fail(failure),
          }),
        ),
      );
      const error = yield* Effect.gen(function* () {
        const service = yield* ConferenceService;
        return yield* service.agenda;
      }).pipe(Effect.provide(serviceLayer), Effect.flip);

      expect(error._tag).toBe(
        '@effective-rsc/example-kitchen-sink/conference/ConferenceUnavailable',
      );
      expect(error.operation).toBe('load agenda');
    }),
  );
});
