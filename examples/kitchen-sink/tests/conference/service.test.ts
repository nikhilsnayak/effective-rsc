import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { SqlError, UnknownError } from 'effect/unstable/sql/SqlError';

import { ConferenceRepository } from '../../src/modules/conference/repository';
import { ConferenceService } from '../../src/modules/conference/service';

const RepositoryLayer = ConferenceRepository.layerTest({
  selectedSessionIds: Effect.succeed(new Set(['server-components-from-first-principles'])),
  toggleAgenda: (sessionId) => Effect.succeed({ selected: sessionId.length > 0 }),
});
const ServiceLayer = ConferenceService.layer.pipe(Layer.provide(RepositoryLayer));

describe('ConferenceService', () => {
  it.live('joins SQL-owned agenda membership into conference domain models', () =>
    Effect.gen(function* () {
      const service = yield* ConferenceService;
      const agenda = yield* service.agenda;
      const schedule = yield* service.schedule('saturday');

      expect(agenda.data.map((item) => item.id)).toEqual([
        'server-components-from-first-principles',
      ]);
      expect(schedule.data.sessions[0]?.isInAgenda).toBe(true);
      expect(schedule.data.sessions[1]?.isInAgenda).toBe(false);
      expect(yield* service.toggleAgenda('missing-session')).toBeNull();
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
      const exit = yield* Effect.gen(function* () {
        const service = yield* ConferenceService;
        return yield* service.agenda;
      }).pipe(Effect.provide(serviceLayer), Effect.exit);

      expect(exit._tag).toBe('Failure');
      if (exit._tag === 'Failure') {
        expect(exit.cause.toString()).toContain('ConferenceUnavailable');
      }
    }),
  );
});
