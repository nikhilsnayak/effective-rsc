'use server';

import { Effect, Schema } from 'effect';

import { ActorERSC, CurrentActor } from '@/modules/fixture/actor';
import { FixtureService } from '@/modules/fixture/service';

export type SelectionMutationState = {
  readonly message: string;
  readonly selected: boolean | null;
  readonly status: 'error' | 'success';
};

type ToggleSelectionSuccess = {
  readonly _tag: 'Success';
  readonly result: { readonly selected: boolean } | null;
};

type ToggleSelectionUnavailable = {
  readonly _tag: 'Unavailable';
};

const ToggleSelectionInput = Schema.Struct({
  itemId: Schema.NonEmptyString,
});

export const toggleSelection = ActorERSC.ServerFn.make({
  input: ToggleSelectionInput,
  handler: Effect.fn('toggleSelection')(function* ({ itemId }) {
    const actor = yield* CurrentActor;
    const service = yield* FixtureService;
    const outcome = yield* service.toggleSelection(itemId).pipe(
      Effect.map((result): ToggleSelectionSuccess => ({ result, _tag: 'Success' })),
      Effect.catchTag('@effective-rsc/framework-e2e/fixture/FixtureUnavailable', () =>
        Effect.succeed<ToggleSelectionUnavailable>({ _tag: 'Unavailable' }),
      ),
    );

    if (outcome._tag === 'Unavailable') {
      return {
        message: 'The fixture selection could not be updated. Please try again.',
        selected: null,
        status: 'error',
      } satisfies SelectionMutationState;
    }

    const { result } = outcome;

    const selection = actor.name === null ? 'the selection' : `${actor.name}'s selection`;

    return result === null
      ? ({
          message: 'That item is no longer available.',
          selected: null,
          status: 'error',
        } satisfies SelectionMutationState)
      : ({
          message: result.selected ? `Added to ${selection}.` : `Removed from ${selection}.`,
          selected: result.selected,
          status: 'success',
        } satisfies SelectionMutationState);
  }),
});
