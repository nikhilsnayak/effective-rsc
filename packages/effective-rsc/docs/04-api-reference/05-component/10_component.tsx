/**
 * @title An Effectful Server Component
 *
 * Component runs its render Effect in the current ERSC request scope.
 */
import { Effect } from 'effect';
import { Application } from 'effective-rsc';

const ERSC = Application.ersc();

export const ExchangeRate = ERSC.Component.make({
  render: ({ euros }: { readonly euros: number }) =>
    Effect.succeed(
      <p>
        €{euros} is approximately ${(euros * 1.17).toFixed(2)}
      </p>,
    ),
});
