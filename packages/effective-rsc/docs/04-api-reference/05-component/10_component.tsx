/**
 * @title An Effectful Server Component
 *
 * Use Effect to render a Server Component with typed props.
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
