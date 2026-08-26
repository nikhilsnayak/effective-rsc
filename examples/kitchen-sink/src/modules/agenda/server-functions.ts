'use server';

import { Effect, Schema } from 'effect';

import { ERSC } from '@/ersc';
import { ConferenceService } from '@/modules/conference/service';

export type AgendaMutationState = {
  readonly message: string;
  readonly selected: boolean | null;
  readonly status: 'error' | 'success';
};

type ToggleAgendaSuccess = {
  readonly _tag: 'Success';
  readonly result: { readonly selected: boolean } | null;
};

type ToggleAgendaUnavailable = {
  readonly _tag: 'Unavailable';
};

const ToggleAgendaInput = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export const toggleAgenda = ERSC.ServerFn.make({
  input: ToggleAgendaInput,
  handler: Effect.fn('toggleAgenda')(function* ({ sessionId }) {
    const service = yield* ConferenceService;
    const outcome = yield* service.toggleAgenda(sessionId).pipe(
      Effect.map((result): ToggleAgendaSuccess => ({ result, _tag: 'Success' })),
      Effect.catchTag('@effective-rsc/example-kitchen-sink/conference/ConferenceUnavailable', () =>
        Effect.succeed<ToggleAgendaUnavailable>({ _tag: 'Unavailable' }),
      ),
    );

    if (outcome._tag === 'Unavailable') {
      return {
        message: 'The conference agenda could not be updated. Please try again.',
        selected: null,
        status: 'error',
      } satisfies AgendaMutationState;
    }

    const { result } = outcome;

    return result === null
      ? ({
          message: 'That session is no longer available.',
          selected: null,
          status: 'error',
        } satisfies AgendaMutationState)
      : ({
          message: result.selected ? 'Added to the agenda.' : 'Removed from the agenda.',
          selected: result.selected,
          status: 'success',
        } satisfies AgendaMutationState);
  }),
});
