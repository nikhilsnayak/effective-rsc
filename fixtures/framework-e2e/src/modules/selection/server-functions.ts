'use server';

import { Effect, Schema } from 'effect';

import { ActorERSC, CurrentActor } from '@/modules/fixture/actor';
import { FixtureService } from '@/modules/fixture/service';

const SelectionMutationState = Schema.Struct({
  message: Schema.String,
  selected: Schema.NullOr(Schema.Boolean),
  status: Schema.Literals(['error', 'success']),
});
export type SelectionMutationState = typeof SelectionMutationState.Type;

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
  input: [Schema.NullOr(SelectionMutationState), Schema.fromFormData(ToggleSelectionInput)],
  handler: Effect.fn('toggleSelection')(function* (_previousState, { itemId }) {
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
