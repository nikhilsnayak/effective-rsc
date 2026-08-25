'use server';

import { Effect, Schema } from 'effect';

import { ERSC } from '@/ersc';
import { ConferenceRepository } from '@/modules/conference/conference-repository';

export type AgendaMutationState = {
  readonly message: string;
  readonly selected: boolean | null;
  readonly status: 'error' | 'success';
};

const ToggleAgendaInput = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export const toggleAgenda = ERSC.ServerFn.make({
  input: ToggleAgendaInput,
  handler: Effect.fn('toggleAgenda')(function* ({ sessionId }) {
    const repository = yield* ConferenceRepository;
    const result = yield* repository.toggleAgenda(sessionId);

    return result === null
      ? ({
          message: 'That session is no longer available.',
          selected: null,
          status: 'error',
        } satisfies AgendaMutationState)
      : ({
          message: result.selected ? 'Added to your agenda.' : 'Removed from your agenda.',
          selected: result.selected,
          status: 'success',
        } satisfies AgendaMutationState);
  }),
});
